/**
 * OBS 上的 OpenClaw 轨迹读取服务。
 *
 * 负责把「一个轨迹目录」翻译成 trajectory-viewer 需要的结构：
 *   <task>/
 *     agents/<agent>/sessions/<session>.jsonl       消息流
 *     agents/<agent>/sessions/<session>.trajectory.jsonl  系统提示 / trace
 *     logs/trajectories/<run>/query1.json           任务 query
 *     logs/traj_stats_result.json                   统计
 *     workspace/**\/*.html                          交付物
 *
 * 只读，不写 OBS。缓存只是进程内的短 TTL 加速。
 */

import { stripLogNoise } from './obsutil.mjs';
import {
  claudeSessionEventsToMessages,
  collectHtmlDeliverables,
  collectWorkspaceFiles,
  dshSessionEventsToMessages,
  extractDshSystemPrompt,
  extractSystemPrompt,
  mergeConsecutiveAssistantMessages,
  parseJsonLines,
  prependSystemPrompt,
  sessionEventsToMessages,
  summarizeQuery,
} from './trajectory.mjs';

const OVERVIEW_TTL = 30_000;
const AGENT_TTL = 5 * 60_000;
const MAX_SESSION_BYTES = 64 * 1024 * 1024;
const MAX_TRACE_BYTES = 64 * 1024 * 1024;
const MAX_RECURSIVE_PAGES = 40;
const MAX_AGENT_CACHE = 6;
const MAX_SIGNED_CACHE = 500;

function joinFolder(base, name) {
  return `${base.replace(/\/+$/, '')}/${name}/`;
}

function joinObject(base, name) {
  return `${base.replace(/\/+$/, '')}/${name}`;
}

function displayName(folderPath) {
  const clean = String(folderPath).replace(/\/+$/, '');
  return clean.split('/').pop() || clean;
}

function mapLimit(items, limit, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  return Promise.all(workers);
}

function sortByModifiedDesc(a, b) {
  return String(b.modified || '').localeCompare(String(a.modified || ''));
}

export class TrajectoryService {
  constructor(obs) {
    this.obs = obs;
    this.overviewCache = new Map();
    this.agentCache = new Map();
    this.signedCache = new Map();
  }

  /** 读取文本对象；obsutil cat 的日志噪声统一剥掉 */
  async readTextObject(objectPath, maxBytes = MAX_SESSION_BYTES) {
    const { stdout } = await this.obs.run(['cat', objectPath], {
      timeoutMs: 90_000,
      maxBytes,
    });
    return stripLogNoise(stdout).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  }

  async readJsonObject(objectPath, maxBytes = 4 * 1024 * 1024) {
    try {
      const text = await this.readTextObject(objectPath, maxBytes);
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /** 递归列出前缀下所有对象（-s），带页数/数量上限 */
  async listRecursive(folderPath, { limit = 1000, maxPages = MAX_RECURSIVE_PAGES } = {}) {
    const objects = [];
    let marker = null;
    let pages = 0;
    let truncated = false;

    while (pages < maxPages) {
      const page = await this.obs.listBrief(folderPath, { marker, limit });
      pages += 1;
      objects.push(...page.objects);
      if (!page.nextMarker) break;
      if (page.nextMarker === marker) break;
      marker = page.nextMarker;
      if (pages >= maxPages) truncated = true;
    }

    return { objects, pages, truncated };
  }

  /** 列出 agents/<agent>/sessions 下的会话文件 */
  async listAgents(folderPath) {
    const agentsRoot = joinFolder(folderPath, 'agents');
    let listing;
    try {
      listing = await this.obs.list(agentsRoot, { limit: 200 });
    } catch {
      return { agents: [], sessions: [] };
    }

    const agents = await Promise.all(
      listing.folders.map(async (agentFolder) => {
        const agentName = agentFolder.name;
        let sessionsListing = null;
        try {
          sessionsListing = await this.obs.list(joinFolder(agentFolder.path, 'sessions'), { limit: 1000 });
        } catch {
          sessionsListing = null;
        }
        const sessionObjects = (sessionsListing?.objects ?? []).filter(
          (object) => /\.jsonl$/i.test(object.name) && !/\.trajectory\.jsonl$/i.test(object.name),
        );
        const traceNames = new Set(
          (sessionsListing?.objects ?? [])
            .filter((object) => /\.trajectory\.jsonl$/i.test(object.name))
            .map((object) => object.name),
        );
        const sessions = sessionObjects.map((object) => ({
          provider: 'openclaw',
          agent: agentName,
          project: null,
          id: object.name.replace(/\.jsonl$/i, ''),
          file: object.name,
          path: object.path,
          sizeBytes: object.sizeBytes,
          modified: object.modified,
          hasTrace: traceNames.has(object.name.replace(/\.jsonl$/i, '.trajectory.jsonl')),
        }));
        sessions.sort(sortByModifiedDesc);
        return { name: agentName, path: agentFolder.path, provider: 'openclaw', project: null, sessions };
      }),
    );

    agents.sort((a, b) => a.name.localeCompare(b.name));
    const sessions = agents
      .flatMap((agent) => agent.sessions)
      .sort((a, b) => sortByModifiedDesc(a, b) || a.agent.localeCompare(b.agent));
    return { agents, sessions };
  }


  /** 列出 Claude Code 的 projects/<project>/<session>.jsonl 会话 */
  async listClaudeProjects(folderPath) {
    const projectsRoot = joinFolder(folderPath, 'projects');
    let listing;
    try {
      listing = await this.obs.list(projectsRoot, { limit: 200 });
    } catch {
      return { agents: [], sessions: [] };
    }

    const groups = await Promise.all(
      listing.folders.map(async (projectFolder) => {
        const project = projectFolder.name;
        const agentName = /evaluator/i.test(project) ? 'evaluator' : 'main';
        let sessionsListing = null;
        try {
          sessionsListing = await this.obs.list(projectFolder.path, { limit: 1000 });
        } catch {
          sessionsListing = null;
        }
        const sessions = (sessionsListing?.objects ?? [])
          .filter((object) => /\.jsonl$/i.test(object.name))
          .map((object) => ({
            provider: 'claude-code',
            agent: agentName,
            project,
            id: object.name.replace(/\.jsonl$/i, ''),
            file: object.name,
            path: object.path,
            sizeBytes: object.sizeBytes,
            modified: object.modified,
            hasTrace: false,
          }));
        sessions.sort(sortByModifiedDesc);
        return { name: agentName, path: projectFolder.path, provider: 'claude-code', project, sessions };
      }),
    );

    // 同一 agent 可能对应多个 project 目录，合并为侧栏的一个 agent 分组
    const byAgent = new Map();
    for (const group of groups) {
      const existing = byAgent.get(group.name);
      if (existing) {
        existing.sessions.push(...group.sessions);
        existing.projects.push(group.project);
      } else {
        byAgent.set(group.name, { ...group, projects: [group.project] });
      }
    }
    const agents = [...byAgent.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const agent of agents) agent.sessions.sort(sortByModifiedDesc);

    const sessions = agents
      .flatMap((agent) => agent.sessions)
      .sort((a, b) => sortByModifiedDesc(a, b) || a.agent.localeCompare(b.agent));
    return { agents, sessions };
  }


  /** 列出 DSH 的 logs/dsh_harness/home/sessions/<agent>/.../session.jsonl */
  async listDshSessions(folderPath) {
    const root = joinFolder(joinFolder(folderPath, 'logs'), 'dsh_harness/home/sessions');
    let recursive;
    try {
      recursive = await this.listRecursive(root);
    } catch {
      return { agents: [], sessions: [] };
    }

    const sessionObjects = recursive.objects.filter(
      (object) => object.path.startsWith(root) && /(^|\/)session\.jsonl$/i.test(object.path),
    );
    const collected = [];
    await mapLimit(sessionObjects, 4, async (object) => {
      const relative = object.path.slice(root.length);
      const project = relative.replace(/\/?session\.jsonl$/i, '').replace(/^\/+|\/+$/g, '');
      const segments = project.split('/').filter(Boolean);
      if (!segments.length) return;
      let stat = null;
      try {
        stat = await this.obs.stat(object.path);
      } catch {
        stat = null;
      }
      let counts = null;
      try {
        const text = await this.readTextObject(object.path);
        const lines = text.split('\n');
        counts = {
          assistantRounds: lines.filter((line) => line.includes('"type":"assistant/message"')).length,
          toolCalls: lines.filter((line) => line.includes('"type":"tool/result"')).length,
        };
      } catch {
        counts = null;
      }
      collected.push({
        provider: 'dsh',
        agent: segments[0],
        project,
        id: segments[segments.length - 1],
        file: 'session.jsonl',
        path: object.path,
        sizeBytes: stat?.sizeBytes ?? null,
        modified: stat?.modified ?? null,
        hasTrace: false,
        counts,
      });
    });

    const byAgent = new Map();
    for (const session of collected) {
      const existing = byAgent.get(session.agent);
      if (existing) {
        existing.sessions.push(session);
        existing.projects.push(session.project);
      } else {
        byAgent.set(session.agent, {
          name: session.agent,
          path: root,
          provider: 'dsh',
          project: session.project,
          projects: [session.project],
          sessions: [session],
        });
      }
    }
    const agents = [...byAgent.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const agent of agents) agent.sessions.sort(sortByModifiedDesc);
    const sessions = agents
      .flatMap((agent) => agent.sessions)
      .sort((a, b) => sortByModifiedDesc(a, b) || a.agent.localeCompare(b.agent));
    return { agents, sessions };
  }

  /** 读取 logs/trajectories/<latest>/query1.json + traj_stats_result.json */
  async listRuns(folderPath) {
    const trajectoriesRoot = joinFolder(joinFolder(folderPath, 'logs'), 'trajectories');
    let runFolders = [];
    try {
      const listing = await this.obs.list(trajectoriesRoot, { limit: 200 });
      runFolders = listing.folders.map((folder) => folder.name).sort((a, b) => b.localeCompare(a));
    } catch {
      runFolders = [];
    }

    const latest = runFolders[0] ?? null;
    let queryPayload = null;
    if (latest) {
      queryPayload = await this.readJsonObject(joinObject(joinFolder(trajectoriesRoot, latest), 'query1.json'));
      if (!queryPayload) {
        // 兼容 query1.json 改名的情况：退而求其次找 run 目录下第一个 .json
        try {
          const runListing = await this.obs.list(joinFolder(trajectoriesRoot, latest), { limit: 100 });
          const candidate = runListing.objects.find((object) => /\.json$/i.test(object.name));
          if (candidate) queryPayload = await this.readJsonObject(candidate.path);
        } catch {
          queryPayload = null;
        }
      }
    }

    const stats = await this.readJsonObject(joinObject(joinFolder(folderPath, 'logs'), 'traj_stats_result.json'));

    // DSH 没有 logs/trajectories/query1.json，query 在 logs/<run>.log 的 [Q] 行里
    if (!queryPayload && typeof stats?.log_file === 'string') {
      try {
        const logText = await this.readTextObject(joinObject(folderPath, stats.log_file.replace(/^\/+/, '')));
        const line = logText.split('\n').find((item) => /\[Q\d*\]/.test(item));
        const query = line?.slice(line.indexOf(']', line.indexOf('[Q')) + 1).trim();
        if (query) queryPayload = { query, turns: [] };
      } catch {
        queryPayload = null;
      }
    }

    return {
      latest,
      list: runFolders.slice(0, 30),
      query: summarizeQuery(queryPayload),
      stats,
    };
  }

  /** 扫描 workspace / workspace-evaluator 下的文件与 HTML 交付物 */
  async listDeliverables(folderPath, subfolder, source) {
    const root = joinFolder(folderPath, subfolder);
    let recursive;
    try {
      recursive = await this.listRecursive(root);
    } catch {
      return { root, exists: false, totalObjects: 0, truncated: false, items: [], files: [], filesTruncated: false };
    }

    const allFiles = collectWorkspaceFiles(recursive.objects, root, source);
    // 文件树用于「看整个 workspace」；超大 workspace 只取前 2000 个，避免响应过大
    const files = allFiles.slice(0, 2000);
    const items = allFiles.filter((file) => file.isHtml).slice(0, 200);
    const statByPath = new Map(items.map((item) => [item.path, item]));

    // 只为 HTML 交付物补 stat；其他文件在树里仍可打开（大小显示为 —）
    await mapLimit(items.slice(0, 40), 6, async (item) => {
      try {
        const stat = await this.obs.stat(item.path);
        item.sizeBytes = stat.sizeBytes ?? item.sizeBytes;
        item.modified = stat.modified ?? item.modified;
      } catch {
        // 统计失败不影响交付物本身
      }
    });
    for (const file of files) {
      const enriched = statByPath.get(file.path);
      if (enriched) {
        file.sizeBytes = enriched.sizeBytes;
        file.modified = enriched.modified;
      }
    }

    return {
      root,
      exists: true,
      totalObjects: recursive.objects.length,
      truncated: recursive.truncated,
      filesTruncated: recursive.truncated || allFiles.length > files.length,
      items,
      files,
    };
  }

  rememberOverview(folderPath, value) {
    this.overviewCache.set(folderPath, { at: Date.now(), value });
    while (this.overviewCache.size > 100) {
      this.overviewCache.delete(this.overviewCache.keys().next().value);
    }
  }

  /** 轨迹目录总览 */
  async overview(folderPath) {
    const cached = this.overviewCache.get(folderPath);
    if (cached && Date.now() - cached.at < OVERVIEW_TTL) return cached.value;

    const rootListing = await this.obs.list(folderPath, { limit: 1000 });
    const folderNames = new Set(rootListing.folders.map((folder) => folder.name));
    const hasAgents = folderNames.has('agents');
    const hasProjects = folderNames.has('projects');
    const hasWorkspace = folderNames.has('workspace');

    if (!hasAgents && !hasProjects && !hasWorkspace) {
      const value = {
        ok: false,
        reason: 'not-trajectory',
        path: folderPath,
        name: displayName(folderPath),
        folders: rootListing.folders.map((folder) => folder.name),
        files: rootListing.objects.map((object) => object.name).slice(0, 50),
      };
      this.rememberOverview(folderPath, value);
      return value;
    }

    const [openclawListing, claudeListing, runs, workspace, evaluator] = await Promise.all([
      hasAgents ? this.listAgents(folderPath) : Promise.resolve({ agents: [], sessions: [] }),
      hasProjects ? this.listClaudeProjects(folderPath) : Promise.resolve({ agents: [], sessions: [] }),
      this.listRuns(folderPath),
      this.listDeliverables(folderPath, 'workspace', 'workspace'),
      this.listDeliverables(folderPath, 'workspace-evaluator', 'evaluator'),
    ]);

    const dshListing = runs.stats?.harness === 'dsh'
      ? await this.listDshSessions(folderPath)
      : { agents: [], sessions: [] };

    const agents = [
      ...openclawListing.agents,
      ...claudeListing.agents,
      ...dshListing.agents,
    ].sort((a, b) => a.name.localeCompare(b.name));
    const sessions = [
      ...openclawListing.sessions,
      ...claudeListing.sessions,
      ...dshListing.sessions,
    ].sort((a, b) => sortByModifiedDesc(a, b) || a.agent.localeCompare(b.agent));
    const firstDsh = dshListing.sessions[0] ?? null;
    let stats = runs.stats;
    let runInfo = runs;
    if (firstDsh?.counts) {
      if (stats) {
        const firstAgent = Array.isArray(stats.agents) ? stats.agents[0] : null;
        stats = {
          ...stats,
          agents: [
            {
              ...(firstAgent ?? {}),
              tool_calls: firstDsh.counts.toolCalls,
              assistant_rounds: firstDsh.counts.assistantRounds,
              has_trajectory: true,
            },
            ...(Array.isArray(stats.agents) ? stats.agents.slice(1) : []),
          ],
        };
      }
      runInfo = {
        ...runs,
        latest: firstDsh.id,
        list: dshListing.sessions.map((session) => session.id),
      };
    }
    const deliverables = [...workspace.items, ...evaluator.items];
    const files = [...workspace.files, ...evaluator.files];
    const value = {
      ok: true,
      path: folderPath,
      name: displayName(folderPath),
      generatedAt: Date.now(),
      hasAgents,
      hasProjects,
      hasDsh: dshListing.sessions.length > 0,
      hasWorkspace,
      agents,
      sessions,
      runs: runInfo,
      stats,
      workspace: {
        root: workspace.root,
        exists: workspace.exists,
        totalObjects: workspace.totalObjects,
        truncated: workspace.truncated,
        fileCount: workspace.files.length,
        filesTruncated: workspace.filesTruncated,
      },
      evaluator: {
        root: evaluator.root,
        exists: evaluator.exists,
        totalObjects: evaluator.totalObjects,
        truncated: evaluator.truncated,
        fileCount: evaluator.files.length,
        filesTruncated: evaluator.filesTruncated,
      },
      workspaceFiles: files,
      filesTruncated: workspace.filesTruncated || evaluator.filesTruncated,
      deliverables,
    };
    this.rememberOverview(folderPath, value);
    return value;
  }

  rememberAgent(sessionPath, value) {
    this.agentCache.set(sessionPath, { at: Date.now(), value });
    while (this.agentCache.size > MAX_AGENT_CACHE) {
      this.agentCache.delete(this.agentCache.keys().next().value);
    }
  }

  /** 读取并缓存一条 agent session；按 provider 分派 */
  async loadAgent(folderPath, { agent, session, provider = 'openclaw', project = null } = {}) {
    if (provider === 'claude-code') {
      return this.loadClaudeAgent(folderPath, { agent, session, project });
    }
    if (provider === 'dsh') {
      return this.loadDshAgent(folderPath, { agent, session, project });
    }
    return this.loadOpenClawAgent(folderPath, { agent, session });
  }

  async loadOpenClawAgent(folderPath, { agent, session }) {
    if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/.test(String(agent || ''))) {
      throw new Error('agent 名称不合法');
    }
    if (!/^[A-Za-z0-9._-]+\.jsonl$/i.test(String(session || '')) || /\.trajectory\.jsonl$/i.test(session)) {
      throw new Error('session 文件名不合法');
    }

    const sessionPath = joinObject(joinFolder(joinFolder(joinFolder(folderPath, 'agents'), agent), 'sessions'), session);
    const cached = this.agentCache.get(sessionPath);
    if (cached && Date.now() - cached.at < AGENT_TTL) return cached.value;

    const sessionText = await this.readTextObject(sessionPath);
    const parsed = parseJsonLines(sessionText);
    if (!parsed.events.length) throw new Error('该 session 没有可解析的消息');

    const tracePath = sessionPath.replace(/\.jsonl$/i, '.trajectory.jsonl');
    let traceText = null;
    let traceEvents = [];
    try {
      traceText = await this.readTextObject(tracePath, MAX_TRACE_BYTES);
      traceEvents = parseJsonLines(traceText).events;
    } catch {
      traceEvents = [];
    }

    const systemPrompt = extractSystemPrompt(traceEvents);
    const messages = mergeConsecutiveAssistantMessages(
      prependSystemPrompt(sessionEventsToMessages(parsed.events), systemPrompt),
    );
    if (!messages.length) throw new Error('该 session 没有可展示的消息');

    const value = {
      provider: 'openclaw',
      project: null,
      folderPath,
      agent,
      session,
      sessionPath,
      tracePath,
      hasTrace: traceEvents.length > 0,
      traceText,
      sessionEvents: parsed.events,
      traceEvents,
      parseErrors: parsed.parseErrors,
      systemPrompt,
      messages,
    };
    this.rememberAgent(sessionPath, value);
    return value;
  }


  async loadDshAgent(folderPath, { agent, session, project }) {
    if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/.test(String(agent || ''))) {
      throw new Error('agent 名称不合法');
    }
    const projectSegments = String(project || '').split('/').filter(Boolean);
    if (
      !projectSegments.length ||
      projectSegments.some((segment) => !/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(segment))
    ) {
      throw new Error('DSH session 路径不合法');
    }
    if (!/^[A-Za-z0-9._-]+\.jsonl$/i.test(String(session || ''))) {
      throw new Error('session 文件名不合法');
    }

    const sessionsRoot = joinFolder(joinFolder(folderPath, 'logs'), 'dsh_harness/home/sessions');
    const sessionPath = joinObject(sessionsRoot, `${projectSegments.join('/')}/${session}`);
    const cached = this.agentCache.get(sessionPath);
    if (cached && Date.now() - cached.at < AGENT_TTL) return cached.value;

    const sessionText = await this.readTextObject(sessionPath);
    const parsed = parseJsonLines(sessionText);
    if (!parsed.events.length) throw new Error('该 DSH session 没有可解析的消息');

    const systemPrompt = extractDshSystemPrompt(parsed.events);
    const messages = mergeConsecutiveAssistantMessages(
      prependSystemPrompt(
        dshSessionEventsToMessages(parsed.events),
        systemPrompt,
        '系统提示 · DSH',
      ),
    );
    if (!messages.length) throw new Error('该 DSH session 没有可展示的消息');

    const value = {
      provider: 'dsh',
      project: projectSegments.join('/'),
      folderPath,
      agent,
      session,
      sessionPath,
      tracePath: null,
      hasTrace: false,
      traceText: null,
      sessionEvents: parsed.events,
      traceEvents: [],
      parseErrors: parsed.parseErrors,
      systemPrompt,
      messages,
    };
    this.rememberAgent(sessionPath, value);
    return value;
  }

  async loadClaudeAgent(folderPath, { agent, session, project }) {
    if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/.test(String(agent || ''))) {
      throw new Error('agent 名称不合法');
    }
    if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,199}$/.test(String(project || ''))) {
      throw new Error('Claude project 名称不合法');
    }
    if (!/^[A-Za-z0-9._-]+\.jsonl$/i.test(String(session || ''))) {
      throw new Error('session 文件名不合法');
    }

    const sessionPath = joinObject(joinFolder(joinFolder(folderPath, 'projects'), project), session);
    const cached = this.agentCache.get(sessionPath);
    if (cached && Date.now() - cached.at < AGENT_TTL) return cached.value;

    const sessionText = await this.readTextObject(sessionPath);
    const parsed = parseJsonLines(sessionText);
    if (!parsed.events.length) throw new Error('该 Claude Code session 没有可解析的消息');

    const messages = mergeConsecutiveAssistantMessages(claudeSessionEventsToMessages(parsed.events));
    if (!messages.length) throw new Error('该 Claude Code session 没有可展示的消息');

    const value = {
      provider: 'claude-code',
      project,
      folderPath,
      agent,
      session,
      sessionPath,
      tracePath: null,
      hasTrace: false,
      traceText: null,
      sessionEvents: parsed.events,
      traceEvents: [],
      parseErrors: parsed.parseErrors,
      systemPrompt: null,
      messages,
    };
    this.rememberAgent(sessionPath, value);
    return value;
  }

  async messages(folderPath, { agent, session, provider = 'openclaw', project = null, from = 0, limit = 300 } = {}) {
    const data = await this.loadAgent(folderPath, { agent, session, provider, project });
    const start = Math.max(0, Number.parseInt(from, 10) || 0);
    const size = Math.min(300, Math.max(1, Number.parseInt(limit, 10) || 300));
    const slice = data.messages.slice(start, start + size);
    return {
      provider: data.provider,
      project: data.project,
      agent,
      session,
      from: start,
      returned: slice.length,
      total: data.messages.length,
      has_more: start + slice.length < data.messages.length,
      messages: slice,
    };
  }

  /** 原数据视图：session 原始事件 + trace 摘要（去掉体积最大的 model.completed 快照） */
  async raw(folderPath, { agent, session, provider = 'openclaw', project = null } = {}) {
    const data = await this.loadAgent(folderPath, { agent, session, provider, project });
    const overviewValue = this.overviewCache.get(folderPath)?.value;
    return {
      provider: data.provider,
      project: data.project,
      folderPath,
      agent,
      session,
      sessionFile: data.sessionPath,
      traceFile: data.hasTrace ? data.tracePath : null,
      systemPrompt: data.systemPrompt,
      parseErrors: data.parseErrors,
      sessionEvents: data.sessionEvents,
      traceEvents: data.traceEvents.filter((event) => event?.type !== 'model.completed'),
      query: overviewValue?.runs?.query ?? null,
      stats: overviewValue?.stats ?? null,
    };
  }

  /** 对象签名 URL（缓存到接近过期，避免每个 HTML 资源都重新 sign） */
  async signedUrl(objectPath) {
    const cached = this.signedCache.get(objectPath);
    const now = Date.now();
    if (cached && cached.expiresAt > now + 15_000) return cached.url;

    const url = await this.obs.sign(objectPath, 300);
    this.signedCache.set(objectPath, { url, expiresAt: now + 240_000 });
    while (this.signedCache.size > MAX_SIGNED_CACHE) {
      this.signedCache.delete(this.signedCache.keys().next().value);
    }
    return url;
  }
}

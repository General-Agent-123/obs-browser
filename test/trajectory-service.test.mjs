import test from 'node:test';
import assert from 'node:assert/strict';
import { TrajectoryService } from '../src/trajectory-service.mjs';

const ROOT = 'obs://bucket/task/';

const SESSION = [
  JSON.stringify({ type: 'session', id: 's1' }),
  JSON.stringify({
    type: 'message',
    message: { role: 'user', content: '帮我做一个页面' },
  }),
  JSON.stringify({
    type: 'message',
    message: {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '先读文件' },
        { type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'a.md' } },
      ],
    },
  }),
  JSON.stringify({
    type: 'message',
    message: { role: 'toolResult', toolCallId: 'call_1', content: [{ type: 'text', text: 'OK' }] },
  }),
].join('\n');

const TRACE = [
  JSON.stringify({ type: 'session.started' }),
  JSON.stringify({ type: 'context.compiled', data: { systemPrompt: '你是 OpenClaw。' } }),
  JSON.stringify({ type: 'model.completed', data: { messagesSnapshot: [] } }),
].join('\n');

class FakeObs {
  constructor() {
    this.files = {
      [`${ROOT}agents/main/sessions/s1.jsonl`]: SESSION,
      [`${ROOT}agents/main/sessions/s1.trajectory.jsonl`]: TRACE,
      [`${ROOT}logs/trajectories/run1/query1.json`]: JSON.stringify({
        query: '帮我做一个页面',
        agent_name: 'main',
        turns: [{ turn: 1, user_input: '帮我做一个页面', agent_content: '完成' }],
      }),
      [`${ROOT}logs/traj_stats_result.json`]: JSON.stringify({
        task_level: 'L1.5',
        agents: [{ tool_calls: 1, assistant_rounds: 1, total_tokens: 100 }],
      }),
    };
    this.listings = {
      [ROOT]: {
        folders: [
          { name: 'agents', path: `${ROOT}agents/`, type: 'folder' },
          { name: 'logs', path: `${ROOT}logs/`, type: 'folder' },
          { name: 'workspace', path: `${ROOT}workspace/`, type: 'folder' },
        ],
        objects: [],
      },
      [`${ROOT}agents/`]: {
        folders: [{ name: 'main', path: `${ROOT}agents/main/`, type: 'folder' }],
        objects: [],
      },
      [`${ROOT}agents/main/sessions/`]: {
        folders: [],
        objects: [
          { name: 's1.jsonl', path: `${ROOT}agents/main/sessions/s1.jsonl`, type: 'file', sizeBytes: 100, modified: '2026-10-23T00:00:00Z' },
          { name: 's1.trajectory.jsonl', path: `${ROOT}agents/main/sessions/s1.trajectory.jsonl`, type: 'file', sizeBytes: 100, modified: '2026-10-23T00:00:00Z' },
        ],
      },
      [`${ROOT}logs/trajectories/`]: {
        folders: [{ name: 'run1', path: `${ROOT}logs/trajectories/run1/`, type: 'folder' }],
        objects: [],
      },
    };
  }

  async run(args) {
    if (args[0] !== 'cat') throw new Error(`unexpected command ${args[0]}`);
    const content = this.files[args[1]];
    if (content == null) throw new Error('object not found');
    return { stdout: content, stderr: '', code: 0 };
  }

  async list(folder) {
    const listing = this.listings[folder];
    if (!listing) throw new Error('folder not found');
    return listing;
  }

  async listBrief(folder) {
    if (folder === `${ROOT}workspace/`) {
      return {
        objects: [
          { path: `${ROOT}workspace/page/index.html`, name: 'index.html' },
          { path: `${ROOT}workspace/.git/ignored.html`, name: 'ignored.html' },
          { path: `${ROOT}workspace/page/app.js`, name: 'app.js' },
        ],
        nextMarker: null,
      };
    }
    throw new Error('folder not found');
  }

  async stat(objectPath) {
    if (objectPath.endsWith('index.html')) return { sizeBytes: 1234, modified: '2026-10-23T00:00:00Z' };
    throw new Error('object not found');
  }

  async sign(objectPath) {
    return `https://signed.example/${encodeURIComponent(objectPath)}`;
  }
}

test('TrajectoryService overview/messages/raw work against an OBS-like source', async () => {
  const service = new TrajectoryService(new FakeObs());
  const overview = await service.overview(ROOT);

  assert.equal(overview.ok, true);
  assert.equal(overview.sessions.length, 1);
  assert.equal(overview.sessions[0].agent, 'main');
  assert.equal(overview.sessions[0].hasTrace, true);
  assert.equal(overview.runs.latest, 'run1');
  assert.equal(overview.runs.query.query, '帮我做一个页面');
  assert.equal(overview.stats.task_level, 'L1.5');
  assert.deepEqual(overview.deliverables.map((item) => item.displayPath), ['page/index.html']);
  assert.equal(overview.deliverables[0].sizeBytes, 1234);
  assert.equal(overview.workspace.totalObjects, 3);
  assert.equal(overview.workspace.fileCount, 2);
  assert.deepEqual(overview.workspaceFiles.map((item) => item.displayPath), ['page/app.js', 'page/index.html']);
  assert.equal(overview.workspaceFiles[1].sizeBytes, 1234);

  const page = await service.messages(ROOT, { agent: 'main', session: 's1.jsonl', from: 0, limit: 2 });
  assert.equal(page.total, 4);
  assert.equal(page.returned, 2);
  assert.equal(page.has_more, true);
  assert.equal(page.messages[0].role, 'system');
  assert.equal(page.messages[1].role, 'user');

  const rest = await service.messages(ROOT, { agent: 'main', session: 's1.jsonl', from: 2, limit: 10 });
  assert.equal(rest.returned, 2);
  assert.equal(rest.has_more, false);
  assert.equal(rest.messages[0].role, 'assistant');
  assert.equal(rest.messages[0].tool_calls[0].function.name, 'read');
  assert.equal(rest.messages[1].role, 'tool');

  const raw = await service.raw(ROOT, { agent: 'main', session: 's1.jsonl' });
  assert.equal(raw.sessionEvents.length, 4);
  assert.equal(raw.systemPrompt, '你是 OpenClaw。');
  assert.equal(raw.traceEvents.length, 2);
  assert.ok(raw.traceEvents.every((event) => event.type !== 'model.completed'));
});

test('TrajectoryService rejects a folder without agents/workspace', async () => {
  const obs = new FakeObs();
  obs.listings[ROOT].folders = [{ name: 'other', path: `${ROOT}other/`, type: 'folder' }];
  const service = new TrajectoryService(obs);
  const overview = await service.overview(ROOT);
  assert.equal(overview.ok, false);
  assert.equal(overview.reason, 'not-trajectory');
});

test('TrajectoryService validates agent and session names', async () => {
  const service = new TrajectoryService(new FakeObs());
  await assert.rejects(() => service.messages(ROOT, { agent: '../x', session: 's1.jsonl' }), /agent/);
  await assert.rejects(() => service.messages(ROOT, { agent: 'main', session: '../s1.jsonl' }), /session/);
});

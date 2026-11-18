import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const META_RE =
  /^\s+(\d{4}-\d{2}-\d{2}T\S+)\s+(\d+(?:\.\d+)?\s*(?:B|KB|MB|GB|TB|PB))\s+(\S+)\s+"?([^"\s]+)"?\s*$/i;

const TEXT_EXTENSIONS = new Set([
  'txt', 'text', 'md', 'markdown', 'rst', 'log', 'csv', 'tsv', 'json', 'jsonl',
  'ndjson', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'env', 'xml', 'html',
  'htm', 'css', 'scss', 'sass', 'less', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
  'vue', 'svelte', 'py', 'pyi', 'sh', 'bash', 'zsh', 'fish', 'rb', 'go', 'rs',
  'java', 'kt', 'kts', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'swift', 'm',
  'mm', 'sql', 'graphql', 'gql', 'dockerfile', 'makefile', 'tf', 'hcl', 'r',
  'jl', 'lua', 'pl', 'ex', 'exs', 'clj', 'scala', 'gradle', 'properties', 'gitignore',
]);

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac']);

export function stripLogNoise(value = '') {
  return String(value)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !/^Error: open .*\.obsutil_log\/[^ ]+: (?:operation not permitted|permission denied)$/i.test(line.trim()))
    .filter((line) => !/^Start at \d{4}-\d{2}-\d{2}[ T]/.test(line.trim()))
    .join('\n');
}

export function humanToBytes(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value ?? '').trim().match(/^([\d.]+)\s*([KMGTPE]?)(?:i?B)?$/i);
  if (!match) return 0;
  const amount = Number.parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const power = { '': 0, K: 1, M: 2, G: 3, T: 4, P: 5, E: 6 }[unit] ?? 0;
  return Math.round(amount * 1024 ** power);
}

export function extensionOf(name = '') {
  const clean = String(name).toLowerCase().replace(/\/$/, '');
  const base = clean.split('/').pop() ?? '';
  if (!base.includes('.')) return base === 'dockerfile' ? 'dockerfile' : '';
  return base.split('.').pop() ?? '';
}

export function classifyObject(name, contentType = '') {
  const ext = extensionOf(name);
  const mime = String(contentType).toLowerCase().split(';')[0].trim();

  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (mime.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (mime.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (ext === 'json' || ext === 'jsonl' || ext === 'ndjson' || mime.includes('json')) return 'json';
  if (mime.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) return 'text';
  return null;
}

export function parseNextMarker(output) {
  // obsutil 5.8 起输出 "Next marker:"，旧版为 "Next marker is:"，两种都要兼容
  const match = stripLogNoise(output).match(/^Next marker(?: is)?:\s*(.+?)\s*$/m);
  return match ? match[1] : null;
}

export function parseListOutput(output) {
  const clean = stripLogNoise(output);
  const folderHeader = clean.indexOf('Folder list:');
  const objectHeader = clean.indexOf('Object list:');
  const folderCountMatch = clean.match(/^Folder number:\s*(\d+)/m);
  const fileCountMatch = clean.match(/^File number:\s*(\d+)/m);

  let folderBlock = '';
  let objectBlock = '';

  if (objectHeader !== -1) {
    folderBlock = folderHeader !== -1 ? clean.slice(folderHeader + 'Folder list:'.length, objectHeader) : '';
    objectBlock = clean.slice(objectHeader + 'Object list:'.length);
  } else if (folderHeader !== -1) {
    folderBlock = clean.slice(folderHeader + 'Folder list:'.length);
  }

  objectBlock = objectBlock.split(/\n(?:Next marker(?: is)?:|Folder number:|File number:)/)[0];

  const folders = [];
  const seenFolders = new Set();
  for (const line of folderBlock.split('\n')) {
    const value = line.trim();
    if (!value.startsWith('obs://') || !value.endsWith('/')) continue;
    if (seenFolders.has(value)) continue;
    seenFolders.add(value);
    const withoutSlash = value.slice(0, -1);
    const name = withoutSlash.split('/').pop() ?? withoutSlash;
    folders.push({
      type: 'folder',
      name,
      path: value,
      ext: '',
    });
  }

  const objects = [];
  const seenObjects = new Set();
  const lines = objectBlock.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith('obs://')) continue;

    let key = line.trimEnd();
    let meta = null;
    let cursor = index + 1;

    while (cursor < lines.length && !lines[cursor].startsWith('obs://')) {
      const candidate = lines[cursor];
      const match = candidate.match(META_RE);
      if (match) {
        meta = match;
        cursor += 1;
        break;
      }
      if (!candidate.trim()) {
        cursor += 1;
        if (meta) break;
        continue;
      }
      // obsutil wraps exceptionally long keys onto indented continuation lines.
      if (/^\s{2,}\S/.test(candidate)) {
        key += candidate.trim();
        cursor += 1;
        continue;
      }
      break;
    }

    const cleanKey = key.trim();
    if (!cleanKey || seenObjects.has(cleanKey)) {
      index = Math.max(index, cursor - 1);
      continue;
    }
    seenObjects.add(cleanKey);

    const withoutSlash = cleanKey.endsWith('/') ? cleanKey.slice(0, -1) : cleanKey;
    const name = withoutSlash.split('/').pop() ?? withoutSlash;
    const modified = meta?.[1] ?? null;
    const sizeLabel = meta?.[2] ?? null;
    const sizeBytes = meta ? humanToBytes(meta[2]) : null;
    const storageClass = meta?.[3] ?? null;
    const etag = meta?.[4] ?? null;

    objects.push({
      type: 'file',
      name,
      path: cleanKey,
      ext: extensionOf(name),
      sizeBytes,
      sizeLabel,
      modified,
      storageClass,
      etag,
    });

    index = Math.max(index, cursor - 1);
  }

  return {
    folders,
    objects,
    nextMarker: parseNextMarker(clean),
    reportedFolderCount: folderCountMatch ? Number(folderCountMatch[1]) : null,
    reportedFileCount: fileCountMatch ? Number(fileCountMatch[1]) : null,
  };
}

export function parseBriefListOutput(output) {
  const clean = stripLogNoise(output);
  const objectHeader = clean.indexOf('Object list:');
  if (objectHeader === -1) {
    return { objects: [], nextMarker: parseNextMarker(clean) };
  }

  let objectBlock = clean.slice(objectHeader + 'Object list:'.length);
  objectBlock = objectBlock.split(/\n(?:Next marker(?: is)?:|Folder number:|File number:)/)[0];

  const objects = [];
  const seen = new Set();
  for (const line of objectBlock.split('\n')) {
    const value = line.trim();
    if (!value.startsWith('obs://') || value.endsWith('/') || seen.has(value)) continue;
    seen.add(value);
    const name = value.split('/').pop() ?? value;
    objects.push({
      type: 'file',
      name,
      path: value,
      ext: extensionOf(name),
    });
  }

  return { objects, nextMarker: parseNextMarker(clean) };
}

/**
 * 逐行统计当前层（`ls -d`）的文件夹和对象。
 * OBS 没有“统计前缀对象数”的接口，只能把当前层列举一遍；
 * 这里用流式计数，避免把几万行输出整个读进内存。
 */
export function createListingCounter(folderPath, { maxEntries = 100_000 } = {}) {
  const self = String(folderPath || '').replace(/\/+$/, '');
  const cap = Number.isFinite(maxEntries) && maxEntries > 0 ? Math.floor(maxEntries) : Infinity;
  let folders = 0;
  let objects = 0;
  let total = 0;
  let truncated = false;

  return {
    add(line) {
      if (truncated) return false;
      const value = String(line ?? '').trim();
      if (!value.startsWith('obs://')) return true;

      // obsutil 会在 Folder list 里带上当前目录自身，不能算作子项。
      if (value.replace(/\/+$/, '') === self) return true;

      if (value.endsWith('/')) folders += 1;
      else objects += 1;
      total += 1;

      if (total >= cap) {
        truncated = true;
        return false;
      }
      return true;
    },
    get result() {
      return { folders, objects, total, truncated, atLeast: truncated };
    },
  };
}

export function compileFilenameMatcher(query) {
  const value = String(query || '').trim();
  if (!value) return () => false;

  if (value.includes('*') || value.includes('?')) {
    const pattern = value
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replaceAll('*', '.*')
      .replaceAll('?', '.');
    const regex = new RegExp(`^${pattern}$`, 'i');
    return (name) => regex.test(String(name));
  }

  const needle = value.toLowerCase();
  return (name) => String(name).toLowerCase().includes(needle);
}

export function parseStatOutput(output) {
  const clean = stripLogNoise(output);
  const lines = clean.split('\n');
  const fields = {};
  let currentKey = null;

  for (const line of lines) {
    const label = line.match(/^([A-Za-z][A-Za-z0-9 _-]*):\s*$/);
    if (label) {
      currentKey = label[1];
      continue;
    }
    if (currentKey && line.trim()) {
      fields[currentKey] = line.trim();
      currentKey = null;
    }
  }

  const key = fields.Key ?? '';
  const name = key.replace(/\/$/, '').split('/').pop() ?? key;
  const sizeLabel = fields.Size ?? null;

  return {
    key,
    name,
    type: (fields.Type ?? 'file').toLowerCase(),
    sizeBytes: sizeLabel ? humanToBytes(sizeLabel) : null,
    sizeLabel,
    modified: fields.LastModified ?? null,
    storageClass: fields.StorageClass ?? null,
    etag: fields.ETag ?? null,
    contentType: fields.ContentType ?? null,
    metadata: Object.fromEntries(
      Object.entries(fields).filter(([field]) => !['Key', 'LastModified', 'Size', 'StorageClass', 'ETag', 'ContentType', 'Type', 'ACL'].includes(field)),
    ),
  };
}

export function parseBuckets(output) {
  const clean = stripLogNoise(output);
  const lines = clean.split('\n');
  const buckets = [];
  const seen = new Set();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^(\s*)(obs:\/\/\S+)(.*)$/);
    if (!match || match[1].length > 0) continue;
    const cloudUrl = match[2];
    if (seen.has(cloudUrl)) continue;
    seen.add(cloudUrl);

    let rest = match[3].trim();
    let cursor = index + 1;
    if (!rest) {
      while (cursor < lines.length && !lines[cursor].trim()) cursor += 1;
      if (cursor < lines.length && !lines[cursor].startsWith('obs://')) {
        rest = lines[cursor].trim();
      }
    }

    const date = rest.match(/\d{4}-\d{2}-\d{2}T\S+/)?.[0] ?? null;
    const region = rest.match(/\b(cn|ap|af|sa|na|eu|me|la)-[a-z0-9-]+-\d+\b/)?.[0] ?? null;
    const type = rest.match(/\b(OBJECT|POSIX|SAN)\b/)?.[0] ?? 'OBJECT';
    buckets.push({
      name: cloudUrl.slice('obs://'.length),
      path: `${cloudUrl}/`,
      region,
      createdAt: date,
      type,
    });
  }

  return buckets;
}

export function parseVersion(output) {
  const clean = stripLogNoise(output);
  return {
    version: clean.match(/obsutil version:\s*([\w.-]+)/i)?.[1] ?? null,
    sdkVersion: clean.match(/obssdk version:\s*([\w.-]+)/i)?.[1] ?? null,
    platform: clean.match(/operating system:\s*([^,\n]+),\s*arch:\s*([^\s\n]+)/i)
      ? `${clean.match(/operating system:\s*([^,\n]+)/i)[1].trim()} ${clean.match(/arch:\s*([^\s\n]+)/i)[1].trim()}`
      : null,
  };
}

function cleanError(stdout, stderr, fallback) {
  const lines = stripLogNoise(`${stdout}\n${stderr}`)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Listing objects\b/i.test(line))
    .filter((line) => !/^Folder number:/i.test(line) && !/^File number:/i.test(line));

  const explicit = lines.filter((line) => /^Error\b/i.test(line));
  const source = explicit.length ? explicit : lines.slice(-4);
  const message = source.join('\n').slice(0, 2000);
  return message || fallback;
}

function rewriteManagedConfig(raw, { logDir }) {
  const overrides = {
    sdkLogPath: path.join(logDir, 'obssdk.log'),
    utilLogPath: path.join(logDir, 'obsutil.log'),
    sdkLogLevel: 'ERROR',
    utilLogLevel: 'ERROR',
    sdkLogBackups: '1',
    utilLogBackups: '1',
    showProgressBar: 'false',
    showStartTime: 'false',
    humanReadableFormat: 'true',
  };
  const seen = new Set();
  const output = [];

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=/);
    if (match && Object.hasOwn(overrides, match[1])) {
      output.push(`${match[1]}=${overrides[match[1]]}`);
      seen.add(match[1]);
    } else {
      output.push(line);
    }
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!seen.has(key)) output.push(`${key}=${value}`);
  }
  return `${output.join('\n').replace(/\n+$/, '')}\n`;
}

function endpointFromConfig(raw) {
  const endpoint = raw.match(/^\s*endpoint\s*=\s*(\S+)/m)?.[1];
  if (!endpoint) return null;
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function createObsRuntime({ configPath } = {}) {
  const sourceConfig = configPath || process.env.OBSUTIL_CONFIG || path.join(os.homedir(), '.obsutilconfig');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obs-explorer-'));
  await fs.chmod(root, 0o700).catch(() => {});
  const logDir = path.join(root, 'logs');
  await fs.mkdir(logDir, { recursive: true, mode: 0o700 });

  try {
    const raw = await fs.readFile(sourceConfig, 'utf8');
    const endpoint = endpointFromConfig(raw);
    const appDataCandidates = [
      path.join(path.dirname(sourceConfig), '.obsutilAppData'),
      path.join(os.homedir(), '.obsutilAppData'),
    ];
    const sourceAppData = await (async () => {
      for (const candidate of appDataCandidates) {
        if (await exists(candidate)) return candidate;
      }
      return null;
    })();

    if (!sourceAppData) {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
      return {
        root: null,
        configPath: null,
        logDir: null,
        endpoint,
        managed: false,
        sourceConfig,
      };
    }

    await fs.cp(sourceAppData, path.join(root, '.obsutilAppData'), { recursive: true, force: true });

    const managedConfigPath = path.join(root, 'obsutil.conf');
    await fs.writeFile(managedConfigPath, rewriteManagedConfig(raw, { logDir }), { mode: 0o600 });
    await fs.chmod(managedConfigPath, 0o600);
    return {
      root,
      configPath: managedConfigPath,
      logDir,
      endpoint,
      managed: true,
      sourceConfig,
    };
  } catch {
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    return {
      root: null,
      configPath: null,
      logDir: null,
      endpoint: null,
      managed: false,
      sourceConfig,
    };
  }
}

export class ObsutilError extends Error {
  constructor(message, { code = null, timedOut = false, aborted = false } = {}) {
    super(message);
    this.name = 'ObsutilError';
    this.code = code;
    this.timedOut = timedOut;
    this.aborted = aborted;
  }
}

function readTtl(name, fallback) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.min(3_600_000, Math.floor(value));
}

export class ObsutilService {
  constructor({ bin = process.env.OBSUTIL_BIN || 'obsutil', configPath = null, cwd = process.cwd() } = {}) {
    this.bin = bin;
    this.configPath = configPath;
    this.cwd = cwd;
    this.bucketCache = null;
    this.bucketCacheAt = 0;
    this.versionCache = null;
    // obsutil 是一个独立 CLI 进程，每次调用都要重新建连，跨地域时尤其慢。
    // 短 TTL 的进程内缓存能让翻目录、刷新、重复预览几乎不产生新的 obsutil 调用。
    this.listCache = new Map();
    this.statCache = new Map();
    this.countCache = new Map();
    this.inflightLists = new Map();
    this.inflightBuckets = null;
    this.listCacheTtlMs = readTtl('OBS_LIST_CACHE_MS', 30_000);
    this.listStaleMs = readTtl('OBS_LIST_STALE_MS', 600_000);
    this.statCacheTtlMs = readTtl('OBS_STAT_CACHE_MS', 120_000);
    this.bucketCacheTtlMs = readTtl('OBS_BUCKET_CACHE_MS', 300_000);
    this.countCacheTtlMs = readTtl('OBS_COUNT_CACHE_MS', 300_000);
  }

  /** 写操作后清空读缓存，避免刚上传/删除的内容看不到。 */
  invalidateCaches() {
    this.listCache.clear();
    this.statCache.clear();
    this.countCache.clear();
    this.bucketCache = null;
    this.bucketCacheAt = 0;
  }

  async run(args, { timeoutMs = 60_000, maxBytes = 24 * 1024 * 1024, signal = null } = {}) {
    const finalArgs = [...args];
    if (this.configPath) finalArgs.push(`-config=${this.configPath}`);
    if (signal?.aborted) throw new ObsutilError('操作已取消', { aborted: true });

    return new Promise((resolve, reject) => {
      let settled = false;
      let timedOut = false;
      let aborted = false;
      let stdout = '';
      let stderr = '';
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let child;

      try {
        child = spawn(this.bin, finalArgs, {
          cwd: this.cwd,
          env: { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        reject(new ObsutilError(`无法启动 obsutil：${error.message}`));
        return;
      }

      const onAbort = () => {
        aborted = true;
        child.kill('SIGKILL');
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      const finish = (callback) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        callback();
      };

      child.stdout.on('data', (chunk) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > maxBytes) {
          child.kill('SIGKILL');
          return;
        }
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk) => {
        stderrBytes += chunk.length;
        if (stderrBytes <= 2 * 1024 * 1024) stderr += chunk.toString('utf8');
      });
      child.on('error', (error) => {
        finish(() => reject(new ObsutilError(`无法启动 obsutil：${error.message}`)));
      });
      child.on('close', (code) => {
        finish(() => {
          if (aborted) {
            reject(new ObsutilError('操作已取消', { code, aborted: true }));
            return;
          }
          if (timedOut) {
            reject(new ObsutilError(`obsutil 执行超时（${Math.round(timeoutMs / 1000)} 秒）`, { code, timedOut: true }));
            return;
          }
          if (stdoutBytes > maxBytes) {
            reject(new ObsutilError('obsutil 返回内容过大'));
            return;
          }
          if (code !== 0) {
            reject(new ObsutilError(cleanError(stdout, stderr, `obsutil 退出码 ${code}`), { code }));
            return;
          }
          resolve({ stdout, stderr, code });
        });
      });
    });
  }

  async version() {
    if (this.versionCache) return this.versionCache;
    const { stdout, stderr } = await this.run(['version'], { timeoutMs: 20_000, maxBytes: 1_000_000 });
    this.versionCache = parseVersion(`${stdout}\n${stderr}`);
    return this.versionCache;
  }

  async list(folderPath, { marker = null, limit = 200, force = false } = {}) {
    const safeLimit = Math.min(1000, Math.max(1, Number.parseInt(limit, 10) || 200));
    const cacheKey = `${folderPath}\u0000${marker || ''}\u0000${safeLimit}`;
    if (!force && this.listCacheTtlMs > 0) {
      const cached = this.listCache.get(cacheKey);
      if (cached && Date.now() - cached.at < this.listCacheTtlMs) {
        return { ...cached.value, cached: true };
      }
    }
    // 缓存过期但还在可容忍范围内：先把旧数据返回给页面，后台静默刷新。
    const stale = this.listCache.get(cacheKey);
    if (!force && stale && this.listCacheTtlMs > 0) {
      const age = Date.now() - stale.at;
      if (age < this.listStaleMs) {
        this.loadList(folderPath, { marker, safeLimit, cacheKey, force: false }).catch(() => {});
        return { ...stale.value, cached: true, stale: true };
      }
    }
    return this.loadList(folderPath, { marker, safeLimit, cacheKey, force });
  }

  loadList(folderPath, { marker, safeLimit, cacheKey, force }) {
    // 同一目录的并发请求共用一次 obsutil 调用（例如页面首屏和启动预热撞在一起）。
    const inflightKey = `${cacheKey}\u0000${force ? 'force' : ''}`;
    const pending = this.inflightLists.get(inflightKey);
    if (pending) return pending;
    const task = this.fetchList(folderPath, { marker, safeLimit, cacheKey });
    this.inflightLists.set(inflightKey, task);
    return task.finally(() => this.inflightLists.delete(inflightKey));
  }

  async fetchList(folderPath, { marker, safeLimit, cacheKey }) {
    const args = ['ls', folderPath, '-d', '-bf=raw', `-limit=${safeLimit}`];
    if (marker) args.push(`-marker=${marker}`);
    const startedAt = Date.now();
    const { stdout } = await this.run(args, { timeoutMs: 90_000 });
    const parsed = parseListOutput(stdout);
    const current = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
    const folders = parsed.folders.filter((folder) => folder.path !== folderPath && folder.path !== current);
    const result = {
      ...parsed,
      folders,
      objects: parsed.objects.filter((object) => object.path !== current),
      elapsedMs: Date.now() - startedAt,
      limit: safeLimit,
      cached: false,
    };
    this.rememberList(cacheKey, result);
    return result;
  }

  /**
   * 统计目录当前层的总项数。
   * 使用 `ls -d -s -limit=0` 让 obsutil 自己翻页，输出通过 readline 流式消费；
   * 达到 maxEntries 就杀掉进程并标记 truncated，避免超大王录把内存/时间打满。
   */
  async countEntries(folderPath, { maxEntries = 100_000, timeoutMs = 120_000, force = false, signal = null } = {}) {
    const folder = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
    const cacheKey = `${folder}\u0000${maxEntries}`;
    if (!force && this.countCacheTtlMs > 0) {
      const cached = this.countCache.get(cacheKey);
      if (cached && Date.now() - cached.at < this.countCacheTtlMs) {
        return { ...cached.value, cached: true };
      }
    }

    const startedAt = Date.now();
    const value = await this.fetchCount(folder, { maxEntries, timeoutMs, signal });
    const result = { ...value, elapsedMs: Date.now() - startedAt, cached: false };
    // 只缓存完整结果；被上限截断的结果下次仍应继续尝试。
    if (this.countCacheTtlMs > 0 && !result.truncated) {
      this.countCache.set(cacheKey, { at: Date.now(), value: result });
      if (this.countCache.size > 300) {
        const oldest = this.countCache.keys().next().value;
        this.countCache.delete(oldest);
      }
    }
    return result;
  }

  fetchCount(folderPath, { maxEntries, timeoutMs, signal }) {
    const args = ['ls', folderPath, '-d', '-s', '-limit=0'];
    if (this.configPath) args.push(`-config=${this.configPath}`);
    if (signal?.aborted) return Promise.reject(new ObsutilError('操作已取消', { aborted: true }));

    return new Promise((resolve, reject) => {
      let settled = false;
      let timedOut = false;
      let aborted = false;
      let stderr = '';
      let timer = null;
      let child;

      try {
        child = spawn(this.bin, args, {
          cwd: this.cwd,
          env: { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        reject(new ObsutilError(`无法启动 obsutil：${error.message}`));
        return;
      }

      const counter = createListingCounter(folderPath, { maxEntries });
      const output = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });

      const finish = (callback) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        output.close();
        callback();
      };

      const onAbort = () => {
        aborted = true;
        child.kill('SIGKILL');
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      output.on('line', (line) => {
        if (settled) return;
        if (counter.add(line)) return;
        child.kill('SIGKILL');
      });

      child.stderr.on('data', (chunk) => {
        if (stderr.length < 2 * 1024 * 1024) stderr += chunk.toString('utf8');
      });

      child.on('error', (error) => {
        finish(() => reject(new ObsutilError(`无法启动 obsutil：${error.message}`)));
      });

      child.on('close', (code) => {
        finish(() => {
          if (aborted) {
            reject(new ObsutilError('操作已取消', { code, aborted: true }));
            return;
          }
          if (timedOut) {
            reject(new ObsutilError(`obsutil 执行超时（${Math.round(timeoutMs / 1000)} 秒）`, { code, timedOut: true }));
            return;
          }
          const result = counter.result;
          if (code !== 0 && !result.truncated) {
            reject(new ObsutilError(cleanError('', stderr, `obsutil 退出码 ${code}`), { code }));
            return;
          }
          resolve(result);
        });
      });
    });
  }

  /** 缓存目录结果，并把对象元数据喂给 stat 缓存，让预览少跑一次 obsutil。 */
  rememberList(cacheKey, result) {
    if (this.listCacheTtlMs <= 0) return;
    this.listCache.set(cacheKey, { at: Date.now(), value: result });
    if (this.listCache.size > 300) {
      const oldest = this.listCache.keys().next().value;
      this.listCache.delete(oldest);
    }
    if (this.statCacheTtlMs <= 0) return;
    for (const object of result.objects) {
      this.statCache.set(object.path, {
        at: Date.now(),
        stat: {
          key: object.path,
          name: object.name,
          type: 'file',
          sizeBytes: object.sizeBytes,
          sizeLabel: object.sizeLabel,
          modified: object.modified,
          storageClass: object.storageClass,
          etag: object.etag,
          contentType: null,
          fromList: true,
        },
      });
    }
  }

  async listBrief(folderPath, { marker = null, limit = 1000, signal = null } = {}) {
    const safeLimit = Math.min(1000, Math.max(1, Number.parseInt(limit, 10) || 1000));
    const args = ['ls', folderPath, '-s', `-limit=${safeLimit}`];
    if (marker) args.push(`-marker=${marker}`);
    const startedAt = Date.now();
    const { stdout } = await this.run(args, { timeoutMs: 90_000, signal });
    const parsed = parseBriefListOutput(stdout);
    return {
      ...parsed,
      elapsedMs: Date.now() - startedAt,
      limit: safeLimit,
    };
  }

  async ensureLocalDir(name) {
    const directory = path.join(this.cwd, name);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    return directory;
  }

  async mkdir(folderPath) {
    const { stdout, stderr } = await this.run(['mkdir', folderPath], {
      timeoutMs: 60_000,
      maxBytes: 2 * 1024 * 1024,
    });
    this.invalidateCaches();
    return { stdout, stderr };
  }

  async uploadFile(localPath, objectPath, { signal = null } = {}) {
    const checkpointDir = await this.ensureLocalDir('.checkpoint');
    const { stdout, stderr } = await this.run(
      ['cp', localPath, objectPath, `-cpd=${checkpointDir}`],
      { timeoutMs: 600_000, maxBytes: 8 * 1024 * 1024, signal },
    );
    this.invalidateCaches();
    return { stdout, stderr };
  }

  async copyObject(sourcePath, targetPath, { signal = null } = {}) {
    const checkpointDir = await this.ensureLocalDir('.checkpoint');
    const outputDir = await this.ensureLocalDir('.output');
    const { stdout, stderr } = await this.run(
      ['cp', sourcePath, targetPath, `-cpd=${checkpointDir}`, `-o=${outputDir}`],
      { timeoutMs: 300_000, maxBytes: 4 * 1024 * 1024, signal },
    );
    this.invalidateCaches();
    return { stdout, stderr };
  }

  async moveObject(sourcePath, targetPath, { signal = null } = {}) {
    const checkpointDir = await this.ensureLocalDir('.checkpoint');
    const outputDir = await this.ensureLocalDir('.output');
    const { stdout, stderr } = await this.run(
      ['mv', sourcePath, targetPath, `-cpd=${checkpointDir}`, `-o=${outputDir}`],
      { timeoutMs: 300_000, maxBytes: 4 * 1024 * 1024, signal },
    );
    this.invalidateCaches();
    return { stdout, stderr };
  }

  async remove(objectPath, { recursive = false, signal = null } = {}) {
    const outputDir = await this.ensureLocalDir('.output');
    const args = ['rm', objectPath];
    if (recursive) args.push('-r');
    args.push('-f', `-o=${outputDir}`);
    const { stdout, stderr } = await this.run(args, {
      timeoutMs: 600_000,
      maxBytes: 8 * 1024 * 1024,
      signal,
    });
    this.invalidateCaches();
    return { stdout, stderr };
  }

  async buckets({ force = false } = {}) {
    const ttl = this.bucketCacheTtlMs;
    if (!force && this.bucketCache && Date.now() - this.bucketCacheAt < ttl) return this.bucketCache;
    if (this.inflightBuckets) return this.inflightBuckets;
    const task = (async () => {
      const { stdout, stderr } = await this.run(['ls'], { timeoutMs: 90_000, maxBytes: 8 * 1024 * 1024 });
      this.bucketCache = parseBuckets(`${stdout}\n${stderr}`);
      this.bucketCacheAt = Date.now();
      return this.bucketCache;
    })();
    this.inflightBuckets = task;
    try {
      return await task;
    } finally {
      this.inflightBuckets = null;
    }
  }

  async stat(objectPath, { force = false } = {}) {
    if (!force && this.statCacheTtlMs > 0) {
      const cached = this.statCache.get(objectPath);
      if (cached && Date.now() - cached.at < this.statCacheTtlMs) return { ...cached.stat };
    }
    const { stdout } = await this.run(['stat', objectPath, '-bf=raw'], { timeoutMs: 60_000 });
    const stat = parseStatOutput(stdout);
    if (!stat.key) throw new ObsutilError('无法读取对象属性');
    if (this.statCacheTtlMs > 0) {
      this.statCache.set(objectPath, { at: Date.now(), stat });
      if (this.statCache.size > 2000) {
        const oldest = this.statCache.keys().next().value;
        this.statCache.delete(oldest);
      }
    }
    return stat;
  }

  async sign(objectPath, expires = 600) {
    const { stdout, stderr } = await this.run(
      ['sign', objectPath, `-e=${Math.min(3600, Math.max(60, Number(expires) || 600))}`],
      { timeoutMs: 30_000, maxBytes: 1_000_000 },
    );
    const output = stripLogNoise(`${stdout}\n${stderr}`);
    const match = output.match(/https?:\/\/[^\s]+/);
    if (!match) throw new ObsutilError('未能生成对象签名链接');
    return match[0];
  }

  /**
   * 读取文本对象内容。obsutil 的 cat 只支持 10MB 以内的对象，
   * 更大的对象会报 "The file size [...] is too large, the supported maximum size is 10MB"，
   * 这里对超过上限的对象改走 cp 下载到临时文件再读，容量上限由调用方的 maxBytes 控制。
   */
  async catText(objectPath, { timeoutMs = 90_000, maxBytes = 24 * 1024 * 1024, signal = null } = {}) {
    const CAT_MAX_BYTES = 10 * 1024 * 1024; // obsutil cat 的硬性大小上限
    const stat = await this.stat(objectPath).catch(() => null);
    const sizeBytes = stat?.sizeBytes ?? null;

    // 已知大小且在 cat 支持范围内：直接 cat
    if (sizeBytes != null && sizeBytes <= CAT_MAX_BYTES) {
      const { stdout } = await this.run(['cat', objectPath], { timeoutMs, maxBytes, signal });
      return stdout;
    }

    // 已知大小但超过调用方上限：不必白跑一次下载，直接报错
    if (sizeBytes != null && sizeBytes > maxBytes) {
      throw new ObsutilError(`对象大小 ${stat.sizeLabel ?? `${sizeBytes}B`} 超过可读取上限`);
    }

    // 大小未知时先试一次 cat，撞到尺寸限制再退回下载
    if (sizeBytes == null) {
      try {
        const { stdout } = await this.run(['cat', objectPath], { timeoutMs, maxBytes, signal });
        return stdout;
      } catch (error) {
        if (!/is too large|maximum size/i.test(String(error?.message))) throw error;
      }
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'obs-explorer-cat-'));
    try {
      const target = path.join(tempDir, 'object');
      await this.downloadToFile(objectPath, target, { timeoutMs, signal });
      const bytes = await fs.readFile(target);
      if (bytes.length > maxBytes) {
        throw new ObsutilError(`对象内容超过可读取上限（${bytes.length} 字节）`);
      }
      return bytes.toString('utf8');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** 通过 cp 把对象下载到本地文件，供 catText 读取超过 cat 上限的大对象 */
  async downloadToFile(objectPath, targetPath, { timeoutMs = 300_000, signal = null, checkpointDir = null } = {}) {
    const cpd = checkpointDir ?? (await this.ensureLocalDir('.checkpoint'));
    return this.run(['cp', objectPath, targetPath, `-cpd=${cpd}`], {
      timeoutMs,
      maxBytes: 8 * 1024 * 1024,
      signal,
    });
  }

  async preview(objectPath) {
    let stat = await this.stat(objectPath);
    if (stat.type === 'folder') {
      return { supported: false, reason: 'folder', stat };
    }

    let kind = classifyObject(stat.name || objectPath, stat.contentType || '');
    // 列表缓存里的元数据没有 Content-Type，遇到无扩展名的对象才补一次真实 stat。
    if (!kind && !stat.contentType) {
      stat = await this.stat(objectPath, { force: true });
      kind = classifyObject(stat.name || objectPath, stat.contentType || '');
    }
    const signedKinds = new Set(['image', 'video', 'audio', 'pdf']);
    const maxPreviewBytes = 800 * 1024;

    if (signedKinds.has(kind)) {
      const url = await this.sign(objectPath, 900);
      return {
        supported: true,
        inline: true,
        kind,
        url,
        text: null,
        stat,
        sizeBytes: stat.sizeBytes,
      };
    }

    if (!kind) {
      return { supported: false, reason: 'binary', stat };
    }

    if ((stat.sizeBytes ?? 0) > maxPreviewBytes) {
      return { supported: false, reason: 'too-large', stat, maxPreviewBytes };
    }

    const { stdout } = await this.run(['cat', objectPath], {
      timeoutMs: 60_000,
      maxBytes: Math.max(maxPreviewBytes + 4096, 2 * 1024 * 1024),
    });
    let text = stripLogNoise(stdout).replace(/\r\n?/g, '\n');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (text.includes('\u0000')) {
      return { supported: false, reason: 'binary', stat };
    }

    return {
      supported: true,
      inline: true,
      kind: kind === 'json' ? 'json' : 'text',
      text,
      stat,
      sizeBytes: stat.sizeBytes,
    };
  }

  async downloadUrl(objectPath, expires = 300) {
    return this.sign(objectPath, expires);
  }
}

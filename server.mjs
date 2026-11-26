import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { gzipSync } from 'node:zlib';
import {
  compileFilenameMatcher,
  createObsRuntime,
  ObsutilError,
  ObsutilService,
} from './src/obsutil.mjs';
import { loadEnvFile } from './src/env.mjs';
import { TrajectoryService } from './src/trajectory-service.mjs';
import { objectPathFromReferer, rewriteHtmlRootUrls } from './src/trajectory.mjs';
import { createAuth, parseFormBody, renderLoginPage, sanitizeNextTarget } from './src/auth.mjs';
import { pipeBodyToResponse } from './src/stream.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(process.env.ENV_FILE || path.join(__dirname, '.env'));

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 4318;
const HOST = process.env.HOST || '127.0.0.1';
const DEFAULT_PATH =
  process.env.OBS_DEFAULT_PATH ||
  'obs://s3-asset-b-hd-cce-aifm-nlp-exp/task_data/261018/1018_frontend_scientific_mechanism_oc/task_configs/';

// 设置 OBS_AUTH_TOKEN 后启用共享口令登录；未设置时保持纯本地模式。
const AUTH = createAuth({ token: process.env.OBS_AUTH_TOKEN });

const SEARCH_PAGE_SIZE = 1000;
const SEARCH_MAX_RESULTS = clampNumber(process.env.OBS_SEARCH_MAX_RESULTS, 1, 1000, 300);
const SEARCH_MAX_SCAN = clampNumber(process.env.OBS_SEARCH_MAX_SCAN, 1000, 200_000, 20_000);
const SEARCH_MAX_PAGES = clampNumber(process.env.OBS_SEARCH_MAX_PAGES, 1, 500, 200);
const MAX_UPLOAD_BYTES = clampNumber(
  process.env.OBS_MAX_UPLOAD_BYTES,
  1024,
  5 * 1024 * 1024 * 1024,
  512 * 1024 * 1024,
);
const BATCH_MAX_ITEMS = clampNumber(process.env.OBS_BATCH_MAX_ITEMS, 1, 1000, 200);
const BATCH_CONCURRENCY = clampNumber(process.env.OBS_BATCH_CONCURRENCY, 1, 16, 4);
const DOWNLOAD_MAX_BYTES = clampNumber(
  process.env.OBS_DOWNLOAD_MAX_BYTES,
  1_048_576,
  1_099_511_627_776,
  52_428_800,
);
const COUNT_MAX_ENTRIES = clampNumber(process.env.OBS_COUNT_MAX_ENTRIES, 1000, 1_000_000, 100_000);

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
};

function securityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'SAMEORIGIN',
    ...extra,
  };
}

// 远程访问时链路带宽和丢包都很关键：大于 1KB 的文本响应统一 gzip。
const GZIP_MIN_BYTES = 1024;
const COMPRESSIBLE_EXTENSIONS = new Set([
  '.html', '.htm', '.js', '.mjs', '.css', '.json', '.map', '.svg', '.txt', '.xml', '.wasm',
]);
const staticGzipCache = new Map();

function acceptsGzip(req) {
  const header = req?.headers?.['accept-encoding'];
  return typeof header === 'string' && /\bgzip\b/i.test(header);
}

function gzipCached(cacheKey, buffer) {
  const cached = staticGzipCache.get(cacheKey);
  if (cached) return cached;
  const compressed = gzipSync(buffer, { level: 6 });
  if (staticGzipCache.size > 100) staticGzipCache.clear();
  staticGzipCache.set(cacheKey, compressed);
  return compressed;
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
  let output = body;
  if (body.length >= GZIP_MIN_BYTES && acceptsGzip(res.req)) {
    output = gzipSync(body, { level: 6 });
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
  }
  headers['Content-Length'] = output.length;
  res.writeHead(status, securityHeaders(headers));
  res.end(output);
}

function fail(res, status, message, extra = {}) {
  sendJson(res, status, { error: message, ...extra });
}

class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  try {
    const parsed = new URL(origin);
    if (parsed.host !== req.headers.host) {
      throw new HttpError('跨站请求被拒绝', 403);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError('请求来源不合法', 403);
  }
}

function clientAddress(req) {
  const address = req.socket?.remoteAddress || 'unknown';
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const loginFailures = new Map();

function loginBlocked(address) {
  const record = loginFailures.get(address);
  if (!record) return false;
  if (Date.now() > record.resetAt) {
    loginFailures.delete(address);
    return false;
  }
  return record.failures >= LOGIN_MAX_FAILURES;
}

function noteLoginFailure(address) {
  const now = Date.now();
  const record = loginFailures.get(address);
  if (!record || now > record.resetAt) {
    loginFailures.set(address, { failures: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  record.failures += 1;
  if (loginFailures.size > 2000) {
    for (const [key, value] of loginFailures) if (now > value.resetAt) loginFailures.delete(key);
  }
}

function isSecureRequest(req) {
  if (req.socket?.encrypted) return true;
  const forwarded = req.headers['x-forwarded-proto'];
  if (typeof forwarded !== 'string') return false;
  return forwarded.split(',')[0].trim().toLowerCase() === 'https';
}

function redirect(res, location, extra = {}) {
  res.writeHead(
    303,
    securityHeaders({
      Location: location,
      'Cache-Control': 'no-store',
      ...extra,
    }),
  );
  res.end();
}

async function readRawBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let size = 0;
    const chunks = [];
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      callback();
    };
    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        finish(() => reject(new HttpError('请求体过大', 413)));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      finish(() => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', (error) => finish(() => reject(error)));
  });
}

function serveLoginPage(req, res, { status = 200, error = '', next = '/' } = {}) {
  const body = Buffer.from(renderLoginPage({ error, next }), 'utf8');
  res.writeHead(
    status,
    securityHeaders({
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'",
    }),
  );
  if (req.method === 'HEAD') res.end();
  else res.end(body);
}

/**
 * 鉴权闸门：未开启口令时直接放行；开启后除登录/退出外的所有请求都要带有效会话。
 * 首次访问可以通过 `?token=<口令>` 换取 cookie，同时把口令从地址栏移除。
 */
async function handleAuth(req, res, url) {
  if (!AUTH.enabled) return true;

  const secure = isSecureRequest(req);

  if (url.pathname === '/logout') {
    redirect(res, '/login', { 'Set-Cookie': AUTH.clearCookie() });
    return false;
  }

  if (AUTH.hasSession(req.headers.cookie)) {
    if (url.pathname === '/login') {
      redirect(res, '/');
      return false;
    }
    return true;
  }

  const queryToken = url.searchParams.get('token');
  if (queryToken && AUTH.verifyToken(queryToken)) {
    url.searchParams.delete('token');
    const target = `${url.pathname}${url.search}`;
    redirect(res, target || '/', { 'Set-Cookie': AUTH.sessionCookie({ secure }) });
    return false;
  }

  if (url.pathname === '/login') {
    if (req.method === 'POST') {
      const address = clientAddress(req);
      if (loginBlocked(address)) {
        serveLoginPage(req, res, { status: 429, error: '尝试次数过多，请稍后再试。', next: '/' });
        return false;
      }
      let form = {};
      try {
        form = parseFormBody(await readRawBody(req));
      } catch {
        form = {};
      }
      const next = sanitizeNextTarget(form.next);
      if (AUTH.verifyToken(form.token)) {
        redirect(res, next, { 'Set-Cookie': AUTH.sessionCookie({ secure }) });
        return false;
      }
      noteLoginFailure(address);
      serveLoginPage(req, res, { status: 401, error: '口令不正确。', next });
      return false;
    }
    serveLoginPage(req, res, { next: sanitizeNextTarget(url.searchParams.get('next') || '/') });
    return false;
  }

  if (url.pathname.startsWith('/api/')) {
    const body = JSON.stringify({ error: '未登录或会话已过期', login: '/login' });
    res.writeHead(
      401,
      securityHeaders({
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
      }),
    );
    res.end(body);
    return false;
  }

  redirect(res, `/login?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`);
  return false;
}

async function readJsonBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let size = 0;
    const chunks = [];
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      callback();
    };
    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        finish(() => reject(new HttpError('请求体过大', 413)));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      finish(() => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8').trim();
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          reject(new HttpError('请求体不是有效的 JSON'));
        }
      });
    });
    req.on('error', (error) => finish(() => reject(error)));
  });
}

function validateEntryName(input) {
  if (typeof input !== 'string') throw new HttpError('缺少文件或文件夹名称');
  const value = input.trim();
  if (!value) throw new HttpError('名称不能为空');
  if (value === '.' || value === '..') throw new HttpError('名称不合法');
  if (value.length > 512) throw new HttpError('名称过长');
  if (/[\/\\\u0000-\u001f\u007f]/.test(value)) throw new HttpError('名称不能包含路径分隔符或控制字符');
  if (value.includes('?') || value.includes('#')) throw new HttpError('名称中不能包含 ? 或 #');
  return value;
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function statOrNull(objectPath) {
  try {
    return await obs.stat(objectPath);
  } catch (error) {
    if (error instanceof ObsutilError && /(?:404|NoSuchKey|does not exist|not exist)/i.test(error.message)) {
      return null;
    }
    throw error;
  }
}

function normalizeFolderPath(input) {
  if (typeof input !== 'string') throw new Error('缺少 OBS 路径');
  const value = input.trim();
  if (!value) throw new Error('缺少 OBS 路径');
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error('路径中包含非法字符');
  if (!/^obs:\/\//i.test(value)) throw new Error('路径必须以 obs:// 开头');

  const withoutScheme = value.slice('obs://'.length);
  const slash = withoutScheme.indexOf('/');
  const bucket = (slash === -1 ? withoutScheme : withoutScheme.slice(0, slash)).toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error('存储桶名称不合法');
  }

  let prefix = slash === -1 ? '/' : withoutScheme.slice(slash);
  if (prefix.includes('?') || prefix.includes('#')) throw new Error('路径中不能包含 ? 或 #');
  prefix = prefix.replace(/\/+/g, '/');
  const segments = prefix.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw new Error('路径中不能包含 . 或 ..');
  }
  prefix = segments.length ? `/${segments.join('/')}/` : '/';
  return `obs://${bucket}${prefix}`;
}

function normalizeObjectPath(input) {
  if (typeof input !== 'string') throw new Error('缺少对象路径');
  const value = input.trim();
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error('路径中包含非法字符');
  if (!/^obs:\/\/[^/]+\/.+/.test(value)) throw new Error('对象路径不合法');
  if (value.endsWith('/')) throw new Error('对象路径不能以 / 结尾');
  if (value.includes('?') || value.includes('#')) throw new Error('路径中不能包含 ? 或 #');
  const segments = value.slice('obs://'.length).split('/');
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw new Error('路径中不能包含 . 或 ..');
  }
  return value;
}

function parentPath(folderPath) {
  const withoutTrailing = folderPath.replace(/\/$/, '');
  const index = withoutTrailing.lastIndexOf('/');
  if (index <= 'obs://'.length) return `obs://${withoutTrailing.slice('obs://'.length)}/`;
  return `${withoutTrailing.slice(0, index + 1)}`;
}

function displayName(folderPath) {
  const clean = folderPath.replace(/\/$/, '');
  return clean.split('/').pop() || clean;
}

function attachEntryPaths(folderPath, entries) {
  return entries.map((entry) => ({
    ...entry,
    name: entry.name,
    parent: folderPath,
  }));
}

function filenameDisposition(name) {
  const fallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_').slice(0, 180) || 'download';
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  if (relative.includes('\0')) return false;
  const fullPath = path.resolve(PUBLIC_DIR, relative);
  if (fullPath !== PUBLIC_DIR && !fullPath.startsWith(`${PUBLIC_DIR}${path.sep}`)) return false;

  try {
    const info = await fs.stat(fullPath);
    if (!info.isFile()) return false;
    const ext = path.extname(fullPath).toLowerCase();
    const isHtml = ext === '.html';
    const revalidate = isHtml || ['.js', '.mjs', '.css'].includes(ext);
    const headers = {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': revalidate ? 'no-cache' : 'public, max-age=300',
    };
    if (isHtml) {
      headers['Content-Security-Policy'] =
        "default-src 'self'; img-src 'self' data: http: https:; media-src 'self' http: https:; frame-src http: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'";
    }
    const compressible = COMPRESSIBLE_EXTENSIONS.has(ext) && info.size >= GZIP_MIN_BYTES && acceptsGzip(req);
    if (compressible) {
      const buffer = await fs.readFile(fullPath);
      const body = gzipCached(`${fullPath}:${info.mtimeMs}:${info.size}`, buffer);
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
      headers['Content-Length'] = body.length;
      res.writeHead(200, securityHeaders(headers));
      if (req.method === 'HEAD') res.end();
      else res.end(body);
      return true;
    }
    res.writeHead(200, securityHeaders(headers));
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }
    createReadStream(fullPath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

const runtime = await createObsRuntime();
const obs = new ObsutilService({
  bin: process.env.OBSUTIL_BIN || 'obsutil',
  configPath: runtime.configPath,
  cwd: runtime.root || process.cwd(),
});
const trajectory = new TrajectoryService(obs);

/**
 * 代理 OBS 对象给轨迹查看器使用。
 * 之所以走本地代理而不是直接返回签名 URL：HTML 交付物里的相对资源（css/js/图片）
 * 需要落在同一路径前缀下才能被浏览器正确解析。
 */







function resolveRefererObjectPath(req, requestedPathname) {
  const objectPath = objectPathFromReferer(req.headers.referer, req.headers.host, requestedPathname);
  if (!objectPath) return null;
  try {
    return normalizeObjectPath(objectPath);
  } catch {
    return null;
  }
}

async function serveTrajectoryFile(req, res, objectPath, requestPathname = '') {
  let upstream = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const signedUrl = await trajectory.signedUrl(objectPath);
    const requestHeaders = {};
    if (req.headers.range) requestHeaders.Range = req.headers.range;
    try {
      upstream = await fetch(signedUrl, {
        headers: requestHeaders,
        redirect: 'follow',
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      throw new HttpError(`读取 OBS 对象失败：${error.message}`, 502);
    }
    if (upstream.status === 403 && attempt === 0) {
      trajectory.signedCache.delete(objectPath);
      continue;
    }
    break;
  }

  if (!upstream) throw new HttpError('读取 OBS 对象失败', 502);
  if (upstream.status === 404) throw new HttpError('对象不存在', 404);
  if (!upstream.ok && upstream.status !== 206) {
    throw new HttpError(`OBS 返回 HTTP ${upstream.status}`, 502);
  }

  const ext = path.extname(objectPath).toLowerCase();
  const headers = securityHeaders({
    'Content-Type': MIME_TYPES[ext] || upstream.headers.get('content-type') || 'application/octet-stream',
    'Cache-Control': 'private, max-age=60',
  });
  for (const [source, target] of [
    ['content-length', 'Content-Length'],
    ['content-range', 'Content-Range'],
    ['accept-ranges', 'Accept-Ranges'],
    ['etag', 'ETag'],
    ['last-modified', 'Last-Modified'],
  ]) {
    const value = upstream.headers.get(source);
    if (value) headers[target] = value;
  }
  if (!headers['Accept-Ranges']) headers['Accept-Ranges'] = 'bytes';

  const isHtml = ext === '.html' || ext === '.htm';
  if (isHtml && upstream.status === 200) {
    const html = await upstream.text();
    const dirPrefix = requestPathname.slice(0, requestPathname.lastIndexOf('/') + 1) || '/';
    const body = Buffer.from(rewriteHtmlRootUrls(html, dirPrefix), 'utf8');
    headers['Content-Type'] = 'text/html; charset=utf-8';
    headers['Content-Length'] = body.length;
    // 允许同源子资源请求带上 Referer，用于把 Vite 预加载的 /assets/... 映射回交付物目录
    headers['Referrer-Policy'] = 'same-origin';
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end();
    else res.end(body);
    return;
  }

  res.writeHead(upstream.status === 206 ? 206 : 200, headers);
  if (req.method === 'HEAD') {
    await upstream.body?.cancel().catch(() => {});
    res.end();
    return;
  }
  await pipeBodyToResponse(res, upstream.body);
}

let versionInfo = { version: null, sdkVersion: null, platform: null };
let versionError = null;
try {
  versionInfo = await obs.version();
} catch (error) {
  versionError = error instanceof Error ? error.message : String(error);
}

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now();
  let pathname = '/';
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
    pathname = url.pathname;

    if (!['GET', 'HEAD', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD, POST');
      fail(res, 405, '不支持的请求方法');
      return;
    }

    if (!(await handleAuth(req, res, url))) return;

    if (url.pathname === '/api/meta') {
      sendJson(res, 200, {
        app: 'OBS Explorer',
        defaultPath: DEFAULT_PATH,
        version: versionInfo.version,
        sdkVersion: versionInfo.sdkVersion,
        platform: versionInfo.platform,
        versionError,
        endpoint: runtime.endpoint || null,
        configMode: runtime.managed ? 'isolated' : 'default',
        uploadLimitBytes: MAX_UPLOAD_BYTES,
        batchMaxItems: BATCH_MAX_ITEMS,
        authEnabled: AUTH.enabled,
        host: HOST,
        port: PORT,
      });
      return;
    }

    if (url.pathname === '/api/buckets') {
      const force = url.searchParams.get('refresh') === '1';
      const buckets = await obs.buckets({ force });
      sendJson(res, 200, { buckets, count: buckets.length });
      return;
    }

    if (url.pathname === '/api/list') {
      const folderPath = normalizeFolderPath(url.searchParams.get('path') || DEFAULT_PATH);
      const marker = url.searchParams.get('marker') || null;
      const limit = url.searchParams.get('limit') || '200';
      const force = url.searchParams.get('refresh') === '1';
      const listed = await obs.list(folderPath, { marker, limit, force });
      const folders = attachEntryPaths(folderPath, listed.folders);
      const objects = attachEntryPaths(folderPath, listed.objects);
      sendJson(res, 200, {
        path: folderPath,
        parent: parentPath(folderPath),
        displayName: displayName(folderPath),
        bucket: folderPath.slice('obs://'.length).split('/')[0],
        entries: [...folders, ...objects],
        folders,
        objects,
        nextMarker: listed.nextMarker,
        hasMore: Boolean(listed.nextMarker),
        counts: {
          folders: folders.length,
          objects: objects.length,
          reportedFolders: listed.reportedFolderCount,
          reportedObjects: listed.reportedFileCount,
        },
        marker,
        limit: listed.limit,
        elapsedMs: listed.elapsedMs,
        cached: Boolean(listed.cached),
      });
      return;
    }

    if (url.pathname === '/api/count') {
      const folderPath = normalizeFolderPath(url.searchParams.get('path') || DEFAULT_PATH);
      const force = url.searchParams.get('refresh') === '1';
      // OBS 没有前缀级计数接口，这里会列举当前层。客户端离开页面时立即终止，
      // 避免后台还在为一个已经没人看的目录继续翻页。
      const controller = new AbortController();
      const onClose = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on('close', onClose);
      try {
        const counted = await obs.countEntries(folderPath, {
          maxEntries: COUNT_MAX_ENTRIES,
          force,
          signal: controller.signal,
        });
        sendJson(res, 200, {
          path: folderPath,
          folders: counted.folders,
          objects: counted.objects,
          total: counted.total,
          atLeast: counted.atLeast,
          truncated: counted.truncated,
          elapsedMs: counted.elapsedMs,
          cached: Boolean(counted.cached),
          limit: COUNT_MAX_ENTRIES,
        });
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      } finally {
        res.off('close', onClose);
      }
      return;
    }

    if (url.pathname === '/api/mkdir') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        fail(res, 405, '仅支持 POST 请求');
        return;
      }
      assertSameOrigin(req);
      const body = await readJsonBody(req);
      const parent = normalizeFolderPath(body.path);
      const name = validateEntryName(body.name);
      const folderPath = normalizeFolderPath(`${parent}${name}/`);
      const existing = await statOrNull(folderPath);
      if (existing) {
        fail(res, 409, '同名文件夹已存在', { path: folderPath });
        return;
      }
      await obs.mkdir(folderPath);
      sendJson(res, 201, { ok: true, path: folderPath });
      return;
    }

    if (url.pathname === '/api/delete') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        fail(res, 405, '仅支持 POST 请求');
        return;
      }
      assertSameOrigin(req);
      const body = await readJsonBody(req);
      if (body.confirm !== true) {
        fail(res, 400, '缺少删除确认');
        return;
      }
      const recursive = body.recursive === true;
      let target;
      if (recursive) {
        target = normalizeFolderPath(body.path);
        const segments = target.slice('obs://'.length).split('/').filter(Boolean);
        if (segments.length < 2) throw new HttpError('不能通过此接口删除整个存储桶', 400);
      } else {
        target = normalizeObjectPath(body.path);
      }
      await obs.remove(target, { recursive });
      sendJson(res, 200, { ok: true, path: target, recursive });
      return;
    }

    if (url.pathname === '/api/upload') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        fail(res, 405, '仅支持 POST 请求');
        return;
      }
      assertSameOrigin(req);
      const parent = normalizeFolderPath(url.searchParams.get('path'));
      const name = validateEntryName(url.searchParams.get('name'));
      const objectPath = normalizeObjectPath(`${parent}${name}`);
      const overwrite = url.searchParams.get('overwrite') === '1';
      const declaredLength = Number(req.headers['content-length']);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
        fail(res, 413, `文件超过上传上限（${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB）`);
        return;
      }
      if (!overwrite && (await statOrNull(objectPath))) {
        fail(res, 409, '同名对象已存在', { path: objectPath, code: 'AlreadyExists' });
        return;
      }

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'obs-explorer-upload-'));
      await fs.chmod(tempDir, 0o700).catch(() => {});
      const extension = path.extname(name).toLowerCase();
      const safeExtension = /^\.[a-z0-9]{1,12}$/.test(extension) ? extension : '';
      const tempFile = path.join(tempDir, `payload${safeExtension}`);
      let received = 0;
      let tooLarge = false;
      let uploadFinished = false;
      const uploadController = new AbortController();
      const onUploadClose = () => {
        if (!uploadFinished) uploadController.abort();
      };
      res.on('close', onUploadClose);
      try {
        const meter = new Transform({
          transform(chunk, encoding, callback) {
            received += chunk.length;
            if (received > MAX_UPLOAD_BYTES) {
              tooLarge = true;
              callback(new Error('UPLOAD_TOO_LARGE'));
              return;
            }
            callback(null, chunk);
          },
        });
        await pipeline(req, meter, createWriteStream(tempFile, { mode: 0o600 }));
        await obs.uploadFile(tempFile, objectPath, { signal: uploadController.signal });
        sendJson(res, 201, {
          ok: true,
          path: objectPath,
          name,
          sizeBytes: received,
          overwritten: overwrite,
        });
      } catch (error) {
        if (tooLarge) {
          fail(res, 413, `文件超过上传上限（${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB）`);
        } else if (!res.headersSent && !res.destroyed) {
          fail(res, 502, `上传失败：${error.message}`);
        }
      } finally {
        uploadFinished = true;
        res.off('close', onUploadClose);
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
      return;
    }

    if (url.pathname === '/api/batch') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        fail(res, 405, '仅支持 POST 请求');
        return;
      }
      assertSameOrigin(req);
      const body = await readJsonBody(req, 2 * 1024 * 1024);
      const action = body.action;
      if (!['move', 'copy', 'delete'].includes(action)) {
        fail(res, 400, '不支持的批量操作');
        return;
      }
      if (body.confirm !== true) {
        fail(res, 400, '缺少操作确认');
        return;
      }
      if (!Array.isArray(body.paths) || body.paths.length === 0) {
        fail(res, 400, '没有选择任何对象');
        return;
      }
      if (body.paths.length > BATCH_MAX_ITEMS) {
        fail(res, 400, `一次最多处理 ${BATCH_MAX_ITEMS} 个对象`);
        return;
      }

      const uniquePaths = [...new Set(body.paths.map((p) => normalizeObjectPath(p)))];
      if (uniquePaths.length > BATCH_MAX_ITEMS) {
        fail(res, 400, `一次最多处理 ${BATCH_MAX_ITEMS} 个对象`);
        return;
      }
      const names = uniquePaths.map((p) => p.split('/').pop());

      let destination = null;
      const operations = uniquePaths.map((source) => ({
        source,
        name: source.split('/').pop(),
        target: null,
      }));

      if (action !== 'delete') {
        if (new Set(names).size !== names.length) {
          fail(res, 400, '选中的对象存在同名文件，无法放入同一个目标目录');
          return;
        }
        if (typeof body.destination !== 'string' || !body.destination.trim()) {
          fail(res, 400, '请输入目标目录');
          return;
        }
        destination = normalizeFolderPath(body.destination);
        for (const operation of operations) {
          operation.target = normalizeObjectPath(`${destination}${operation.name}`);
          if (operation.source === operation.target) {
            fail(res, 400, '目标和源目录不能相同');
            return;
          }
        }

        const destinationListing = await obs.list(destination, { limit: 1000 });
        const existingNames = new Set(destinationListing.objects.map((object) => object.name));
        const conflicts = operations
          .filter((operation) => existingNames.has(operation.name))
          .map((operation) => operation.target);
        if (destinationListing.nextMarker) {
          const unchecked = operations.filter((operation) => !existingNames.has(operation.name));
          await mapLimit(unchecked, 8, async (operation) => {
            if (await statOrNull(operation.target)) conflicts.push(operation.target);
          });
        }
        if (conflicts.length) {
          fail(res, 409, `目标目录中已存在 ${conflicts.length} 个同名对象，未执行操作`, {
            conflicts: conflicts.slice(0, 50),
          });
          return;
        }
      }

      if (res.destroyed) return;

      res.writeHead(
        200,
        securityHeaders({
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Accel-Buffering': 'no',
        }),
      );
      res.flushHeaders?.();

      const controller = new AbortController();
      let finished = false;
      const onClose = () => {
        if (!finished) controller.abort();
      };
      res.on('close', onClose);

      const send = (payload) => {
        if (finished || res.destroyed || res.writableEnded) return;
        try {
          res.write(`${JSON.stringify(payload)}\n`);
        } catch {
          controller.abort();
        }
      };

      const startedAt = Date.now();
      let succeeded = 0;
      let failedCount = 0;
      let completed = 0;
      const failures = [];

      send({ type: 'start', action, total: operations.length, destination });
      try {
        await mapLimit(operations, BATCH_CONCURRENCY, async (operation) => {
          if (controller.signal.aborted) return;
          try {
            if (action === 'move') {
              await obs.moveObject(operation.source, operation.target, { signal: controller.signal });
            } else if (action === 'copy') {
              await obs.copyObject(operation.source, operation.target, { signal: controller.signal });
            } else {
              await obs.remove(operation.source, { recursive: false, signal: controller.signal });
            }
            completed += 1;
            succeeded += 1;
            send({
              type: 'progress',
              index: completed,
              total: operations.length,
              name: operation.name,
              path: operation.source,
              status: 'ok',
            });
          } catch (error) {
            if (controller.signal.aborted) return;
            completed += 1;
            failedCount += 1;
            failures.push({ name: operation.name, path: operation.source, error: error.message });
            send({
              type: 'progress',
              index: completed,
              total: operations.length,
              name: operation.name,
              path: operation.source,
              status: 'error',
              error: error.message,
            });
          }
        });
        if (!controller.signal.aborted) {
          send({
            type: 'done',
            action,
            total: operations.length,
            succeeded,
            failed: failedCount,
            failures,
            destination,
            elapsedMs: Date.now() - startedAt,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      } finally {
        finished = true;
        res.off('close', onClose);
        if (!res.writableEnded) res.end();
      }
      return;
    }

    if (url.pathname === '/api/search') {
      const folderPath = normalizeFolderPath(url.searchParams.get('path') || DEFAULT_PATH);
      const query = (url.searchParams.get('q') || '').trim();
      if (!query) {
        fail(res, 400, '请输入要搜索的文件名');
        return;
      }
      if (query.length > 120) {
        fail(res, 400, '搜索词不能超过 120 个字符');
        return;
      }
      if (/[\u0000-\u001f\u007f]/.test(query)) {
        fail(res, 400, '搜索词中包含非法字符');
        return;
      }

      res.writeHead(
        200,
        securityHeaders({
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Accel-Buffering': 'no',
        }),
      );
      res.flushHeaders?.();

      const controller = new AbortController();
      let finished = false;
      const onClose = () => {
        if (!finished) controller.abort();
      };
      res.on('close', onClose);

      const send = (payload) => {
        if (finished || res.destroyed || res.writableEnded) return;
        try {
          res.write(`${JSON.stringify(payload)}\n`);
        } catch {
          controller.abort();
        }
      };

      const startedAt = Date.now();
      const matcher = compileFilenameMatcher(query);
      const prefix = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
      const seen = new Set();
      let marker = null;
      let scanned = 0;
      let matched = 0;
      let pages = 0;
      let stopReason = 'complete';

      send({
        type: 'start',
        path: folderPath,
        query,
        maxResults: SEARCH_MAX_RESULTS,
        maxScan: SEARCH_MAX_SCAN,
        pageSize: SEARCH_PAGE_SIZE,
      });

      try {
        while (true) {
          if (controller.signal.aborted) break;
          if (pages >= SEARCH_MAX_PAGES) {
            stopReason = 'max-pages';
            break;
          }

          const page = await obs.listBrief(folderPath, {
            marker,
            limit: SEARCH_PAGE_SIZE,
            signal: controller.signal,
          });
          pages += 1;

          const batch = [];
          for (const object of page.objects) {
            if (seen.has(object.path)) continue;
            seen.add(object.path);
            scanned += 1;
            if (!matcher(object.name)) continue;

            const relative = object.path.startsWith(prefix)
              ? object.path.slice(prefix.length)
              : object.path;
            const slash = relative.lastIndexOf('/');
            batch.push({
              ...object,
              relativeDir: slash >= 0 ? relative.slice(0, slash + 1) : '',
            });
            if (matched + batch.length >= SEARCH_MAX_RESULTS) break;
          }

          if (batch.length) {
            matched += batch.length;
            send({ type: 'matches', items: batch });
          }
          send({
            type: 'progress',
            scanned,
            matched,
            pages,
            elapsedMs: Date.now() - startedAt,
          });

          if (matched >= SEARCH_MAX_RESULTS) {
            stopReason = 'max-results';
            break;
          }
          if (scanned >= SEARCH_MAX_SCAN) {
            stopReason = 'max-scan';
            break;
          }
          if (!page.nextMarker) break;
          if (page.nextMarker === marker) {
            stopReason = 'stalled';
            break;
          }
          marker = page.nextMarker;
        }

        if (!controller.signal.aborted) {
          send({
            type: 'done',
            scanned,
            matched,
            pages,
            elapsedMs: Date.now() - startedAt,
            stopReason,
            maxResults: SEARCH_MAX_RESULTS,
            maxScan: SEARCH_MAX_SCAN,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      } finally {
        finished = true;
        res.off('close', onClose);
        if (!res.writableEnded) res.end();
      }
      return;
    }

    if (url.pathname === '/api/trajectory/overview') {
      const folderPath = normalizeFolderPath(url.searchParams.get('path'));
      const overview = await trajectory.overview(folderPath);
      sendJson(res, 200, overview);
      return;
    }

    if (url.pathname === '/api/trajectory/messages') {
      const folderPath = normalizeFolderPath(url.searchParams.get('path'));
      const agent = url.searchParams.get('agent') || 'main';
      const session = url.searchParams.get('session');
      const provider = url.searchParams.get('provider') || 'openclaw';
      const project = url.searchParams.get('project') || null;
      const from = url.searchParams.get('from') || '0';
      const limit = url.searchParams.get('limit') || '300';
      const page = await trajectory.messages(folderPath, { agent, session, provider, project, from, limit });
      sendJson(res, 200, page);
      return;
    }

    if (url.pathname === '/api/trajectory/raw') {
      const folderPath = normalizeFolderPath(url.searchParams.get('path'));
      const agent = url.searchParams.get('agent') || 'main';
      const session = url.searchParams.get('session');
      const provider = url.searchParams.get('provider') || 'openclaw';
      const project = url.searchParams.get('project') || null;
      const raw = await trajectory.raw(folderPath, { agent, session, provider, project });
      sendJson(res, 200, raw);
      return;
    }

    if (url.pathname.startsWith('/trajectory/files/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        fail(res, 405, '仅支持 GET 请求');
        return;
      }
      const encodedPath = url.pathname.slice('/trajectory/files/'.length);
      if (!encodedPath) throw new HttpError('缺少对象路径', 400);
      const segments = encodedPath.split('/').map((segment) => decodeURIComponent(segment));
      const objectPath = normalizeObjectPath(`obs://${segments.join('/')}`);
      await serveTrajectoryFile(req, res, objectPath, url.pathname);
      return;
    }

    // 交付物（常见于 Vite 产物）会从站点根路径请求 /assets/...；
    // 用 Referer 定位它属于哪个交付物目录，再按 OBS 对象代理。
    if (url.pathname.startsWith('/assets/')) {
      const objectPath = resolveRefererObjectPath(req, url.pathname);
      if (objectPath) {
        await serveTrajectoryFile(req, res, objectPath, url.pathname);
        return;
      }
    }

    if (url.pathname === '/api/preview') {
      const objectPath = normalizeObjectPath(url.searchParams.get('path'));
      const preview = await obs.preview(objectPath);
      sendJson(res, 200, { path: objectPath, ...preview });
      return;
    }

    if (url.pathname === '/api/sign') {
      const objectPath = normalizeObjectPath(url.searchParams.get('path'));
      const expires = Number(url.searchParams.get('expires')) || 600;
      const signedUrl = await obs.sign(objectPath, expires);
      sendJson(res, 200, { url: signedUrl, expiresIn: Math.min(3600, Math.max(60, expires)) });
      return;
    }

    if (url.pathname === '/api/download') {
      const objectPath = normalizeObjectPath(url.searchParams.get('path'));
      const stat = await obs.stat(objectPath);
      if (stat.type === 'folder') {
        fail(res, 400, '文件夹暂不支持直接下载');
        return;
      }
      if ((stat.sizeBytes ?? 0) > DOWNLOAD_MAX_BYTES) {
        const limitMb = Math.round(DOWNLOAD_MAX_BYTES / 1024 / 1024);
        fail(
          res,
          413,
          `对象大小 ${stat.sizeLabel ?? `${stat.sizeBytes}B`} 超过 ${limitMb} MB 代理下载上限，请在页面复制 obsutil 下载命令，或调大 OBS_DOWNLOAD_MAX_BYTES`,
        );
        return;
      }
      const signedUrl = await obs.downloadUrl(objectPath, 300);
      let upstream;
      try {
        upstream = await fetch(signedUrl, {
          redirect: 'follow',
          signal: AbortSignal.timeout(600_000),
        });
      } catch (error) {
        fail(res, 502, `下载连接失败：${error.message}`);
        return;
      }
      if (!upstream.ok) {
        fail(res, 502, `对象下载失败（HTTP ${upstream.status}）`);
        return;
      }

      const headers = securityHeaders({
        'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
        'Content-Disposition': filenameDisposition(stat.name || 'download'),
        'Cache-Control': 'no-store',
      });
      const length = upstream.headers.get('content-length');
      if (length) headers['Content-Length'] = length;
      res.writeHead(200, headers);
      await pipeBodyToResponse(res, upstream.body);
      return;
    }

    if (url.pathname === '/trajectory' || url.pathname === '/trajectory/') {
      if (await serveStatic(req, res, '/trajectory/index.html')) return;
      res.writeHead(
        503,
        securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }),
      );
      res.end('轨迹查看器尚未构建：请先运行 npm run build:trajectory');
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      fail(res, 404, '接口不存在');
      return;
    }

    if (await serveStatic(req, res, url.pathname)) return;
    if (req.method === 'HEAD') {
      res.writeHead(404, securityHeaders({ 'Cache-Control': 'no-store' }));
      res.end();
      return;
    }
    res.writeHead(404, securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Not found');
  } catch (error) {
    const status = error instanceof HttpError ? error.status : error instanceof ObsutilError ? 502 : 400;
    const message = error instanceof Error ? error.message : String(error);
    if (!res.headersSent) fail(res, status, message);
    else res.destroy();
  } finally {
    const status = res.statusCode;
    console.log(`${new Date().toISOString()} ${req.method} ${pathname} ${status} ${Date.now() - startedAt}ms`);
  }
});

async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down…`);
  server.close(async () => {
    if (runtime.root) await fs.rm(runtime.root, { recursive: true, force: true }).catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// 公网高延迟链路下，让浏览器尽量复用连接，少付 TCP/TLS 握手成本。
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.listen(PORT, HOST, () => {
  console.log(`OBS Explorer listening at http://${HOST}:${PORT}`);
  console.log(`Default path: ${DEFAULT_PATH}`);
  console.log(`obsutil config: ${runtime.managed ? 'isolated runtime' : 'default user config'}`);
  if (versionError) console.log(`obsutil warning: ${versionError}`);

  // 跨地域访问 OBS 时一次 obsutil 调用可能要几秒，后台预热让第一个访客不用等。
  setTimeout(() => {
    obs.buckets({ force: true }).catch(() => {});
    obs.list(DEFAULT_PATH).catch(() => {});
  }, 500).unref?.();
  // 桶列表变化很慢，定期保活，避免缓存过期后首屏又卡一次。
  setInterval(() => {
    obs.buckets({ force: true }).catch(() => {});
  }, 4 * 60 * 1000).unref?.();
});

import crypto from 'node:crypto';

export const AUTH_COOKIE = 'obs_explorer_session';

const SESSION_CONTEXT = 'obs-explorer-session-v1';
const LOGIN_PATH = '/login';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseCookies(header) {
  const cookies = new Map();
  if (typeof header !== 'string' || !header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (!name || cookies.has(name)) continue;
    let value = part.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      cookies.set(name, value);
    }
  }
  return cookies;
}

/**
 * 可选的共享口令登录。
 *
 * - 未设置口令时 auth.enabled 为 false，服务行为与本地模式完全一致。
 * - 会话 cookie 的值是口令的 HMAC，无法从 cookie 反推口令；口令轮换后旧 cookie 立即失效。
 * - 支持首次访问用 `?token=<口令>` 换取 cookie，随后地址栏里不再带口令。
 */
export function createAuth({ token, cookieName = AUTH_COOKIE, maxAgeSeconds = 30 * 24 * 60 * 60 } = {}) {
  const secret = typeof token === 'string' ? token.trim() : '';
  const enabled = secret.length > 0;
  const sessionValue = enabled
    ? crypto.createHmac('sha256', secret).update(SESSION_CONTEXT).digest('base64url')
    : null;
  const sessionBuffer = sessionValue ? Buffer.from(sessionValue, 'utf8') : null;

  function safeEqual(left, right) {
    const a = Buffer.from(String(left), 'utf8');
    const b = Buffer.from(String(right), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  function verifyToken(candidate) {
    if (!enabled) return true;
    if (typeof candidate !== 'string' || !candidate) return false;
    return safeEqual(candidate, secret);
  }

  function hasSession(cookieHeader) {
    if (!enabled) return true;
    const value = parseCookies(cookieHeader).get(cookieName);
    if (typeof value !== 'string' || !value) return false;
    return safeEqual(value, sessionBuffer);
  }

  function sessionCookie({ secure = false } = {}) {
    const parts = [
      `${cookieName}=${encodeURIComponent(sessionValue)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${Math.max(60, Math.floor(maxAgeSeconds))}`,
    ];
    if (secure) parts.push('Secure');
    return parts.join('; ');
  }

  function clearCookie() {
    return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }

  return {
    enabled,
    cookieName,
    loginPath: LOGIN_PATH,
    verifyToken,
    hasSession,
    sessionCookie,
    clearCookie,
  };
}

/** 只允许站内相对路径，避免登录后被重定向到外站。 */
export function sanitizeNextTarget(value) {
  if (typeof value !== 'string') return '/';
  const target = value.trim();
  if (!target.startsWith('/') || target.startsWith('//')) return '/';
  if (target.includes('\n') || target.includes('\r')) return '/';
  return target;
}

export function renderLoginPage({ error = '', next = '/', appName = 'OBS Explorer' } = {}) {
  const message = error
    ? `<p class="error" role="alert">${escapeHtml(error)}</p>`
    : '<p class="hint">请输入访问口令后继续。</p>';
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="robots" content="noindex" />
    <title>登录 · ${escapeHtml(appName)}</title>
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%23080b12'/%3E%3Cpath d='M15 23.5 32 14l17 9.5v17L32 50l-17-9.5z' fill='none' stroke='%235eead4' stroke-width='3'/%3E%3Cpath d='m15 23.5 17 9.7 17-9.7M32 33.2V50' fill='none' stroke='%235eead4' stroke-width='3'/%3E%3C/svg%3E" />
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0; min-height: 100vh; display: grid; place-items: center;
        background: radial-gradient(1200px 600px at 50% -10%, #12253a 0%, #080b12 60%);
        color: #e8edf5; font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        padding: 24px;
      }
      .card {
        width: 100%; max-width: 380px; background: rgba(15, 22, 34, .92);
        border: 1px solid rgba(94, 234, 212, .18); border-radius: 16px;
        padding: 28px; box-shadow: 0 24px 60px rgba(0, 0, 0, .45);
      }
      .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
      .brand svg { width: 28px; height: 28px; color: #5eead4; }
      h1 { font-size: 17px; margin: 0; letter-spacing: .2px; }
      small { display: block; color: #7c8aa0; font-weight: 400; font-size: 12px; }
      label { display: block; font-size: 12px; color: #9fb0c6; margin-bottom: 6px; }
      input[type=password] {
        width: 100%; padding: 11px 13px; border-radius: 10px; font-size: 14px;
        background: #0b1220; color: #e8edf5; border: 1px solid #24344b; outline: none;
      }
      input[type=password]:focus { border-color: #5eead4; box-shadow: 0 0 0 3px rgba(94, 234, 212, .14); }
      button {
        width: 100%; margin-top: 16px; padding: 11px 14px; border: 0; border-radius: 10px;
        background: #5eead4; color: #062220; font-weight: 600; font-size: 14px; cursor: pointer;
      }
      button:hover { background: #7df0dd; }
      .hint { color: #7c8aa0; font-size: 12px; margin: 0 0 16px; }
      .error { color: #ff8f8f; font-size: 12px; margin: 0 0 16px; }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="brand">
        <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="m6.5 11.2 9.5-5.4 9.5 5.4v9.6L16 26.2l-9.5-5.4z" />
          <path d="m6.5 11.2 9.5 5.5 9.5-5.5M16 16.7v9.5" />
        </svg>
        <h1>${escapeHtml(appName)}<small>需要访问口令</small></h1>
      </div>
      ${message}
      <form method="post" action="${LOGIN_PATH}" autocomplete="off">
        <input type="hidden" name="next" value="${escapeHtml(next)}" />
        <label for="token">访问口令</label>
        <input id="token" name="token" type="password" required autofocus
               autocomplete="current-password" spellcheck="false" placeholder="请输入口令" />
        <button type="submit">进入</button>
      </form>
    </main>
  </body>
</html>`;
}

/** 解析 application/x-www-form-urlencoded 请求体，供登录表单使用。 */
export function parseFormBody(raw) {
  const result = {};
  const text = typeof raw === 'string' ? raw : '';
  for (const pair of text.split('&')) {
    if (!pair) continue;
    const index = pair.indexOf('=');
    const name = index === -1 ? pair : pair.slice(0, index);
    const value = index === -1 ? '' : pair.slice(index + 1);
    try {
      const key = decodeURIComponent(name.replaceAll('+', ' '));
      if (!key || key in result) continue;
      result[key] = decodeURIComponent(value.replaceAll('+', ' '));
    } catch {
      // 忽略无法解码的字段
    }
  }
  return result;
}

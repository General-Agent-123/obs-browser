import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuth, parseFormBody, renderLoginPage, sanitizeNextTarget } from '../src/auth.mjs';

test('auth is disabled when no token is configured', () => {
  const auth = createAuth({});
  assert.equal(auth.enabled, false);
  assert.equal(auth.hasSession(undefined), true);
  assert.equal(auth.verifyToken(undefined), true);
});

test('auth accepts only the configured token', () => {
  const auth = createAuth({ token: 's3cret' });
  assert.equal(auth.enabled, true);
  assert.equal(auth.verifyToken('s3cret'), true);
  assert.equal(auth.verifyToken('s3cret '), false);
  assert.equal(auth.verifyToken(''), false);
  assert.equal(auth.verifyToken(undefined), false);
  assert.equal(auth.verifyToken('S3CRET'), false);
});

test('session cookie round-trips without exposing the raw token', () => {
  const auth = createAuth({ token: 's3cret' });
  const header = auth.sessionCookie();
  const value = header.match(/obs_explorer_session=([^;]+)/)[1];
  assert.ok(value.length > 0);
  assert.ok(!decodeURIComponent(value).includes('s3cret'));
  assert.equal(auth.hasSession(`obs_explorer_session=${value}`), true);
  assert.equal(auth.hasSession(`foo=1; obs_explorer_session=${value}; bar=2`), true);
  assert.equal(auth.hasSession('obs_explorer_session=forged'), false);
  assert.equal(auth.hasSession(undefined), false);
});

test('session cookie is HttpOnly, SameSite=Lax and long lived', () => {
  const header = createAuth({ token: 's3cret', maxAgeSeconds: 60 }).sessionCookie({ secure: true });
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Max-Age=60/);
  assert.match(header, /Secure/);
});

test('rotating the token invalidates old cookies', () => {
  const first = createAuth({ token: 'one' }).sessionCookie();
  const value = first.match(/obs_explorer_session=([^;]+)/)[1];
  const second = createAuth({ token: 'two' });
  assert.equal(second.hasSession(`obs_explorer_session=${value}`), false);
});

test('sanitizeNextTarget only allows same-site paths', () => {
  assert.equal(sanitizeNextTarget('/obs/x'), '/obs/x');
  assert.equal(sanitizeNextTarget('/'), '/');
  assert.equal(sanitizeNextTarget('https://evil.test/'), '/');
  assert.equal(sanitizeNextTarget('//evil.test/'), '/');
  assert.equal(sanitizeNextTarget('/ok\r\nX: 1'), '/');
  assert.equal(sanitizeNextTarget(undefined), '/');
});

test('parseFormBody decodes urlencoded form fields', () => {
  assert.deepEqual(parseFormBody('token=a%20b&next=%2Fobs%2Fx%3Fy%3D1'), {
    token: 'a b',
    next: '/obs/x?y=1',
  });
  assert.deepEqual(parseFormBody('token=1+2'), { token: '1 2' });
  assert.deepEqual(parseFormBody(''), {});
});

test('login page escapes injected values', () => {
  const html = renderLoginPage({ error: '<script>bad()</script>', next: '"/><script>x</script>' });
  assert.ok(!html.includes('<script>bad()</script>'));
  assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));
  assert.ok(!html.includes('"/><script>x</script>'));
});

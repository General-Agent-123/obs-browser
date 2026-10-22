import fs from 'node:fs';

function parseValue(raw) {
  let value = raw.trim();
  if (!value) return '';

  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value
      .slice(1, -1)
      .replaceAll('\\n', '\n')
      .replaceAll('\\r', '\r')
      .replaceAll('\\t', '\t')
      .replaceAll('\\"', '"');
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1);
  }

  // Strip an unquoted inline comment introduced by whitespace + #.
  value = value.replace(/\s+#.*$/, '').trimEnd();
  return value;
}

/**
 * Load a dotenv-style file without adding a dependency.
 * Existing process.env values always win.
 */
export function loadEnvFile(filePath, { override = false } = {}) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }

  for (const sourceLine of raw.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith('#')) continue;
    const withoutExport = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const equals = withoutExport.indexOf('=');
    if (equals === -1) continue;
    const key = withoutExport.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (!override && Object.hasOwn(process.env, key)) continue;
    process.env[key] = parseValue(withoutExport.slice(equals + 1));
  }
  return true;
}

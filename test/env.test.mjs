import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadEnvFile } from '../src/env.mjs';

test('loadEnvFile parses dotenv values without overriding the shell', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'obs-env-test-'));
  const file = path.join(dir, '.env');
  const suffix = `${process.pid}_${Date.now()}`;
  const keys = {
    defaultPath: `TEST_ENV_DEFAULT_${suffix}`,
    single: `TEST_ENV_SINGLE_${suffix}`,
    inline: `TEST_ENV_INLINE_${suffix}`,
    empty: `TEST_ENV_EMPTY_${suffix}`,
    existing: `TEST_ENV_EXISTING_${suffix}`,
  };

  await fs.writeFile(
    file,
    [
      '# comment',
      '',
      `${keys.defaultPath}="obs://bucket/a b/#keep"`,
      `${keys.single}='value # kept'`,
      `${keys.inline}=value # stripped`,
      `${keys.empty}=`,
      `${keys.existing}=from-file`,
      'export NOT_A_VALID_LINE',
    ].join('\n'),
  );

  process.env[keys.existing] = 'from-shell';
  try {
    assert.equal(loadEnvFile(file), true);
    assert.equal(process.env[keys.defaultPath], 'obs://bucket/a b/#keep');
    assert.equal(process.env[keys.single], 'value # kept');
    assert.equal(process.env[keys.inline], 'value');
    assert.equal(process.env[keys.empty], '');
    assert.equal(process.env[keys.existing], 'from-shell');
    assert.equal(loadEnvFile(path.join(dir, 'missing.env')), false);
  } finally {
    for (const key of Object.values(keys)) delete process.env[key];
    await fs.rm(dir, { recursive: true, force: true });
  }
});

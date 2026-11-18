import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  classifyObject,
  compileFilenameMatcher,
  createListingCounter,
  humanToBytes,
  ObsutilError,
  ObsutilService,
  parseBriefListOutput,
  parseBuckets,
  parseListOutput,
  parseStatOutput,
  stripLogNoise,
} from '../src/obsutil.mjs';

const LIST_SAMPLE = `
Start at 2026-10-21 07:46:35.214065 +0000 UTC

Listing objects .

Folder list:
obs://example-bucket/task/current/
obs://example-bucket/task/current/environments/

Object list:
key                                               LastModified                  Size      StorageClass        ETag
obs://example-bucket/task/current/00066_example.json
                                                  2026-10-19T02:20:32Z          2384B     standard            "ab15c8444f693f5af277f1697605a6b1"

obs://example-bucket/task/current/00074_量与日常测量_Ruler_scale_starting_poi_055f67ac_q1.json
                                                  2026-10-19T02:20:33Z          2.23KB    standard            "1382770bcaf83fb123884b8709332ec2"

Next marker is: task/current/00074_量与日常测量_Ruler_scale_starting_poi_055f67ac_q1.json
Folder number: 2
File number: 2
`;

test('parseListOutput reads folders, objects, metadata and next marker', () => {
  const parsed = parseListOutput(LIST_SAMPLE);
  assert.equal(parsed.folders.length, 2);
  assert.equal(parsed.folders[1].name, 'environments');
  assert.equal(parsed.objects.length, 2);
  assert.equal(parsed.objects[0].name, '00066_example.json');
  assert.equal(parsed.objects[0].sizeBytes, 2384);
  assert.equal(parsed.objects[0].storageClass, 'standard');
  assert.equal(parsed.objects[0].etag, 'ab15c8444f693f5af277f1697605a6b1');
  assert.equal(parsed.objects[1].sizeBytes, Math.round(2.23 * 1024));
  assert.equal(parsed.objects[0].modified, '2026-10-19T02:20:32Z');
  assert.equal(parsed.nextMarker, 'task/current/00074_量与日常测量_Ruler_scale_starting_poi_055f67ac_q1.json');
  assert.equal(parsed.reportedFolderCount, 2);
  assert.equal(parsed.reportedFileCount, 2);
});

test('parseListOutput reads next marker from obsutil >= 5.8 output (no "is")', () => {
  // obsutil 5.8.9 起把 "Next marker is:" 改成了 "Next marker:"，旧正则匹配不到
  // 会导致前端丢失"加载更多"按钮。这里用服务器上真实抓到的输出做回归样例。
  const parsed = parseListOutput(`
Start at 2026-11-03 13:03:02.612720394 +0000 UTC

Listing objects .

Folder list:
obs://example-bucket/openclaw_trajs/
obs://example-bucket/openclaw_trajs/0914_rubrics_oc_2_0914_1849/
obs://example-bucket/openclaw_trajs/0916_mock_200x200/
obs://example-bucket/openclaw_trajs/0916_mock_200x200_cfgA_wave1/
obs://example-bucket/openclaw_trajs/

Next marker: openclaw_trajs/0916_mock_200x200_cfgA_wave1/
Folder number: 200
File number: 0
`);
  assert.equal(parsed.nextMarker, 'openclaw_trajs/0916_mock_200x200_cfgA_wave1/');
  assert.equal(parsed.reportedFolderCount, 200);
  assert.equal(parsed.reportedFileCount, 0);
  assert.equal(parsed.objects.length, 0);
});

test('parseListOutput handles an empty object list', () => {
  const parsed = parseListOutput(`
Folder list:
obs://example-bucket/path/

Object list:

Folder number: 1
File number: 0
`);
  assert.equal(parsed.folders.length, 1);
  assert.equal(parsed.objects.length, 0);
  assert.equal(parsed.nextMarker, null);
});

test('parseListOutput joins wrapped object keys', () => {
  const parsed = parseListOutput(`
Folder list:
obs://example-bucket/path/

Object list:
obs://example-bucket/path/a-very-long-object-name-that-
                                                  was-wrapped.json
                                                  2026-01-01T00:00:00Z          10B       standard            "abc"
Folder number: 1
File number: 1
`);
  assert.equal(parsed.objects.length, 1);
  assert.equal(parsed.objects[0].path, 'obs://example-bucket/path/a-very-long-object-name-that-was-wrapped.json');
});

test('parseStatOutput reads typed fields and raw size', () => {
  const parsed = parseStatOutput(`
Start at 2026-10-21 07:47:17.918672 +0000 UTC

Key:
  obs://example-bucket/path/file.json
LastModified:
  2026-10-19T02:20:32Z
Size:
  2384B
StorageClass:
  standard
ETag:
  ab15c8444f693f5af277f1697605a6b1
ContentType:
  application/json
Type:
  file
`);
  assert.equal(parsed.name, 'file.json');
  assert.equal(parsed.sizeBytes, 2384);
  assert.equal(parsed.contentType, 'application/json');
  assert.equal(parsed.type, 'file');
});

test('parseBuckets handles wrapped bucket rows', () => {
  const buckets = parseBuckets(`
Bucket                   CreationDate             Location       BucketType
obs://short-bucket      2026-08-18T02:36:08Z     cn-north-4     OBJECT

obs://bucket-omni-infer-gy
                         2025-07-04T01:45:36Z     cn-southwest-2 OBJECT
`);
  assert.equal(buckets.length, 2);
  assert.equal(buckets[0].name, 'short-bucket');
  assert.equal(buckets[1].region, 'cn-southwest-2');
  assert.equal(buckets[1].path, 'obs://bucket-omni-infer-gy/');
});

test('humanToBytes and classifyObject cover common cases', () => {
  assert.equal(humanToBytes('0B'), 0);
  assert.equal(humanToBytes('1KB'), 1024);
  assert.equal(humanToBytes('2.5 MB'), 2_621_440);
  assert.equal(humanToBytes('2384B'), 2384);
  assert.equal(classifyObject('a.json'), 'json');
  assert.equal(classifyObject('a.bin', 'image/png'), 'image');
  assert.equal(classifyObject('README', 'text/plain'), 'text');
  assert.equal(classifyObject('archive.tar.gz'), null);
});

test('stripLogNoise removes sandbox log-open noise only', () => {
  const clean = stripLogNoise(`
Error: open /Users/test/.obsutil_log/obssdk.log: operation not permitted
Start at 2026-10-21 07:46:35.214065 +0000 UTC
Real content
Error: Status [403], error code [InvalidAccessKeyId]
`);
  assert.equal(clean.includes('operation not permitted'), false);
  assert.equal(clean.includes('Start at'), false);
  assert.equal(clean.includes('InvalidAccessKeyId'), true);
});


test('parseBriefListOutput reads recursive objects and next marker', () => {
  const parsed = parseBriefListOutput(`
Folder list:
obs://example-bucket/root/
obs://example-bucket/root/a/

Object list:
obs://example-bucket/root/a/file-one.json
obs://example-bucket/root/a/file-two.json
obs://example-bucket/root/b/deep/file-three.json

Next marker is: root/b/deep/file-three.json
Folder number: 2
File number: 3
`);
  assert.equal(parsed.objects.length, 3);
  assert.equal(parsed.objects[2].name, 'file-three.json');
  assert.equal(parsed.objects[2].ext, 'json');
  assert.equal(parsed.nextMarker, 'root/b/deep/file-three.json');
});

test('createListingCounter counts current-level folders and objects, excluding itself', () => {
  const counter = createListingCounter('obs://example-bucket/root/', { maxEntries: 10 });
  for (const line of [
    'Start at 2026-10-21 07:46:35.214065 +0000 UTC',
    '',
    'Listing objects .',
    'Folder list:',
    'obs://example-bucket/root/',
    'obs://example-bucket/root/a/',
    'obs://example-bucket/root/b/',
    'Object list:',
    'obs://example-bucket/root/file-one.json',
    'obs://example-bucket/root/file-two.json',
    'Folder number: 3',
    'File number: 2',
  ]) {
    counter.add(line);
  }
  assert.deepEqual(counter.result, {
    folders: 2,
    objects: 2,
    total: 4,
    truncated: false,
    atLeast: false,
  });
});

test('createListingCounter stops at the entry cap', () => {
  const counter = createListingCounter('obs://example-bucket/root/', { maxEntries: 2 });
  assert.equal(counter.add('obs://example-bucket/root/one.json'), true);
  assert.equal(counter.add('obs://example-bucket/root/two.json'), false);
  assert.deepEqual(counter.result, {
    folders: 0,
    objects: 2,
    total: 2,
    truncated: true,
    atLeast: true,
  });
});

test('compileFilenameMatcher supports substring and wildcard matching', () => {
  const substring = compileFilenameMatcher('Reference');
  assert.equal(substring('00066_Reference_Directions.json'), true);
  assert.equal(substring('reference-directions.json'), true);
  assert.equal(substring('00066_other.json'), false);

  const wildcard = compileFilenameMatcher('*q1.json');
  assert.equal(wildcard('00066_task_q1.json'), true);
  assert.equal(wildcard('00066_task_q2.json'), false);

  const question = compileFilenameMatcher('file?.json');
  assert.equal(question('file1.json'), true);
  assert.equal(question('file10.json'), false);
  assert.equal(compileFilenameMatcher('')(), false);
});

test('ObsutilService caches listings and seeds stat metadata from them', async () => {
  const service = new ObsutilService({ bin: 'obsutil' });
  let calls = 0;
  service.run = async () => {
    calls += 1;
    return { stdout: LIST_SAMPLE, stderr: '' };
  };

  const folder = 'obs://example-bucket/task/current/';
  const first = await service.list(folder);
  assert.equal(first.cached, false);
  assert.equal(calls, 1);

  const second = await service.list(folder);
  assert.equal(second.cached, true);
  assert.equal(calls, 1, 'second read should come from cache');

  const forced = await service.list(folder, { force: true });
  assert.equal(forced.cached, false);
  assert.equal(calls, 2);

  // 列表里的对象元数据应直接满足 stat，无需再跑一次 obsutil
  const stat = await service.stat('obs://example-bucket/task/current/00066_example.json');
  assert.equal(stat.sizeBytes, 2384);
  assert.equal(calls, 2, 'stat should reuse list metadata');

  service.invalidateCaches();
  const afterInvalidate = await service.list(folder);
  assert.equal(afterInvalidate.cached, false);
  assert.equal(calls, 3);
});

test('ObsutilService list cache can be disabled with TTL 0', async () => {
  const previous = process.env.OBS_LIST_CACHE_MS;
  process.env.OBS_LIST_CACHE_MS = '0';
  try {
    const service = new ObsutilService({ bin: 'obsutil' });
    let calls = 0;
    service.run = async () => {
      calls += 1;
      return { stdout: LIST_SAMPLE, stderr: '' };
    };
    await service.list('obs://example-bucket/task/current/');
    await service.list('obs://example-bucket/task/current/');
    assert.equal(calls, 2);
  } finally {
    if (previous === undefined) delete process.env.OBS_LIST_CACHE_MS;
    else process.env.OBS_LIST_CACHE_MS = previous;
  }
});

test('stale listing is returned immediately while a refresh runs in background', async () => {
  const previousTtl = process.env.OBS_LIST_CACHE_MS;
  const previousStale = process.env.OBS_LIST_STALE_MS;
  process.env.OBS_LIST_CACHE_MS = '1';
  process.env.OBS_LIST_STALE_MS = '60000';
  try {
    const service = new ObsutilService({ bin: 'obsutil' });
    let started = 0;
    let finished = 0;
    service.run = async () => {
      started += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      finished += 1;
      return { stdout: LIST_SAMPLE, stderr: '' };
    };
    await service.list('obs://example-bucket/task/current/');
    assert.equal(started, 1);
    assert.equal(finished, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const stale = await service.list('obs://example-bucket/task/current/');
    assert.equal(stale.cached, true);
    assert.equal(stale.stale, true, 'expired entry should be served stale');
    assert.equal(finished, 1, 'background refresh should not block the response');

    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(finished, 2, 'background refresh should eventually run');
    const refreshed = await service.list('obs://example-bucket/task/current/');
    assert.equal(refreshed.cached, true);
    assert.equal(refreshed.objects.length, 2, 'refreshed payload should be complete');
  } finally {
    if (previousTtl === undefined) delete process.env.OBS_LIST_CACHE_MS;
    else process.env.OBS_LIST_CACHE_MS = previousTtl;
    if (previousStale === undefined) delete process.env.OBS_LIST_STALE_MS;
    else process.env.OBS_LIST_STALE_MS = previousStale;
  }
});

test('ObsutilService caches entry counts but not truncated ones', async () => {
  const service = new ObsutilService({ bin: 'obsutil' });
  let calls = 0;
  service.fetchCount = async () => {
    calls += 1;
    return { folders: 1, objects: 2, total: 3, truncated: false, atLeast: false };
  };

  const folder = 'obs://example-bucket/task/current/';
  const first = await service.countEntries(folder);
  assert.equal(first.cached, false);
  assert.equal(first.total, 3);

  const second = await service.countEntries(folder);
  assert.equal(second.cached, true);
  assert.equal(calls, 1, 'second count should come from cache');

  const forced = await service.countEntries(folder, { force: true });
  assert.equal(forced.cached, false);
  assert.equal(calls, 2);

  service.invalidateCaches();
  await service.countEntries(folder);
  assert.equal(calls, 3, 'write invalidation should clear count cache');

  service.fetchCount = async () => {
    calls += 1;
    return { folders: 0, objects: 100, total: 100, truncated: true, atLeast: true };
  };
  await service.countEntries(folder, { maxEntries: 100 });
  await service.countEntries(folder, { maxEntries: 100 });
  assert.equal(calls, 5, 'truncated counts must not be cached');
});

test('ObsutilService catText keeps using cat for objects within the cat size cap', async () => {
  const service = new ObsutilService({ bin: 'obsutil' });
  const commands = [];
  service.stat = async () => ({ key: 'x', type: 'file', sizeBytes: 2384, sizeLabel: '2384B' });
  service.run = async (args) => {
    commands.push(args[0]);
    return { stdout: 'small text', stderr: '' };
  };

  const text = await service.catText('obs://example-bucket/task/small.jsonl', { maxBytes: 50 * 1024 * 1024 });
  assert.equal(text, 'small text');
  assert.deepEqual(commands, ['cat']);
});

test('ObsutilService catText downloads objects larger than the cat size cap', async () => {
  const service = new ObsutilService({ bin: 'obsutil' });
  const commands = [];
  service.stat = async () => ({ key: 'x', type: 'file', sizeBytes: 15_034_159, sizeLabel: '14.33MB' });
  service.run = async (args) => {
    commands.push(args[0]);
    throw new Error(`unexpected command ${args[0]}`);
  };
  service.downloadToFile = async (objectPath, targetPath) => {
    commands.push('download');
    assert.equal(objectPath, 'obs://example-bucket/task/big.jsonl');
    await fs.writeFile(targetPath, 'large body', 'utf8');
  };

  const text = await service.catText('obs://example-bucket/task/big.jsonl', { maxBytes: 50 * 1024 * 1024 });
  assert.equal(text, 'large body');
  assert.deepEqual(commands, ['download'], 'oversized objects should skip cat entirely');
});

test('ObsutilService catText falls back to download when cat hits the size cap', async () => {
  const service = new ObsutilService({ bin: 'obsutil' });
  const commands = [];
  service.stat = async () => null;
  service.run = async (args) => {
    commands.push(args[0]);
    // 模拟 obsutil cat 对大对象的报错
    throw new ObsutilError('Error: The file size [15034159] is too large, the supported maximum size is 10MB');
  };
  service.downloadToFile = async (_objectPath, targetPath) => {
    commands.push('download');
    await fs.writeFile(targetPath, 'downloaded body', 'utf8');
  };

  const text = await service.catText('obs://example-bucket/task/big.jsonl', { maxBytes: 50 * 1024 * 1024 });
  assert.equal(text, 'downloaded body');
  assert.deepEqual(commands, ['cat', 'download']);
});

test('ObsutilService catText rethrows cat errors unrelated to size', async () => {
  const service = new ObsutilService({ bin: 'obsutil' });
  service.stat = async () => null;
  service.run = async () => {
    throw new ObsutilError('Error: Status [404], error code [NoSuchObject]');
  };
  service.downloadToFile = async () => {
    throw new Error('should not download');
  };

  await assert.rejects(
    () => service.catText('obs://example-bucket/task/missing.jsonl', { maxBytes: 50 * 1024 * 1024 }),
    /NoSuchObject/,
  );
});

test('ObsutilService catText rejects oversized objects without downloading', async () => {
  const service = new ObsutilService({ bin: 'obsutil' });
  let ran = false;
  service.stat = async () => ({ key: 'x', type: 'file', sizeBytes: 60 * 1024 * 1024, sizeLabel: '60MB' });
  service.run = async () => {
    ran = true;
    return { stdout: '', stderr: '' };
  };

  await assert.rejects(
    () => service.catText('obs://example-bucket/task/huge.jsonl', { maxBytes: 50 * 1024 * 1024 }),
    /上限/,
  );
  assert.equal(ran, false, 'oversized objects should fail before any obsutil call');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyObject,
  compileFilenameMatcher,
  humanToBytes,
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

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable } from 'node:stream';
import { pipeBodyToResponse } from '../src/stream.mjs';

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function httpGet(server) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: server.address().port, path: '/' }, resolve);
    req.on('error', reject);
  });
}

async function waitFor(predicate, ms = 2000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > ms) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
}

function endlessSource() {
  // 持续推数据的源流，模拟大文件下载
  return new Readable({
    read() { this.push(Buffer.alloc(64 * 1024)); },
  });
}

test('streams body fully and ends response', async () => {
  const body = Readable.toWeb(Readable.from(['hello', ' ', 'world']));
  let handlerDone = false;
  const server = await startServer(async (req, res) => {
    await pipeBodyToResponse(res, body);
    handlerDone = true;
  });
  try {
    const res = await httpGet(server);
    let data = '';
    for await (const chunk of res) data += chunk.toString();
    assert.equal(data, 'hello world');
    await waitFor(() => handlerDone);
    assert.equal(handlerDone, true);
  } finally {
    server.close();
  }
});

test('cleans up source when client aborts mid-stream', async () => {
  let closed = false;
  const source = endlessSource();
  source.on('close', () => { closed = true; });
  const body = Readable.toWeb(source);
  let handlerDone = false;
  const server = await startServer(async (req, res) => {
    await pipeBodyToResponse(res, body);
    handlerDone = true;
  });
  try {
    const res = await httpGet(server);
    let gotData = false;
    res.on('data', () => { gotData = true; });
    await waitFor(() => gotData);
    res.destroy();
    await waitFor(() => handlerDone && closed);
    assert.equal(handlerDone, true);
    assert.equal(closed, true);
    assert.equal(source.destroyed, true);
  } finally {
    server.close();
  }
});

test('swallows upstream errors without throwing', async () => {
  const source = endlessSource();
  setTimeout(() => source.destroy(new Error('boom')), 50);
  const body = Readable.toWeb(source);
  let handlerDone = false;
  let handlerError = null;
  const server = await startServer(async (req, res) => {
    try {
      await pipeBodyToResponse(res, body);
      handlerDone = true;
    } catch (error) {
      handlerError = error;
    }
  });
  try {
    const req = httpGet(server);
    const res = await req;
    let sawEnd = false;
    let sawError = false;
    res.on('data', () => {});
    res.on('end', () => { sawEnd = true; });
    res.on('error', () => { sawError = true; });
    await waitFor(() => handlerDone || handlerError);
    await waitFor(() => sawEnd || sawError);
    assert.equal(handlerError, null);
    assert.equal(handlerDone, true);
    assert.equal(sawEnd, false);
    assert.equal(sawError, true);
  } finally {
    server.close();
  }
});

test('swallows abort-class upstream errors', async () => {
  const source = endlessSource();
  setTimeout(() => {
    const error = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    source.destroy(error);
  }, 50);
  const body = Readable.toWeb(source);
  let handlerDone = false;
  let handlerError = null;
  const server = await startServer(async (req, res) => {
    try {
      await pipeBodyToResponse(res, body);
      handlerDone = true;
    } catch (error) {
      handlerError = error;
    }
  });
  try {
    const res = await httpGet(server);
    let sawEnd = false;
    let sawError = false;
    res.on('data', () => {});
    res.on('end', () => { sawEnd = true; });
    res.on('error', () => { sawError = true; });
    await waitFor(() => handlerDone || handlerError);
    await waitFor(() => sawEnd || sawError);
    assert.equal(handlerError, null);
    assert.equal(handlerDone, true);
    assert.equal(sawEnd, false);
    assert.equal(sawError, true);
  } finally {
    server.close();
  }
});

test('cancels body when response already destroyed', async () => {
  const source = endlessSource();
  const body = Readable.toWeb(source);
  let handlerDone = false;
  const server = await startServer(async (req, res) => {
    res.destroy();
    await pipeBodyToResponse(res, body);
    handlerDone = true;
  });
  try {
    await assert.rejects(httpGet(server));
    await waitFor(() => handlerDone && source.destroyed);
    assert.equal(handlerDone, true);
    assert.equal(source.destroyed, true);
  } finally {
    server.close();
  }
});

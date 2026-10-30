import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claudeSessionEventsToMessages,
  collectHtmlDeliverables,
  collectWorkspaceFiles,
  dshSessionEventsToMessages,
  extractDshSystemPrompt,
  extractSystemPrompt,
  mergeConsecutiveAssistantMessages,
  parseJsonLines,
  objectPathFromReferer,
  prependSystemPrompt,
  rewriteHtmlRootUrls,
  sessionEventsToMessages,
  stripUserMeta,
  summarizeQuery,
  toolArgumentsToString,
} from '../src/trajectory.mjs';

const SESSION_EVENTS = [
  { type: 'session', id: 's1' },
  {
    type: 'message',
    message: {
      role: 'user',
      content: 'Sender (untrusted metadata):\n```json\n{"label": "cli"}\n```\n\n[2026-10-23 15:58 GMT+8] + 做一个断层的交互页面',
    },
  },
  {
    type: 'message',
    message: {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '先读 skill。' },
        { type: 'text', text: '我来看看。' },
        { type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: '~/.openclaw/workspace/SKILL.md' } },
      ],
    },
  },
  {
    type: 'message',
    message: {
      role: 'toolResult',
      toolCallId: 'call_1',
      toolName: 'read',
      content: [{ type: 'text', text: '---\nname: skill\n---' }],
    },
  },
  {
    type: 'message',
    message: {
      role: 'assistant',
      content: [
        { type: 'text', text: '' },
        { type: 'toolCall', id: 'call_2', name: 'write', arguments: '{"path":"index.html"}' },
      ],
    },
  },
  {
    type: 'message',
    message: { role: 'toolResult', toolCallId: 'call_2', isError: true, content: 'permission denied' },
  },
];

test('sessionEventsToMessages normalizes openclaw blocks', () => {
  const messages = sessionEventsToMessages(SESSION_EVENTS);
  assert.equal(messages.length, 5);
  assert.deepEqual(messages.map((message) => message.role), ['user', 'assistant', 'tool', 'assistant', 'tool']);
  assert.deepEqual(messages.map((message) => message.idx), [0, 1, 2, 3, 4]);

  assert.equal(messages[0].content, '做一个断层的交互页面');
  assert.equal(messages[1].reasoning_content, '先读 skill。');
  assert.equal(messages[1].content, '我来看看。');
  assert.equal(messages[1].tool_calls.length, 1);
  assert.equal(messages[1].tool_calls[0].function.name, 'read');
  assert.deepEqual(JSON.parse(messages[1].tool_calls[0].function.arguments), {
    path: '~/.openclaw/workspace/SKILL.md',
  });

  assert.equal(messages[2].tool_call_id, 'call_1');
  assert.equal(messages[2].content, '---\nname: skill\n---');
  assert.equal(messages[4].content, 'Error: permission denied');
  assert.equal(messages[3].content, '');
  assert.equal(messages[3].tool_calls[0].function.arguments, '{"path":"index.html"}');
});

test('stripUserMeta handles fenced and bare metadata headers', () => {
  assert.equal(
    stripUserMeta('Sender (untrusted metadata):\n```json\n{"label":"cli"}\n```\n\n[2026-10-23 15:58 GMT+8] + 问题'),
    '问题',
  );
  assert.equal(
    stripUserMeta('Sender (untrusted metadata):\n{"id":"cli","note":"{x}"}\n\n[2026-10-23 GMT+8] + 问题'),
    '问题',
  );
  assert.equal(stripUserMeta('普通问题'), '普通问题');
});

test('system prompt is extracted and prepended once', () => {
  const trace = [
    { type: 'trace.metadata', data: {} },
    { type: 'context.compiled', data: { systemPrompt: '你是 OpenClaw。' } },
  ];
  const prompt = extractSystemPrompt(trace);
  assert.equal(prompt, '你是 OpenClaw。');

  const messages = sessionEventsToMessages(SESSION_EVENTS);
  const withSystem = prependSystemPrompt(messages, prompt);
  assert.equal(withSystem.length, messages.length + 1);
  assert.equal(withSystem[0].role, 'system');
  assert.equal(withSystem[0].label, '系统提示 · OpenClaw');
  assert.equal(withSystem[1].idx, 1);
  assert.equal(prependSystemPrompt(withSystem, prompt), withSystem);
});

test('parseJsonLines skips broken lines without failing the file', () => {
  const parsed = parseJsonLines('{"type":"message"}\n\nnot-json\n{"type":"message"}\n');
  assert.equal(parsed.events.length, 2);
  assert.equal(parsed.parseErrors, 1);
});

test('summarizeQuery reads query1.json turns', () => {
  const summary = summarizeQuery({
    query: '总问题',
    agent_name: 'main',
    turns: [
      { turn: 1, user_input: '第一轮', agent_content: '回答一' },
      { user_input: '第二轮' },
    ],
  });
  assert.equal(summary.query, '总问题');
  assert.equal(summary.agentName, 'main');
  assert.equal(summary.turns.length, 2);
  assert.equal(summary.turns[1].turn, 2);
  assert.equal(summary.turns[1].agentContent, '');
});

test('collectHtmlDeliverables filters hidden dirs and keeps workspace/evaluator labels', () => {
  const root = 'obs://bucket/task/workspace/';
  const objects = [
    { path: 'obs://bucket/task/workspace/fault-scarp/index.html' },
    { path: 'obs://bucket/task/workspace/fault-scarp/style.css' },
    { path: 'obs://bucket/task/workspace/.git/hook.html' },
    { path: 'obs://bucket/task/workspace/node_modules/pkg/index.html' },
    { path: 'obs://bucket/task/workspace/README.HTM' },
  ];
  const workspace = collectHtmlDeliverables(objects, root, 'workspace');
  assert.deepEqual(workspace.map((item) => item.displayPath), ['fault-scarp/index.html', 'README.HTM']);
  assert.equal(workspace[0].name, 'index.html');

  const evaluator = collectHtmlDeliverables(
    [{ path: 'obs://bucket/task/workspace-evaluator/report/index.html' }],
    'obs://bucket/task/workspace-evaluator/',
    'evaluator',
  );
  assert.equal(evaluator[0].displayPath, 'workspace-evaluator/report/index.html');
});

test('collectWorkspaceFiles keeps all non-hidden files and marks html', () => {
  const root = 'obs://bucket/task/workspace/';
  const files = collectWorkspaceFiles([
    { path: 'obs://bucket/task/workspace/AGENTS.md' },
    { path: 'obs://bucket/task/workspace/fault-scarp/index.html' },
    { path: 'obs://bucket/task/workspace/fault-scarp/app.js' },
    { path: 'obs://bucket/task/workspace/.git/HEAD' },
    { path: 'obs://bucket/task/workspace/.openclaw/state.json' },
  ], root, 'workspace');
  assert.deepEqual(files.map((file) => file.displayPath), ['AGENTS.md', 'fault-scarp/app.js', 'fault-scarp/index.html']);
  assert.equal(files[2].isHtml, true);
  assert.equal(files[2].ext, 'html');
  assert.equal(files[0].isHtml, false);
});

test('rewriteHtmlRootUrls prefixes absolute assets and leaves external urls alone', () => {
  const html = [
    '<script src="/assets/app.js"></script>',
    '<link href="/assets/app.css">',
    '<img srcset="/assets/a.png 1x, /assets/b.png 2x">',
    '<div style="background:url(/assets/bg.png)"></div>',
    '<a href="//cdn.example/x">external</a>',
  ].join('');
  const prefix = '/trajectory/files/bucket/task/workspace/app/';
  const out = rewriteHtmlRootUrls(html, prefix);
  assert.match(out, /src="\/trajectory\/files\/bucket\/task\/workspace\/app\/assets\/app\.js"/);
  assert.match(out, /href="\/trajectory\/files\/bucket\/task\/workspace\/app\/assets\/app\.css"/);
  assert.match(out, /srcset="\/trajectory\/files\/bucket\/task\/workspace\/app\/assets\/a\.png 1x, \/trajectory\/files\/bucket\/task\/workspace\/app\/assets\/b\.png 2x"/);
  assert.match(out, /url\(\/trajectory\/files\/bucket\/task\/workspace\/app\/assets\/bg\.png\)/);
  assert.match(out, /href="\/\/cdn\.example\/x"/);
});

test('claudeSessionEventsToMessages maps user/assistant/tool_result/meta events', () => {
  const events = [
    { type: 'user', message: { role: 'user', content: '做一个核电站页面' } },
    {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '先看目录' },
          { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } },
        ],
      },
    },
    {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'a\nb' }],
      },
    },
    {
      type: 'user',
      isMeta: true,
      message: { role: 'user', content: [{ type: 'text', text: 'skill context' }] },
    },
    {
      type: 'user',
      isCompactSummary: true,
      message: { role: 'user', content: 'This session is being continued from a previous conversation' },
    },
    {
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: '页面已完成' }] },
    },
  ];
  const messages = claudeSessionEventsToMessages(events);
  assert.deepEqual(messages.map((message) => message.role), [
    'user', 'assistant', 'tool', 'system', 'system', 'assistant',
  ]);
  assert.equal(messages[1].reasoning_content, '先看目录');
  assert.equal(messages[1].tool_calls[0].function.name, 'Bash');
  assert.deepEqual(JSON.parse(messages[1].tool_calls[0].function.arguments), { command: 'ls' });
  assert.equal(messages[2].tool_call_id, 'toolu_1');
  assert.equal(messages[2].content, 'a\nb');
  assert.equal(messages[3].label, '注入上下文 · Claude Code');
  assert.equal(messages[4].label, '上下文压缩摘要 · Claude Code');
  assert.equal(messages[5].content, '页面已完成');
});

test('mergeConsecutiveAssistantMessages gives one avatar for thinking + tool call', () => {
  const tool = (id) => ({ id, type: 'function', function: { name: 'bash', arguments: '{}' } });
  const messages = [
    {
      idx: 0, role: 'assistant', preview: '', content_len: 0, content: '',
      reasoning_len: 3, reasoning_content: '想', tool_calls: [tool('c1')], weight: null,
      tool_call_id: null, label: null,
    },
    {
      idx: 1, role: 'assistant', preview: '', content_len: 4, content: '执行',
      reasoning_len: 2, reasoning_content: '继续', tool_calls: [tool('c2')], weight: null,
      tool_call_id: null, label: null,
    },
    {
      idx: 2, role: 'tool', preview: 'ok', content_len: 2, content: 'ok',
      reasoning_len: 0, reasoning_content: null, tool_calls: null, weight: null,
      tool_call_id: 'c2', label: null,
    },
    {
      idx: 3, role: 'system', preview: '', content_len: 1, content: 's',
      reasoning_len: 0, reasoning_content: null, tool_calls: null, weight: null,
      tool_call_id: null, label: '系统',
    },
    {
      idx: 4, role: 'assistant', preview: '', content_len: 5, content: '完成',
      reasoning_len: 0, reasoning_content: null, tool_calls: null, weight: null,
      tool_call_id: null, label: null,
    },
  ];
  const merged = mergeConsecutiveAssistantMessages(messages);
  assert.deepEqual(merged.map((message) => message.role), ['assistant', 'tool', 'system', 'assistant']);
  assert.deepEqual(merged.map((message) => message.idx), [0, 1, 2, 3]);
  assert.equal(merged[0].content, '执行');
  assert.equal(merged[0].reasoning_content, '想\n\n继续');
  assert.deepEqual(merged[0].tool_calls.map((call) => call.id), ['c1', 'c2']);
});

test('dshSessionEventsToMessages maps DSH user/assistant/tool events and system prompt', () => {
  const events = [
    { type: 'request/header', data: { header: { system: 'You are a DSH agent.' } } },
    { type: 'user/message', data: { content: [{ type: 'text', text: '做一个页面' }] } },
    {
      type: 'assistant/message',
      data: {
        message: {
          content: [
            { type: 'reasoning', text: '先看目录' },
            { type: 'tool-call', id: 'call_1', name: 'bash', arguments: '{"command":"ls"}' },
          ],
        },
      },
    },
    {
      type: 'tool/result',
      data: {
        message: {
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_1',
              content: [{ type: 'text', text: 'app.js' }],
              isError: false,
            },
          ],
        },
      },
    },
    { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '完成' }] } } },
  ];
  const system = extractDshSystemPrompt(events);
  assert.equal(system, 'You are a DSH agent.');

  const messages = dshSessionEventsToMessages(events);
  assert.deepEqual(messages.map((message) => message.role), ['user', 'assistant', 'tool', 'assistant']);
  assert.equal(messages[1].reasoning_content, '先看目录');
  assert.equal(messages[1].tool_calls[0].function.name, 'bash');
  assert.deepEqual(JSON.parse(messages[1].tool_calls[0].function.arguments), { command: 'ls' });
  assert.equal(messages[2].tool_call_id, 'call_1');
  assert.equal(messages[2].content, 'app.js');
  assert.equal(messages[3].content, '完成');
});

test('objectPathFromReferer maps root assets to the deliverable directory', () => {
  const host = '127.0.0.1:4318';
  const referer = 'http://127.0.0.1:4318/trajectory/files/bucket/task/workspace/app/dist/index.html';
  assert.equal(
    objectPathFromReferer(referer, host, '/assets/chunk.js'),
    'obs://bucket/task/workspace/app/dist/assets/chunk.js',
  );
  assert.equal(
    objectPathFromReferer('http://127.0.0.1:4318/trajectory/files/bucket/task/workspace/app/dist/', host, '/assets/chunk.js'),
    'obs://bucket/task/workspace/app/dist/assets/chunk.js',
  );
  assert.equal(
    objectPathFromReferer('http://127.0.0.1:4318/trajectory/files/bucket/task/workspace/app/dist/assets/index.css', host, '/assets/font.woff2'),
    'obs://bucket/task/workspace/app/dist/assets/font.woff2',
  );
  assert.equal(objectPathFromReferer(referer, 'evil:4318', '/assets/chunk.js'), null);
  assert.equal(objectPathFromReferer('http://127.0.0.1:4318/trajectory', host, '/assets/chunk.js'), null);
  assert.equal(objectPathFromReferer(referer, host, '/assets/../secret.js'), null);
});

test('toolArgumentsToString preserves strings and serializes objects', () => {
  assert.equal(toolArgumentsToString('{"a":1}'), '{"a":1}');
  assert.equal(toolArgumentsToString({ a: 1 }), '{"a":1}');
  assert.equal(toolArgumentsToString(undefined), '{}');
});

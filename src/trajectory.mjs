/**
 * OpenClaw 轨迹（trajectory）纯函数工具集。
 *
 * 这一层只做格式转换，不碰网络/obsutil，方便单测：
 * - openclaw session JSONL -> trajectory-viewer 需要的 Msg[]
 * - trace JSONL -> 系统提示 / 原数据
 * - workspace 对象列表 -> HTML 交付物清单
 */

const HTML_EXTENSION_RE = /\.(?:html?|htm)$/i;

/** 目录里这些隐藏/工具目录不属于交付物 */
const IGNORED_SEGMENTS = new Set([
  '.git',
  '.openclaw',
  '.agents',
  '.cache',
  '.checkpoint',
  '.output',
  'node_modules',
]);

/** 单条消息摘要最长字符数 */
const PREVIEW_MAX = 160;

/** 取多行文本的单行摘要 */
export function firstLine(text, max = PREVIEW_MAX) {
  const line = String(text ?? '')
    .trimStart()
    .split(/\s*\n\s*/)
    .filter(Boolean)
    .join(' ');
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

/**
 * 剥离 user 消息里的 `Sender (untrusted metadata):` JSON 头和
 * `[时间戳 GMT+8] +` 前缀，只留下干净的问题文本。
 * 与 trajectory-data-reviewer 的 stripUserMeta 保持同一套数据协议。
 */
export function stripUserMeta(content) {
  const raw = typeof content === 'string' ? content : String(content ?? '');
  const HEADER = 'Sender (untrusted metadata):';
  if (!raw.startsWith(HEADER)) return raw;

  let s = raw.slice(HEADER.length).replace(/^\s+/, '');
  if (s.startsWith('```')) {
    // ```json ... ``` 围栏形态
    s = s.replace(/^```[a-zA-Z0-9_-]*\s*\n?/, '');
    const end = s.indexOf('```');
    if (end >= 0) s = s.slice(end + 3);
  } else if (s.startsWith('{')) {
    // 裸 JSON 头：按花括号配平找结束位置，容忍字符串内的花括号和转义
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let i = 0; i < s.length; i += 1) {
      const ch = s[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = !inString;
      if (inString) continue;
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end >= 0) s = s.slice(end);
  }

  s = s.replace(/^\s*\[[^\]]*GMT\+8\]\s*\+?\s*/, '').trim();
  return s || raw;
}

/** 把字符串 / content block 数组转成纯文本 */
export function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (!block || typeof block !== 'object') return '';
        return block.text ?? block.content ?? block.thinking ?? '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (content == null) return '';
  return String(content);
}

/** 工具参数统一为字符串（trajectory-viewer 的 function.arguments 语义） */
export function toolArgumentsToString(args) {
  if (typeof args === 'string') return args;
  try {
    return JSON.stringify(args ?? {});
  } catch {
    return '{}';
  }
}

function makeMessage(role, content, extra = {}) {
  const text = String(content ?? '');
  return {
    idx: 0,
    role,
    preview: firstLine(text),
    content_len: text.length,
    content: text,
    reasoning_len: 0,
    reasoning_content: null,
    tool_calls: null,
    weight: null,
    tool_call_id: null,
    label: null,
    ...extra,
  };
}

/**
 * 把 openclaw 的 session JSONL events 转成消息流。
 * 兼容两种 content 形态：
 * - 字符串（session 文件里的 user / toolResult）
 * - block 数组（assistant 的 thinking / text / toolCall，以及 messagesSnapshot）
 */
export function sessionEventsToMessages(events) {
  const messages = [];

  for (const event of events) {
    if (!event || event.type !== 'message' || !event.message) continue;
    const message = event.message;
    const role = message.role;

    if (role === 'user') {
      const content = stripUserMeta(contentToText(message.content));
      messages.push(makeMessage('user', content));
      continue;
    }

    if (role === 'system') {
      messages.push(makeMessage('system', contentToText(message.content), {
        label: message.label ?? '系统提示',
      }));
      continue;
    }

    if (role === 'assistant') {
      const blocks = Array.isArray(message.content)
        ? message.content
        : [{ type: 'text', text: contentToText(message.content) }];

      const textParts = [];
      const reasoningParts = [];
      const toolCalls = [];

      for (const block of blocks) {
        if (!block || typeof block !== 'object') {
          if (typeof block === 'string' && block) textParts.push(block);
          continue;
        }
        const type = block.type;
        if (type === 'text' && typeof block.text === 'string') {
          textParts.push(block.text);
        } else if (type === 'thinking' || type === 'reasoning') {
          const reasoning = block.thinking ?? block.reasoning ?? block.text;
          if (typeof reasoning === 'string' && reasoning) reasoningParts.push(reasoning);
        } else if (type === 'toolCall' || type === 'tool_use' || type === 'tool_call') {
          const id = block.id ?? block.toolCallId ?? `call_${messages.length}_${toolCalls.length}`;
          const name = block.name ?? block.toolName ?? block.function?.name ?? 'tool';
          const args = block.arguments ?? block.input ?? block.function?.arguments;
          toolCalls.push({
            id: String(id),
            type: 'function',
            function: { name: String(name), arguments: toolArgumentsToString(args) },
          });
        }
      }

      const content = textParts.join('\n');
      const reasoning = reasoningParts.join('\n');
      messages.push(makeMessage('assistant', content, {
        reasoning_content: reasoning || null,
        reasoning_len: reasoning.length,
        tool_calls: toolCalls.length ? toolCalls : null,
      }));
      continue;
    }

    if (role === 'toolResult' || role === 'tool' || role === 'tool_result') {
      const isError = message.isError === true;
      let content = contentToText(message.content);
      if (isError && content && !/^error\b/i.test(content)) content = `Error: ${content}`;
      messages.push(makeMessage('tool', content, {
        tool_call_id: message.toolCallId ?? message.tool_call_id ?? null,
      }));
    }
  }

  return messages.map((message, idx) => ({ ...message, idx }));
}


/** Claude Code tool_result.content 可能是字符串，也可能是 text/image block 数组 */
function claudeToolResultText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (!block || typeof block !== 'object') return '';
        if (block.type === 'text') return block.text ?? '';
        if (block.type === 'image') return '[image]';
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (content == null) return '';
  return String(content);
}

/**
 * 把 Claude Code 的 session JSONL 转成 trajectory-viewer 的消息流。
 *
 * Claude Code 与 OpenClaw 的差异：
 * - 记录是顶层 `type: user | assistant`，消息在 `message.content` block 数组里；
 * - tool_result 放在 user 消息的 content block 中，而不是独立的 tool 消息；
 * - `isMeta` 的 user 消息是注入上下文，压缩摘要也是 user，但更适合系统折叠卡。
 */
export function claudeSessionEventsToMessages(events) {
  const messages = [];

  for (const event of events) {
    if (!event || !event.message) continue;
    const message = event.message;

    if (event.type === 'user') {
      const content = message.content;
      const isMeta = event.isMeta === true || message.isMeta === true;
      const textBlocks = Array.isArray(content)
        ? content.filter((block) => block?.type === 'text' && typeof block.text === 'string' && block.text)
        : [];
      const toolResults = Array.isArray(content)
        ? content.filter((block) => block?.type === 'tool_result')
        : [];
      const rawText = typeof content === 'string'
        ? content
        : textBlocks.map((block) => block.text).join('\n');

      if (rawText.trim()) {
        const isContinuation = /^This session is being continued/i.test(rawText)
          || event.isCompactSummary === true;
        messages.push(makeMessage(isMeta || isContinuation ? 'system' : 'user', rawText, {
          label: isContinuation
            ? '上下文压缩摘要 · Claude Code'
            : isMeta ? '注入上下文 · Claude Code' : null,
        }));
      }

      for (const block of toolResults) {
        let text = claudeToolResultText(block.content);
        if (block.is_error && text && !/^error\b/i.test(text)) text = `Error: ${text}`;
        messages.push(makeMessage('tool', text, {
          tool_call_id: block.tool_use_id ?? null,
        }));
      }
      continue;
    }

    if (event.type === 'assistant') {
      const blocks = Array.isArray(message.content)
        ? message.content
        : [{ type: 'text', text: contentToText(message.content) }];
      const textParts = [];
      const reasoningParts = [];
      const toolCalls = [];

      for (const block of blocks) {
        if (!block || typeof block !== 'object') {
          if (typeof block === 'string' && block) textParts.push(block);
          continue;
        }
        if (block.type === 'text' && typeof block.text === 'string' && block.text) {
          textParts.push(block.text);
        } else if (block.type === 'thinking' || block.type === 'reasoning') {
          const reasoning = block.thinking ?? block.reasoning ?? block.text;
          if (typeof reasoning === 'string' && reasoning) reasoningParts.push(reasoning);
        } else if (block.type === 'tool_use' || block.type === 'toolCall') {
          toolCalls.push({
            id: String(block.id ?? block.toolCallId ?? `call_${messages.length}_${toolCalls.length}`),
            type: 'function',
            function: {
              name: String(block.name ?? block.toolName ?? 'tool'),
              arguments: toolArgumentsToString(block.input ?? block.arguments),
            },
          });
        }
      }

      const content = textParts.join('\n');
      const reasoning = reasoningParts.join('\n');
      messages.push(makeMessage('assistant', content, {
        reasoning_content: reasoning || null,
        reasoning_len: reasoning.length,
        tool_calls: toolCalls.length ? toolCalls : null,
      }));
    }
  }

  return messages.map((message, idx) => ({ ...message, idx }));
}


/** 从 DSH 的 request/header 事件里提取系统提示 */
export function extractDshSystemPrompt(events) {
  for (const event of events) {
    if (event?.type !== 'request/header') continue;
    const system = event.data?.header?.system;
    if (typeof system === 'string' && system.trim()) return system;
  }
  return null;
}

/**
 * 把 DSH 的 session JSONL 转成 trajectory-viewer 的消息流。
 *
 * DSH 的 session 是事件流：user/message、assistant/message 和 tool/result；
 * assistant/message 的 content 包含 reasoning / text / tool-call blocks。
 */
export function dshSessionEventsToMessages(events) {
  const messages = [];

  for (const event of events) {
    if (event?.type === 'user/message') {
      const text = contentToText(event.data?.content);
      if (text.trim()) messages.push(makeMessage('user', text));
      continue;
    }

    if (event?.type === 'assistant/message') {
      const blocks = Array.isArray(event.data?.message?.content)
        ? event.data.message.content
        : [];
      const textParts = [];
      const reasoningParts = [];
      const toolCalls = [];

      for (const block of blocks) {
        if (!block || typeof block !== 'object') continue;
        if (block.type === 'text' && typeof block.text === 'string' && block.text) {
          textParts.push(block.text);
        } else if (block.type === 'reasoning') {
          const reasoning = block.text ?? block.reasoning ?? block.thinking;
          if (typeof reasoning === 'string' && reasoning) reasoningParts.push(reasoning);
        } else if (block.type === 'tool-call' || block.type === 'toolCall' || block.type === 'tool_use') {
          const args = block.arguments ?? block.input;
          toolCalls.push({
            id: String(block.id ?? block.toolCallId ?? `call_${messages.length}_${toolCalls.length}`),
            type: 'function',
            function: {
              name: String(block.name ?? block.toolName ?? 'tool'),
              arguments: toolArgumentsToString(args),
            },
          });
        }
      }

      const content = textParts.join('\n');
      const reasoning = reasoningParts.join('\n');
      messages.push(makeMessage('assistant', content, {
        reasoning_content: reasoning || null,
        reasoning_len: reasoning.length,
        tool_calls: toolCalls.length ? toolCalls : null,
      }));
      continue;
    }

    if (event?.type === 'tool/result') {
      const resultBlocks = event.data?.message?.content;
      if (!Array.isArray(resultBlocks)) continue;
      for (const block of resultBlocks) {
        if (block?.type !== 'tool-result') continue;
        let text = claudeToolResultText(block.content);
        if (block.isError && text && !/^error\b/i.test(text)) text = `Error: ${text}`;
        messages.push(makeMessage('tool', text, {
          tool_call_id: block.toolCallId ?? event.data?.message?.source?.callId ?? null,
        }));
      }
    }
  }

  return messages.map((message, idx) => ({ ...message, idx }));
}

/** 从 trace 事件里提取 openclaw 系统提示（context.compiled / prompt.submitted） */
export function extractSystemPrompt(traceEvents) {
  for (const event of traceEvents) {
    if (!event || typeof event !== 'object') continue;
    if (event.type !== 'context.compiled' && event.type !== 'prompt.submitted') continue;
    const prompt = event.data?.systemPrompt;
    if (typeof prompt === 'string' && prompt.trim()) return prompt;
  }
  return null;
}

/** 把系统提示插到消息流最前面；已有 system 消息则不重复插入 */
export function prependSystemPrompt(messages, systemPrompt, label = '系统提示 · OpenClaw') {
  if (!systemPrompt || messages.some((message) => message.role === 'system')) return messages;
  const system = makeMessage('system', systemPrompt, { label });
  return [{ ...system, idx: 0 }, ...messages.map((message, idx) => ({ ...message, idx: idx + 1 }))];
}

/** 解析 JSONL 文本；坏行跳过并计数，不中断整条轨迹 */
export function parseJsonLines(text) {
  const events = [];
  let parseErrors = 0;
  for (const line of String(text ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') events.push(parsed);
      else parseErrors += 1;
    } catch {
      parseErrors += 1;
    }
  }
  return { events, parseErrors };
}

/** query1.json -> 任务概览 */
export function summarizeQuery(payload) {
  if (!payload || typeof payload !== 'object') {
    return { query: '', agentName: null, turns: [] };
  }
  const rawTurns = Array.isArray(payload.turns) ? payload.turns : [];
  const turns = rawTurns.map((turn, index) => ({
    turn: Number(turn?.turn) || index + 1,
    userInput: typeof turn?.user_input === 'string' ? turn.user_input : '',
    agentContent: typeof turn?.agent_content === 'string' ? turn.agent_content : '',
  }));
  const query = typeof payload.query === 'string' && payload.query.trim()
    ? payload.query
    : turns[0]?.userInput || '';
  return {
    query,
    agentName: typeof payload.agent_name === 'string' ? payload.agent_name : null,
    turns,
  };
}

/**
 * 把 HTML 里的根绝对路径（/assets/...）重写到它所在的 OBS 目录前缀下。
 * 交付物经常是 Vite 构建产物，HTML 写死 /assets/...；直接代理时这些请求会打到
 * OBS Explorer 的根路径。这里按 HTML 所在目录补全前缀，同时兼容 srcset / inline style。
 */
export function rewriteHtmlRootUrls(html, dirPrefix) {
  const prefix = dirPrefix.endsWith('/') ? dirPrefix : `${dirPrefix}/`;
  const absolute = (value) => (
    value.startsWith('/') && !value.startsWith('//') ? `${prefix}${value.slice(1)}` : value
  );
  return String(html)
    .replace(
      /\b(src|href|poster|action|data-src)=("|')(\/(?!\/)[^"']*)\2/gi,
      (_match, attr, quote, value) => `${attr}=${quote}${prefix}${value.slice(1)}${quote}`,
    )
    .replace(/\bsrcset=("|')([^"']*)\1/gi, (_match, quote, value) => {
      const rewritten = value
        .split(',')
        .map((part) => {
          const trimmed = part.trim();
          if (!trimmed) return trimmed;
          const [url, ...descriptor] = trimmed.split(/\s+/);
          return [absolute(url), ...descriptor].join(' ');
        })
        .join(', ');
      return `srcset=${quote}${rewritten}${quote}`;
    })
    .replace(
      /url\(\s*(["']?)\/(?!\/)([^)"']+)\1\s*\)/gi,
      (_match, quote, value) => `url(${quote}${prefix}${value}${quote})`,
    )
    // 兜底：内联 module script 里的 "/assets/..." 字符串（常见于 Vite 产物）
    .replace(/(["'])\/(assets\/[^"']*)\1/g, (_match, quote, value) => `${quote}${prefix}${value}${quote}`);
}


/**
 * 交付物页面里发往站点根路径的绝对资源请求（如 Vite 预加载生成的 /assets/...）。
 * 浏览器会带上同源 Referer；用 Referer 所在的交付物目录拼回 OBS 对象路径。
 * 返回 null 表示不是本站交付物页面发起的请求。
 */
export function objectPathFromReferer(referer, host, requestedPathname) {
  if (!referer) return null;
  let refererUrl;
  try {
    refererUrl = new URL(referer);
  } catch {
    return null;
  }
  if (host && refererUrl.host !== host) return null;

  const prefix = '/trajectory/files/';
  if (!refererUrl.pathname.startsWith(prefix)) return null;

  let refererSegments;
  let requestedSegments;
  try {
    refererSegments = refererUrl.pathname
      .slice(prefix.length)
      .split('/')
      .map((segment) => decodeURIComponent(segment));
    requestedSegments = requestedPathname
      .replace(/^\/+/, '')
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .filter(Boolean);
  } catch {
    return null;
  }

  if (!refererUrl.pathname.endsWith('/')) refererSegments.pop();
  // Referer 可能来自 CSS/JS 资源本身（.../dist/assets/index.css），根绝对路径
  // 仍应相对交付物 app 根目录（.../dist/）解析，而不是再套一层 assets。
  if (refererSegments[refererSegments.length - 1] === 'assets') refererSegments.pop();
  const full = [...refererSegments.filter(Boolean), ...requestedSegments];
  if (full.length < 2 || full.some((segment) => segment === '.' || segment === '..')) return null;
  return `obs://${full.join('/')}`;
}

/** 判断相对路径是否落在隐藏/工具目录里 */
export function isIgnoredRelativePath(relativePath) {
  return String(relativePath)
    .split('/')
    .filter(Boolean)
    .some((segment) => IGNORED_SEGMENTS.has(segment));
}

/** 文件扩展名（小写，不含点）；无扩展名返回空串 */
export function extensionOfPath(filePath) {
  const name = String(filePath).replace(/\/+$/, '').split('/').pop() || '';
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(index + 1).toLowerCase() : '';
}

export function isHtmlPath(filePath) {
  return HTML_EXTENSION_RE.test(String(filePath));
}

/**
 * 从递归对象列表中整理出「整个 workspace」的文件清单。
 * 只过滤 .git / .openclaw / node_modules 等工具目录，保留普通文件与 HTML 交付物。
 * @param {{path:string,sizeBytes?:number,modified?:string}[]} objects
 * @param {string} root 形如 obs://bucket/.../workspace/
 * @param {'workspace'|'evaluator'} source
 */
export function collectWorkspaceFiles(objects, root, source = 'workspace') {
  const prefix = root.endsWith('/') ? root : `${root}/`;
  const seen = new Set();
  const files = [];

  for (const object of objects) {
    const objectPath = object?.path;
    if (typeof objectPath !== 'string' || !objectPath.startsWith(prefix)) continue;
    if (objectPath.endsWith('/')) continue;
    const relativePath = objectPath.slice(prefix.length);
    if (!relativePath || isIgnoredRelativePath(relativePath)) continue;
    if (seen.has(relativePath)) continue;
    seen.add(relativePath);
    const name = relativePath.split('/').pop() || relativePath;
    files.push({
      source,
      path: objectPath,
      relativePath,
      displayPath: source === 'workspace' ? relativePath : `workspace-evaluator/${relativePath}`,
      name,
      ext: extensionOfPath(name),
      isHtml: isHtmlPath(name),
      sizeBytes: Number.isFinite(object.sizeBytes) ? object.sizeBytes : null,
      modified: object.modified ?? null,
    });
  }

  files.sort((a, b) => a.displayPath.localeCompare(b.displayPath));
  return files;
}

/**
 * 从整个 workspace 文件清单里筛出 HTML 交付物。
 * @param {{path:string,name?:string}[]} objects
 * @param {string} root 形如 obs://bucket/.../workspace/
 * @param {'workspace'|'evaluator'} source
 */
export function collectHtmlDeliverables(objects, root, source = 'workspace') {
  return collectWorkspaceFiles(objects, root, source).filter((file) => file.isHtml);
}


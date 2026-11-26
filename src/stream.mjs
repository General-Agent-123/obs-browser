import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * 把 fetch 返回的 web ReadableStream 用 pipeline 推给响应。
 * HTTP handler 通常在 pipe 建立后就已经 return，这里的任何错误都不允许抛出：
 * - 客户端中途断开：pipeline 以 ERR_STREAM_PREMATURE_CLOSE 收场并销毁源流，
 *   fromWeb 适配器的销毁会 cancel web stream，undici 随之中止上游连接（不留僵尸连接）。
 * - 上游中途出错（含 fetch 超时的 AbortError）：销毁响应，就地消化，进程不倒。
 */
export async function pipeBodyToResponse(res, webBody) {
  if (!webBody) {
    res.end();
    return;
  }
  if (res.destroyed) {
    await webBody.cancel().catch(() => {});
    return;
  }
  try {
    await pipeline(Readable.fromWeb(webBody), res);
  } catch (error) {
    if (error?.code === 'ERR_STREAM_PREMATURE_CLOSE' || res.destroyed || res.writableEnded) return;
    res.destroy();
  }
}

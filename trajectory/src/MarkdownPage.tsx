import { useEffect, useState } from 'react';
import type { TrajectoryPreview } from './api';
import { downloadUrl, fetchPreview } from './api';
import { MarkdownPreview } from './markdown';

type Theme = 'dark' | 'light';

function initialTheme(): Theme {
  try {
    return localStorage.getItem('obs-trajectory:theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

interface MarkdownPageProps {
  filePath: string;
}

/**
 * 新标签打开 markdown 时的独立查看页，入口形如 /trajectory/?file=obs://bucket/.../report.md。
 * 复用预览接口拿原文，与弹层共用同一个 MarkdownPreview，支持渲染/源码切换。
 */
export default function MarkdownPage({ filePath }: MarkdownPageProps) {
  const [data, setData] = useState<TrajectoryPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  const name = filePath.replace(/\/+$/, '').split('/').pop() || filePath;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    fetchPreview(filePath, controller.signal)
      .then((payload) => {
        if (!controller.signal.aborted) setData(payload);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filePath]);

  useEffect(() => {
    document.title = `${name} · Markdown`;
  }, [name]);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('obs-trajectory:theme', next);
      } catch {
        // ignore
      }
      return next;
    });
  }

  const text = data?.text ?? '';

  return (
    <div className={`traj-app traj-theme-${theme} traj-md-page`}>
      <header className="traj-md-page-head">
        <div className="traj-md-page-title">
          <strong title={name}>{name}</strong>
          <span title={filePath}>{filePath}</span>
        </div>
        <div className="traj-preview-actions">
          <div className="traj-mini-tabs" role="tablist" aria-label="markdown 视图切换">
            <button type="button" className={raw ? '' : 'is-active'} onClick={() => setRaw(false)}>
              渲染
            </button>
            <button type="button" className={raw ? 'is-active' : ''} onClick={() => setRaw(true)}>
              源码
            </button>
          </div>
          <button type="button" onClick={toggleTheme}>
            {theme === 'dark' ? '浅色' : '深色'}
          </button>
          <a href={downloadUrl(filePath)}>下载</a>
          <a href="/trajectory/">轨迹查看器</a>
        </div>
      </header>
      <main className="traj-md-page-main">
        {loading ? (
          <div className="traj-preview-state">
            <span className="traj-spinner" />
            正在读取文件…
          </div>
        ) : error ? (
          <div className="traj-preview-state traj-preview-message">
            <strong>读取失败</strong>
            <span>{error}</span>
            <a href={downloadUrl(filePath)}>下载文件</a>
          </div>
        ) : !data?.supported ? (
          <div className="traj-preview-state traj-preview-message">
            <strong>无法内联预览</strong>
            <span>
              {data?.reason === 'too-large'
                ? '文件超过预览大小上限，请下载后查看。'
                : '该文件类型暂不支持在页面内预览。'}
            </span>
            <a href={downloadUrl(filePath)}>下载文件</a>
          </div>
        ) : raw ? (
          <pre className="traj-preview-text traj-md-page-source">{text}</pre>
        ) : (
          <article className="traj-md-page-doc">
            <MarkdownPreview text={text} basePath={filePath} />
          </article>
        )}
      </main>
    </div>
  );
}
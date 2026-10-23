import { useEffect, useMemo, useState } from 'react';
import { TrajectoryViewer } from 'trajectory-viewer';
import type { TrajectoryDataSource } from 'trajectory-viewer';
import {
  createDataSource,
  downloadUrl,
  fetchOverview,
  fetchPreview,
  formatBytes,
  formatDate,
  trajectoryFileUrl,
} from './api';
import type { TrajectoryFile, TrajectoryOverview, TrajectoryPreview } from './api';

type Theme = 'dark' | 'light';

const LAST_PATH_KEY = 'obs-trajectory:last-path';

function initialPath(): string {
  const fromQuery = new URLSearchParams(window.location.search).get('path') || '';
  if (fromQuery) return fromQuery;
  try {
    return localStorage.getItem(LAST_PATH_KEY) || '';
  } catch {
    return '';
  }
}

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    back: '<path d="M15 5 8 12l7 7"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    external: '<path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.34 5.66"/><path d="M20 4v7h-7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    folder: '<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3l2.1 2.3H18a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 19.3H6a2.5 2.5 0 0 1-2.5-2.5z"/>',
    file: '<path d="M6 3.5h7l5 5v12H6zM13 3.5v5h5"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
    sun: '<path d="M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
  };
  return (
    <svg
      className="traj-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: paths[name] || '' }}
    />
  );
}

function statsChips(overview: TrajectoryOverview | null): Array<{ label: string; value: string }> {
  if (!overview?.ok) return [];
  const stats = overview.stats as
    | { task_level?: unknown; best_completion?: unknown; agents?: Array<Record<string, unknown>> }
    | null
    | undefined;
  const firstAgent = Array.isArray(stats?.agents) ? stats?.agents[0] : null;
  const chips: Array<{ label: string; value: string }> = [];
  if (stats?.task_level) chips.push({ label: 'Level', value: String(stats.task_level) });
  if (firstAgent?.tool_calls != null) chips.push({ label: 'Tool calls', value: String(firstAgent.tool_calls) });
  if (firstAgent?.assistant_rounds != null) chips.push({ label: 'Rounds', value: String(firstAgent.assistant_rounds) });
  if (firstAgent?.total_tokens != null) {
    chips.push({ label: 'Tokens', value: Number(firstAgent.total_tokens).toLocaleString('en-US') });
  }
  chips.push({ label: 'Files', value: String(overview.workspaceFiles?.length ?? 0) });
  chips.push({ label: 'HTML', value: String(overview.deliverables?.length ?? 0) });
  return chips;
}


interface TreeNode {
  name: string;
  path: string;
  dirs: Map<string, TreeNode>;
  files: TrajectoryFile[];
}

/** 把文件列表按 displayPath 聚成目录树 */
function buildFileTree(files: TrajectoryFile[]): TreeNode {
  const root: TreeNode = { name: '', path: '', dirs: new Map(), files: [] };
  for (const file of files) {
    const parts = file.displayPath.split('/').filter(Boolean);
    let node = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const name = parts[index];
      const path = parts.slice(0, index + 1).join('/');
      let child = node.dirs.get(name);
      if (!child) {
        child = { name, path, dirs: new Map(), files: [] };
        node.dirs.set(name, child);
      }
      node = child;
    }
    node.files.push(file);
  }
  return root;
}

function countTreeFiles(node: TreeNode): number {
  let count = node.files.length;
  for (const child of node.dirs.values()) count += countTreeFiles(child);
  return count;
}

function fileKindLabel(file: TrajectoryFile): string {
  return file.isHtml ? 'HTML' : file.ext ? file.ext.toUpperCase() : 'FILE';
}

/** 侧栏 workspace 文件树：目录默认展开两层，文件点击进入预览 */
function FileTree({
  node,
  depth = 0,
  onOpen,
}: {
  node: TreeNode;
  depth?: number;
  onOpen: (file: TrajectoryFile) => void;
}) {
  const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      {files.map((file) => (
        <button
          type="button"
          className={`traj-tree-file${file.isHtml ? ' is-html' : ''}`}
          key={file.path}
          style={{ paddingLeft: 15 + depth * 12 }}
          onClick={() => onOpen(file)}
          title={`${file.displayPath} · 点击预览`}
        >
          <span className="traj-tree-icon">
            <Icon name="file" size={13} />
          </span>
          <span className="traj-tree-name">{file.name}</span>
          <span className="traj-tree-meta">{fileKindLabel(file)}</span>
        </button>
      ))}
      {dirs.map((dir) => (
        <details className="traj-tree-dir" key={dir.path} open={depth < 2}>
          <summary style={{ paddingLeft: 5 + depth * 12 }}>
            <span className="traj-tree-chevron">›</span>
            <span className="traj-tree-icon">
              <Icon name="folder" size={13} />
            </span>
            <span className="traj-tree-name" title={dir.path}>{dir.name}</span>
            <span className="traj-tree-count">{countTreeFiles(dir)}</span>
          </summary>
          <FileTree node={dir} depth={depth + 1} onOpen={onOpen} />
        </details>
      ))}
    </>
  );
}

export default function App() {
  const [path, setPath] = useState(initialPath);
  const [pathInput, setPathInput] = useState(path);
  const [pathError, setPathError] = useState<string | null>(null);
  const [overview, setOverview] = useState<TrajectoryOverview | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem('obs-trajectory:theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [selection, setSelection] = useState<{ agent: string; session: string } | null>(null);
  const [queryExpanded, setQueryExpanded] = useState(false);
  const [fileView, setFileView] = useState<'all' | 'html'>('all');
  const [preview, setPreview] = useState<{ file: TrajectoryFile; tick: number } | null>(null);
  const [previewData, setPreviewData] = useState<TrajectoryPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      setOverview(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchOverview(path, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setOverview(data);
        if (data.ok) {
          try {
            localStorage.setItem(LAST_PATH_KEY, path);
          } catch {
            // ignore
          }
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
        setOverview(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, reloadKey]);

  useEffect(() => {
    const sessions = overview?.sessions ?? [];
    if (!overview?.ok || !sessions.length) {
      setSelection(null);
      return;
    }
    setSelection((previous) => {
      if (
        previous &&
        sessions.some(
          (session) => session.agent === previous.agent && session.file === previous.session,
        )
      ) {
        return previous;
      }
      const first = sessions.find((session) => session.agent === 'main') ?? sessions[0];
      return first ? { agent: first.agent, session: first.file } : null;
    });
  }, [overview]);

  useEffect(() => {
    if (!preview) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPreview(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [preview]);

  useEffect(() => {
    if (!preview) {
      setPreviewData(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    if (preview.file.isHtml) {
      setPreviewData(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    const controller = new AbortController();
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);
    fetchPreview(preview.file.path, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setPreviewData(data);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setPreviewError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false);
      });
    return () => controller.abort();
  }, [preview]);

  const selectedSession = useMemo(
    () =>
      overview?.sessions?.find(
        (session) => session.agent === selection?.agent && session.file === selection.session,
      ) ?? null,
    [overview, selection],
  );

  const dataSource = useMemo<TrajectoryDataSource | null>(() => {
    if (!path || !selection) return null;
    return createDataSource(path, selection.agent, selection.session);
  }, [path, selection]);

  const files = overview?.workspaceFiles ?? [];
  const deliverables = overview?.deliverables ?? [];
  const deliveryFiles = useMemo(
    () => (files.length ? files : deliverables),
    [files, deliverables],
  );
  const deliveryPaths = useMemo(
    () => deliveryFiles.map((item) => item.displayPath),
    [deliveryFiles],
  );
  const deliveryUrls = useMemo(
    () => new Map(deliveryFiles.map((item) => [item.displayPath, trajectoryFileUrl(item.path)])),
    [deliveryFiles],
  );
  const treeFiles = useMemo(
    () => files.filter((file) => fileView === 'all' || file.isHtml),
    [files, fileView],
  );
  const fileTree = useMemo(() => buildFileTree(treeFiles), [treeFiles]);
  const previewText = useMemo(() => {
    const text = previewData?.text ?? '';
    if (previewData?.kind === 'json') {
      try {
        return JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        return text;
      }
    }
    return text;
  }, [previewData]);
  const queryText = overview?.runs?.query?.query || '';
  const statChips = statsChips(overview);

  function openPath(nextPath: string) {
    const trimmed = nextPath.trim();
    if (!trimmed) {
      setPathError('请输入 OBS 轨迹目录');
      return;
    }
    if (!/^obs:\/\//i.test(trimmed)) {
      setPathError('路径必须以 obs:// 开头');
      return;
    }
    setPathError(null);
    const next = trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
    if (next === path) {
      setReloadKey((key) => key + 1);
      return;
    }
    setPath(next);
    setPathInput(next);
    setSelection(null);
    setOverview(null);
    const url = new URL(window.location.href);
    url.searchParams.set('path', next);
    window.history.replaceState(null, '', url.toString());
  }

  async function copyPath() {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unsupported
    }
  }

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

  const obsExplorerHref = path ? `/#${encodeURIComponent(path)}` : '/';
  const workspaceHref = overview?.workspace?.root
    ? `/#${encodeURIComponent(overview.workspace.root)}`
    : obsExplorerHref;

  return (
    <div className={`traj-app traj-theme-${theme}`}>
      <aside className="traj-side">
        <div className="traj-brand">
          <a className="traj-back" href={obsExplorerHref}>
            <Icon name="back" size={14} />
            OBS Explorer
          </a>
          <button type="button" className="traj-icon-btn" onClick={toggleTheme} title="切换主题">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </div>

        <div className="traj-title">
          <div className="traj-eyebrow">TRAJECTORY</div>
          <h1 title={overview?.name || path}>{overview?.name || '轨迹查看器'}</h1>
          {path ? (
            <button type="button" className="traj-path" onClick={copyPath} title="复制路径">
              <span>{path}</span>
              <span className="traj-copy">{copied ? '已复制' : <Icon name="copy" size={13} />}</span>
            </button>
          ) : (
            <p className="traj-muted">从 OBS Explorer 的文件夹行进入，或在下方粘贴轨迹目录。</p>
          )}
        </div>

        <form
          className="traj-path-form"
          onSubmit={(event) => {
            event.preventDefault();
            openPath(pathInput);
          }}
        >
          <input
            value={pathInput}
            onChange={(event) => setPathInput(event.target.value)}
            placeholder="obs://bucket/openclaw_trajs/..."
            spellCheck={false}
            aria-label="轨迹目录路径"
          />
          <button type="submit">打开</button>
        </form>
        {pathError ? <p className="traj-form-error">{pathError}</p> : null}

        {loading ? (
          <div className="traj-side-state">
            <span className="traj-spinner" />
            正在读取 OBS 轨迹…
          </div>
        ) : null}

        {error && !loading ? (
          <div className="traj-side-state traj-error">
            <strong>无法读取轨迹目录</strong>
            <span>{error}</span>
            <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
              重试
            </button>
          </div>
        ) : null}

        {overview && !overview.ok && !loading ? (
          <div className="traj-side-state traj-error">
            <strong>这不是一个可识别的轨迹目录</strong>
            <span>
              需要包含 <code>agents/</code> 或 <code>workspace/</code> 子目录。
            </span>
            {overview.folders?.length ? (
              <span className="traj-muted">当前子目录：{overview.folders.join('、')}</span>
            ) : null}
          </div>
        ) : null}

        {overview?.ok && !loading ? (
          <>
            <section className="traj-section">
              <div className="traj-section-head">
                <h2>概览</h2>
                <span>{overview.runs?.latest || 'no run'}</span>
              </div>
              <div className="traj-chips">
                {statChips.map((chip) => (
                  <span className="traj-chip" key={chip.label}>
                    <em>{chip.label}</em>
                    {chip.value}
                  </span>
                ))}
              </div>
              <div className="traj-meta-grid">
                <span>Workspace</span>
                <strong>{overview.workspace?.fileCount ?? 0} files</strong>
                {overview.evaluator?.fileCount ? (
                  <>
                    <span>Evaluator</span>
                    <strong>{overview.evaluator.fileCount} files</strong>
                  </>
                ) : null}
                <span>Agents</span>
                <strong>{overview.agents?.length ?? 0}</strong>
                <span>Runs</span>
                <strong>{overview.runs?.list?.length ?? 0}</strong>
              </div>
            </section>

            <section className="traj-section">
              <div className="traj-section-head">
                <h2>Session</h2>
                <span>{overview.sessions?.length ?? 0} 条</span>
              </div>
              {overview.sessions?.length ? (
                <label className="traj-select">
                  <select
                    value={selection ? `${selection.agent}|${selection.session}` : ''}
                    onChange={(event) => {
                      const [agent, session] = event.target.value.split('|');
                      if (agent && session) setSelection({ agent, session });
                    }}
                  >
                    {overview.sessions.map((session) => (
                      <option key={`${session.agent}/${session.file}`} value={`${session.agent}|${session.file}`}>
                        {session.agent} · {session.id.slice(0, 8)} · {formatDate(session.modified)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="traj-muted">agent 目录下没有 session JSONL。</p>
              )}
              {selectedSession ? (
                <div className="traj-session-meta">
                  <span>{formatBytes(selectedSession.sizeBytes)}</span>
                  <span>{selectedSession.hasTrace ? 'trace ✓' : '无 trace'}</span>
                  <span>{selectedSession.file}</span>
                </div>
              ) : null}
            </section>

            <section className="traj-section">
              <div className="traj-section-head">
                <h2>Workspace</h2>
                <span>{files.length} 个文件</span>
              </div>
              <div className="traj-workspace-bar">
                <div className="traj-mini-tabs">
                  <button
                    type="button"
                    className={fileView === 'all' ? 'is-active' : ''}
                    onClick={() => setFileView('all')}
                  >
                    全部 {files.length}
                  </button>
                  <button
                    type="button"
                    className={fileView === 'html' ? 'is-active' : ''}
                    onClick={() => setFileView('html')}
                  >
                    HTML {deliverables.length}
                  </button>
                </div>
                <a
                  href={workspaceHref}
                  target="_blank"
                  rel="noreferrer"
                  title="在 OBS Explorer 中浏览整个 workspace"
                >
                  <Icon name="folder" size={13} />
                  OBS
                </a>
              </div>
              {files.length ? (
                <div className="traj-tree">
                  <FileTree node={fileTree} onOpen={(file) => setPreview({ file, tick: Date.now() })} />
                </div>
              ) : (
                <p className="traj-muted">workspace 下没有找到文件。</p>
              )}
              {overview.filesTruncated ? (
                <p className="traj-muted">文件较多，仅展示前 2000 个；可在 OBS 中查看完整目录。</p>
              ) : null}
            </section>

            {queryText ? (
              <section className="traj-section">
                <div className="traj-section-head">
                  <h2>任务 Query</h2>
                  <button
                    type="button"
                    className="traj-link-btn"
                    onClick={() => setQueryExpanded((value) => !value)}
                  >
                    {queryExpanded ? '收起' : '展开'}
                  </button>
                </div>
                <p className={queryExpanded ? 'traj-query is-open' : 'traj-query'}>{queryText}</p>
              </section>
            ) : null}
          </>
        ) : null}

        <div className="traj-side-foot">
          <span>只读 · 数据来自 OBS</span>
          <span>{overview?.generatedAt ? formatDate(new Date(overview.generatedAt).toISOString()) : ''}</span>
        </div>
      </aside>

      <main className="traj-main">
        <header className="traj-main-head">
          <div className="traj-main-title">
            <strong>{overview?.name || 'Trajectory Viewer'}</strong>
            <span>
              {selectedSession ? `${selectedSession.agent} / ${selectedSession.id}` : '消息流 · 原数据 · 交付物'}
            </span>
          </div>
          <div className="traj-main-actions">
            {overview?.ok ? (
              <a className="traj-head-btn" href={obsExplorerHref}>
                <Icon name="folder" size={15} />
                OBS 中打开
              </a>
            ) : null}
            <button
              type="button"
              className="traj-icon-btn"
              onClick={() => setReloadKey((key) => key + 1)}
              title="刷新轨迹"
              disabled={loading || !path}
            >
              <Icon name="refresh" />
            </button>
          </div>
        </header>

        <div className="traj-viewer">
          {!path ? (
            <div className="traj-landing">
              <div className="traj-landing-mark">
                <Icon name="chevron" size={26} />
              </div>
              <h2>打开一条 OpenClaw 轨迹</h2>
              <p>
                在 OBS Explorer 中点击文件夹行的「作为轨迹数据打开」，或直接粘贴一个包含
                <code> agents/ </code>与<code> workspace/ </code>的目录。
              </p>
              <form
                className="traj-landing-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  openPath(pathInput);
                }}
              >
                <input
                  value={pathInput}
                  onChange={(event) => setPathInput(event.target.value)}
                  placeholder="obs://s3-asset-.../openclaw_trajs/frontend_1023_1547/00001_.../"
                  spellCheck={false}
                />
                <button type="submit">打开轨迹</button>
              </form>
              {pathError ? <p className="traj-form-error">{pathError}</p> : null}
              <a className="traj-landing-link" href="/">
                返回 OBS Explorer
              </a>
            </div>
          ) : loading ? (
            <div className="traj-center-state">
              <span className="traj-spinner" />
              <p>正在读取轨迹目录与交付物…</p>
            </div>
          ) : error ? (
            <div className="traj-center-state traj-center-error">
              <h2>读取失败</h2>
              <p>{error}</p>
              <div className="traj-center-actions">
                <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
                  重试
                </button>
                <a href={obsExplorerHref}>在 OBS Explorer 中查看</a>
              </div>
            </div>
          ) : overview && !overview.ok ? (
            <div className="traj-center-state traj-center-error">
              <h2>不是轨迹目录</h2>
              <p>
                该目录下没有 <code>agents/</code> 或 <code>workspace/</code>。请选择
                <code> openclaw_trajs/ </code>下单个任务目录。
              </p>
              <div className="traj-center-actions">
                <a href={obsExplorerHref}>在 OBS Explorer 中查看</a>
              </div>
            </div>
          ) : dataSource ? (
            <TrajectoryViewer
              dataSource={dataSource}
              delivery={deliveryPaths}
              resolveDeliveryUrl={(deliveryPath) => deliveryUrls.get(deliveryPath) || '#'}
              theme={theme}
            />
          ) : (
            <div className="traj-center-state">
              <h2>没有可展示的 Session</h2>
              <p>该轨迹目录只有 workspace，没有 agent session JSONL。</p>
            </div>
          )}
        </div>
      </main>

      {preview ? (
        <div className="traj-preview-backdrop" role="dialog" aria-modal="true" aria-label="文件预览">
          <div className="traj-preview-panel">
            <div className="traj-preview-head">
              <div>
                <strong>{preview.file.name}</strong>
                <span>{preview.file.displayPath}</span>
              </div>
              <div className="traj-preview-actions">
                <button type="button" onClick={() => setPreview({ ...preview, tick: Date.now() })}>
                  <Icon name="refresh" size={14} />
                  刷新
                </button>
                <a href={downloadUrl(preview.file.path)}>
                  <Icon name="file" size={14} />
                  下载
                </a>
                <a href={trajectoryFileUrl(preview.file.path)} target="_blank" rel="noreferrer">
                  <Icon name="external" size={14} />
                  新标签
                </a>
                <button type="button" className="traj-icon-btn" onClick={() => setPreview(null)} title="关闭">
                  <Icon name="close" />
                </button>
              </div>
            </div>
            <div className="traj-preview-body">
              {preview.file.isHtml ? (
                <iframe
                  key={`${preview.file.path}-${preview.tick}`}
                  src={`${trajectoryFileUrl(preview.file.path)}?v=${preview.tick}`}
                  title={preview.file.displayPath}
                />
              ) : previewLoading ? (
                <div className="traj-preview-state">
                  <span className="traj-spinner" />
                  正在读取文件…
                </div>
              ) : previewError ? (
                <div className="traj-preview-state traj-preview-message">
                  <strong>读取失败</strong>
                  <span>{previewError}</span>
                  <a href={downloadUrl(preview.file.path)}>下载文件</a>
                </div>
              ) : !previewData?.supported ? (
                <div className="traj-preview-state traj-preview-message">
                  <strong>无法内联预览</strong>
                  <span>
                    {previewData?.reason === 'too-large'
                      ? '文件超过预览大小上限，请下载后查看。'
                      : '该文件类型暂不支持在页面内预览。'}
                  </span>
                  <a href={downloadUrl(preview.file.path)}>下载文件</a>
                </div>
              ) : previewData.kind === 'image' && previewData.url ? (
                <div className="traj-preview-media">
                  <img src={previewData.url} alt={preview.file.name} />
                </div>
              ) : previewData.kind === 'pdf' && previewData.url ? (
                <iframe src={previewData.url} title={preview.file.displayPath} />
              ) : previewData.kind === 'video' && previewData.url ? (
                <div className="traj-preview-media">
                  <video controls src={previewData.url} />
                </div>
              ) : previewData.kind === 'audio' && previewData.url ? (
                <div className="traj-preview-media">
                  <audio controls src={previewData.url} />
                </div>
              ) : (
                <pre className="traj-preview-text">{previewText}</pre>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

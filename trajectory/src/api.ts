import type { Msg, MsgPage, TrajectoryDataSource } from 'trajectory-viewer';

export interface TrajectorySession {
  provider: 'openclaw' | 'claude-code' | 'dsh' | string;
  agent: string;
  project?: string | null;
  id: string;
  file: string;
  path: string;
  sizeBytes: number | null;
  modified: string | null;
  hasTrace: boolean;
}

/** 当前选中的 session 寻址信息 */
export interface SessionSelection {
  provider: string;
  agent: string;
  project?: string | null;
  session: string;
}

export interface TrajectoryFile {
  source: 'workspace' | 'evaluator';
  path: string;
  relativePath: string;
  displayPath: string;
  name: string;
  ext: string;
  isHtml: boolean;
  sizeBytes: number | null;
  modified: string | null;
}

export type TrajectoryDeliverable = TrajectoryFile;

export interface TrajectoryTurn {
  turn: number;
  userInput: string;
  agentContent: string;
}

export interface TrajectoryRunInfo {
  latest: string | null;
  list: string[];
  query: {
    query: string;
    agentName: string | null;
    turns: TrajectoryTurn[];
  };
  stats: Record<string, unknown> | null;
}

export interface TrajectoryOverview {
  ok: boolean;
  reason?: string;
  path: string;
  name: string;
  generatedAt?: number;
  hasAgents?: boolean;
  hasProjects?: boolean;
  hasDsh?: boolean;
  hasWorkspace?: boolean;
  folders?: string[];
  files?: string[];
  agents?: Array<{ name: string; path: string; sessions: TrajectorySession[] }>;
  sessions?: TrajectorySession[];
  runs?: TrajectoryRunInfo;
  stats?: Record<string, unknown> | null;
  workspace?: {
    root: string;
    exists: boolean;
    totalObjects: number;
    truncated: boolean;
    fileCount?: number;
    filesTruncated?: boolean;
  };
  evaluator?: {
    root: string;
    exists: boolean;
    totalObjects: number;
    truncated: boolean;
    fileCount?: number;
    filesTruncated?: boolean;
  };
  workspaceFiles?: TrajectoryFile[];
  filesTruncated?: boolean;
  deliverables?: TrajectoryDeliverable[];
}

export interface TrajectoryRaw {
  provider: string;
  project?: string | null;
  folderPath: string;
  agent: string;
  session: string;
  sessionFile: string;
  traceFile: string | null;
  systemPrompt: string | null;
  parseErrors: number;
  sessionEvents: unknown[];
  traceEvents: unknown[];
  query: TrajectoryRunInfo['query'] | null;
  stats: Record<string, unknown> | null;
}

export interface TrajectoryPreview {
  supported: boolean;
  inline?: boolean;
  kind?: 'json' | 'text' | 'image' | 'pdf' | 'video' | 'audio' | string;
  text?: string | null;
  url?: string;
  reason?: string;
  stat?: {
    name?: string;
    sizeBytes?: number | null;
    modified?: string | null;
    contentType?: string | null;
  };
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = (payload as { error?: string } | null)?.error || `请求失败（HTTP ${response.status}）`;
    throw new Error(message);
  }
  return payload as T;
}

export function trajectoryFileUrl(objectPath: string): string {
  const rest = objectPath.replace(/^obs:\/\//i, '');
  return `/trajectory/files/${rest.split('/').map(encodeURIComponent).join('/')}`;
}

export function fetchOverview(path: string, signal?: AbortSignal): Promise<TrajectoryOverview> {
  return getJson<TrajectoryOverview>(`/api/trajectory/overview?path=${encodeURIComponent(path)}`, signal);
}

export async function fetchMessages(
  path: string,
  selection: SessionSelection,
  from: number,
  limit: number,
): Promise<MsgPage> {
  const query = new URLSearchParams({
    path,
    agent: selection.agent,
    session: selection.session,
    provider: selection.provider || 'openclaw',
    from: String(from),
    limit: String(limit),
  });
  if (selection.project) query.set('project', selection.project);
  const page = await getJson<MsgPage & { total: number }>(`/api/trajectory/messages?${query}`);
  return {
    messages: (page.messages ?? []) as Msg[],
    from: page.from,
    returned: page.returned,
    has_more: page.has_more === true,
  };
}

export function fetchRaw(path: string, selection: SessionSelection): Promise<TrajectoryRaw> {
  const query = new URLSearchParams({
    path,
    agent: selection.agent,
    session: selection.session,
    provider: selection.provider || 'openclaw',
  });
  if (selection.project) query.set('project', selection.project);
  return getJson<TrajectoryRaw>(`/api/trajectory/raw?${query}`);
}

export function fetchPreview(objectPath: string, signal?: AbortSignal): Promise<TrajectoryPreview> {
  return getJson<TrajectoryPreview>(`/api/preview?path=${encodeURIComponent(objectPath)}`, signal);
}

export function downloadUrl(objectPath: string): string {
  return `/api/download?path=${encodeURIComponent(objectPath)}`;
}

export function createDataSource(path: string, selection: SessionSelection): TrajectoryDataSource {
  return {
    fetchMessages: ({ from, limit }) => fetchMessages(path, selection, from, limit),
    fetchRaw: () => fetchRaw(path, selection),
  };
}

export function formatBytes(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) return '—';
  const bytes = Number(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

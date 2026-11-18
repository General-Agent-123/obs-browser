const FALLBACK_PATH =
  'obs://s3-asset-b-hd-cce-aifm-nlp-exp/task_data/261018/1018_frontend_scientific_mechanism_oc/task_configs/';
const PAGE_SIZE = 200;
// 全量搜索翻页时单页拉取的条目数；/api/list 服务端上限也是 1000
const FULL_SEARCH_PAGE_SIZE = 1000;
// 全量搜索匹配项过多时列表最多渲染的行数，超出部分以提示行代替，避免上万行 DOM 拖垮页面
const FULL_SEARCH_RENDER_LIMIT = 2000;
// 搜索运行中两次渲染之间的最小间隔；页到达比这更快时合并渲染
const FULL_SEARCH_RENDER_INTERVAL_MS = 400;
const BATCH_MAX_ITEMS = 200;
const PINNED_KEY = 'obs-explorer:pinned:v1';
const RECENT_KEY = 'obs-explorer:recent:v1';
const CODE_EXTENSIONS = new Set([
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'py', 'pyi', 'sh',
  'bash', 'zsh', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cc', 'cpp', 'hpp',
  'cs', 'php', 'swift', 'sql', 'graphql', 'gql', 'tf', 'hcl', 'lua', 'pl',
  'ex', 'exs', 'clj', 'scala', 'gradle', 'r', 'jl', 'm', 'mm',
]);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico']);
const ARCHIVE_EXTENSIONS = new Set(['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar']);
const TEXT_EXTENSIONS = new Set([
  'txt', 'text', 'md', 'markdown', 'rst', 'log', 'yaml', 'yml', 'toml', 'ini',
  'conf', 'cfg', 'env', 'xml', 'html', 'htm', 'css', 'scss', 'sass', 'less',
  'properties', 'gitignore', 'dockerfile', 'makefile', 'r',
]);

const ICONS = {
  folder: '<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3l2.1 2.3H18a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 19.3H6a2.5 2.5 0 0 1-2.5-2.5z"/><path d="M3.8 10.2h16.4"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  download: '<path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 20h14"/>',
  eye: '<path d="M2.7 12s3.4-5.6 9.3-5.6 9.3 5.6 9.3 5.6-3.4 5.6-9.3 5.6S2.7 12 2.7 12Z"/><circle cx="12" cy="12" r="2.4"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  star: '<path d="m12 3.8 2.5 5 5.5.8-4 3.9.95 5.5-4.95-2.6-4.95 2.6L8 13.5l-4-3.9 5.5-.8z"/>',
  starFill: '<path d="m12 3.8 2.5 5 5.5.8-4 3.9.95 5.5-4.95-2.6-4.95 2.6L8 13.5l-4-3.9 5.5-.8z" fill="currentColor"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.4l3 1.7"/>',
  database: '<ellipse cx="12" cy="6.2" rx="7.4" ry="3"/><path d="M4.6 6.2v5.6c0 1.66 3.31 3 7.4 3s7.4-1.34 7.4-3V6.2"/><path d="M4.6 11.8v5.6c0 1.66 3.31 3 7.4 3s7.4-1.34 7.4-3v-5.6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  inbox: '<path d="M4 5.5h16v13H4z"/><path d="M4 13h4.5l1.5 2h4l1.5-2H20"/>',
  alert: '<path d="M12 3.8 21 20H3z"/><path d="M12 9v5M12 17.3v.2"/>',
  link: '<path d="m9.5 14.5 5-5"/><path d="M7.8 17.2 6.3 18.7a3.7 3.7 0 0 1-5.2-5.2l3-3a3.7 3.7 0 0 1 5.2 0"/><path d="m16.2 6.8 1.5-1.5a3.7 3.7 0 0 1 5.2 5.2l-3 3a3.7 3.7 0 0 1-5.2 0"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.34 5.66"/><path d="M20 4v7h-7"/>',
  upload: '<path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M5 20h14"/>',
  folderPlus: '<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3l2.1 2.3H18a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 19.3H6a2.5 2.5 0 0 1-2.5-2.5z"/><path d="M12 11v5M9.5 13.5h5"/>',
  trash: '<path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M6.5 7l.8 12.1A1.9 1.9 0 0 0 9.2 21h5.6a1.9 1.9 0 0 0 1.9-1.9L17.5 7"/><path d="M10 11v6M14 11v6"/>',
  move: '<path d="M4 7h16M4 12h10M4 17h7"/><path d="m17 12 4 3-4 3"/>',
  trajectory: '<path d="M3 12h3.2l2.3-6 3.6 12 2.4-6H21"/>',
};

const state = {
  meta: null,
  metaError: null,
  path: '',
  entries: [],
  folders: 0,
  objects: 0,
  nextMarker: null,
  limit: PAGE_SIZE,
  elapsedMs: null,
  totalBytes: 0,
  count: {
    status: 'idle',
    total: null,
    atLeast: false,
    error: null,
    controller: null,
  },
  loading: true,
  loadingMore: false,
  error: null,
  query: '',
  filter: 'all',
  recursive: false,
  search: {
    status: 'idle',
    query: '',
    items: [],
    scanned: 0,
    matched: 0,
    pages: 0,
    elapsedMs: 0,
    stopReason: null,
    error: null,
    controller: null,
    maxResults: 0,
    maxScan: 0,
  },
  // 当前层全量搜索（非递归）：回车触发，逐页拉取未加载分页后本地过滤
  fullSearch: {
    status: 'idle',
    query: '',
    path: null,
    controller: null,
    pages: 0,
    startedAt: 0,
    elapsedMs: 0,
    matched: 0,
    error: null,
  },
  sortKey: 'name',
  sortDir: 1,
  buckets: [],
  bucketsLoading: true,
  bucketsError: null,
  bucketQuery: '',
  selectedPath: null,
  selected: new Set(),
  batchLimit: BATCH_MAX_ITEMS,
  pinned: loadStore(PINNED_KEY),
  recent: loadStore(RECENT_KEY),
  lastSync: null,
  editingPath: false,
  listAbort: null,
  bucketAbort: null,
  previewAbort: null,
  inspector: {
    open: false,
    entry: null,
    loading: false,
    data: null,
    error: null,
    tab: 'preview',
    jsonMode: 'pretty',
  },
  modal: {
    open: false,
    type: null,
    busy: false,
    onConfirm: null,
    onCancel: null,
  },
  upload: {
    files: [],
    rows: [],
    currentIndex: -1,
    xhr: null,
    cancelled: false,
    overwrite: false,
    success: 0,
    conflicts: 0,
    failures: 0,
  },
  batch: {
    action: null,
    paths: [],
    running: false,
    controller: null,
    destination: null,
    total: 0,
    completed: 0,
    failures: [],
  },
};

const dom = {
  app: document.getElementById('app'),
  shell: document.querySelector('.shell'),
  menuButton: document.getElementById('menuButton'),
  drawerBackdrop: document.getElementById('drawerBackdrop'),
  sidebar: document.getElementById('sidebar'),
  brandLink: document.getElementById('brandLink'),
  connection: document.getElementById('connection'),
  connectionLabel: document.getElementById('connectionLabel'),
  topRefreshButton: document.getElementById('topRefreshButton'),
  logoutLink: document.getElementById('logoutLink'),
  bucketSearch: document.getElementById('bucketSearch'),
  bucketList: document.getElementById('bucketList'),
  bucketCount: document.getElementById('bucketCount'),
  pinnedSection: document.getElementById('pinnedSection'),
  pinnedList: document.getElementById('pinnedList'),
  pinnedCount: document.getElementById('pinnedCount'),
  recentSection: document.getElementById('recentSection'),
  recentList: document.getElementById('recentList'),
  progressTrack: document.getElementById('progressTrack'),
  pathRow: document.getElementById('pathRow'),
  upButton: document.getElementById('upButton'),
  breadcrumbs: document.getElementById('breadcrumbs'),
  starButton: document.getElementById('starButton'),
  copyPathButton: document.getElementById('copyPathButton'),
  editPathButton: document.getElementById('editPathButton'),
  refreshButton: document.getElementById('refreshButton'),
  pathForm: document.getElementById('pathForm'),
  pathInput: document.getElementById('pathInput'),
  cancelPathButton: document.getElementById('cancelPathButton'),
  locationEyebrow: document.getElementById('locationEyebrow'),
  folderTitle: document.getElementById('folderTitle'),
  folderMeta: document.getElementById('folderMeta'),
  searchInput: document.getElementById('searchInput'),
  searchField: document.getElementById('searchField'),
  recursiveToggle: document.getElementById('recursiveToggle'),
  searchShortcut: document.getElementById('searchShortcut'),
  searchBanner: document.getElementById('searchBanner'),
  searchBannerIcon: document.getElementById('searchBannerIcon'),
  searchBannerTitle: document.getElementById('searchBannerTitle'),
  searchBannerQuery: document.getElementById('searchBannerQuery'),
  searchBannerStats: document.getElementById('searchBannerStats'),
  searchActionButton: document.getElementById('searchActionButton'),
  clearSearchButton: document.getElementById('clearSearchButton'),
  filterChips: document.getElementById('filterChips'),
  toolbar: document.querySelector('.toolbar'),
  allCount: document.getElementById('allCount'),
  folderCount: document.getElementById('folderCount'),
  fileCount: document.getElementById('fileCount'),
  listState: document.getElementById('listState'),
  tableRegion: document.getElementById('tableRegion'),
  tableScroll: document.getElementById('tableScroll'),
  rows: document.getElementById('rows'),
  loadMoreWrap: document.getElementById('loadMoreWrap'),
  loadMoreButton: document.getElementById('loadMoreButton'),
  selectAllCheckbox: document.getElementById('selectAllCheckbox'),
  batchBar: document.getElementById('batchBar'),
  batchCount: document.getElementById('batchCount'),
  batchLimitHint: document.getElementById('batchLimitHint'),
  batchMoveButton: document.getElementById('batchMoveButton'),
  batchCopyButton: document.getElementById('batchCopyButton'),
  batchDeleteButton: document.getElementById('batchDeleteButton'),
  clearSelectionButton: document.getElementById('clearSelectionButton'),
  uploadButton: document.getElementById('uploadButton'),
  newFolderButton: document.getElementById('newFolderButton'),
  fileInput: document.getElementById('fileInput'),
  dropOverlay: document.getElementById('dropOverlay'),
  dropTarget: document.getElementById('dropTarget'),
  footDot: document.getElementById('footDot'),
  footStatus: document.getElementById('footStatus'),
  endpointLabel: document.getElementById('endpointLabel'),
  syncLabel: document.getElementById('syncLabel'),
  inspector: document.getElementById('inspector'),
  inspectorBackdrop: document.getElementById('inspectorBackdrop'),
  previewBadge: document.getElementById('previewBadge'),
  previewName: document.getElementById('previewName'),
  previewPath: document.getElementById('previewPath'),
  previewPathText: document.getElementById('previewPathText'),
  closeInspectorButton: document.getElementById('closeInspectorButton'),
  previewMeta: document.getElementById('previewMeta'),
  copyContentButton: document.getElementById('copyContentButton'),
  previewBody: document.getElementById('previewBody'),
  copyObjectPathButton: document.getElementById('copyObjectPathButton'),
  downloadButton: document.getElementById('downloadButton'),
  modalBackdrop: document.getElementById('modalBackdrop'),
  modal: document.getElementById('modal'),
  modalIcon: document.getElementById('modalIcon'),
  modalTitle: document.getElementById('modalTitle'),
  modalSubtitle: document.getElementById('modalSubtitle'),
  modalBody: document.getElementById('modalBody'),
  modalCloseButton: document.getElementById('modalCloseButton'),
  modalCancelButton: document.getElementById('modalCancelButton'),
  modalConfirmButton: document.getElementById('modalConfirmButton'),
  toast: document.getElementById('toast'),
  toastIcon: document.getElementById('toastIcon'),
  toastText: document.getElementById('toastText'),
  inspectorTabs: document.querySelector('.inspector-tabs'),
  sortButtons: [...document.querySelectorAll('.sort-button')],
};

let toastTimer = null;
let lastActiveBucket = null;

/* Boot --------------------------------------------------------------------- */

bindEvents();
const initialHash = readHash();
state.path = normalizePathSafe(initialHash) || FALLBACK_PATH;
renderAll({ resetScroll: true });

const metaPromise = loadMeta();
const bucketPromise = loadBuckets();

metaPromise.finally(async () => {
  const target = normalizePathSafe(initialHash) || normalizePathSafe(state.meta?.defaultPath) || FALLBACK_PATH;
  await Promise.all([bucketPromise, loadPath(target, { history: 'replace' })]);
});

setInterval(() => {
  renderStatus();
}, 30_000);

/* Data --------------------------------------------------------------------- */

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    if (response.status === 401) {
      const target = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/login?next=${encodeURIComponent(target)}`);
    }
    const message = payload?.error || `请求失败（HTTP ${response.status}）`;
    throw new Error(message);
  }
  return payload;
}

async function loadMeta() {
  try {
    state.meta = await fetchJson('/api/meta');
    state.batchLimit = Number(state.meta?.batchMaxItems) || BATCH_MAX_ITEMS;
    state.metaError = null;
  } catch (error) {
    state.metaError = error.message;
  }
  if (dom.logoutLink) dom.logoutLink.hidden = !state.meta?.authEnabled;
  renderConnection();
  renderStatus();
}

async function loadBuckets(force = false) {
  state.bucketsLoading = true;
  state.bucketAbort?.abort();
  state.bucketAbort = new AbortController();
  renderBuckets();
  renderStatus();
  try {
    const query = force ? '?refresh=1' : '';
    const data = await fetchJson(`/api/buckets${query}`, { signal: state.bucketAbort.signal });
    state.buckets = data.buckets;
    state.bucketsError = null;
  } catch (error) {
    if (error.name !== 'AbortError') state.bucketsError = error.message;
  } finally {
    state.bucketsLoading = false;
    renderBuckets();
    renderStatus();
  }
}

async function loadPath(input, { force = false, resetView = true, history = 'push' } = {}) {
  let target;
  try {
    target = normalizePathInput(input);
  } catch (error) {
    showToast(error.message, true);
    return;
  }

  if (!force && !state.loading && target === state.path && !state.error && !isSearchView()) {
    if (history === 'push') pushHistory(target);
    return;
  }

  state.listAbort?.abort();
  const controller = new AbortController();
  state.listAbort = controller;

  state.count.controller?.abort();
  state.count = { status: 'idle', total: null, atLeast: false, error: null, controller: null };

  abortSearchStream();
  state.recursive = false;
  state.search = blankSearch();
  abortFullSearch();
  state.fullSearch = blankFullSearch();
  state.selected.clear();
  state.path = target;
  state.loading = true;
  state.loadingMore = false;
  state.error = null;
  state.entries = [];
  state.folders = 0;
  state.objects = 0;
  state.nextMarker = null;
  state.elapsedMs = null;
  state.totalBytes = 0;
  state.selectedPath = null;

  if (resetView) {
    state.query = '';
    state.filter = 'all';
    dom.searchInput.value = '';
  }

  closeInspector({ silent: true });
  closeSidebar();
  closePathEditor();

  if (history === 'push') pushHistory(target);
  if (history === 'replace') replaceHistory(target);

  renderAll({ resetScroll: true });

  try {
    const data = await fetchJson(
      `/api/list?path=${encodeURIComponent(target)}&limit=${PAGE_SIZE}${force ? '&refresh=1' : ''}`,
      { signal: controller.signal },
    );
    if (controller.signal.aborted) return;

    state.entries = data.entries;
    state.folders = data.counts.folders;
    state.objects = data.counts.objects;
    state.nextMarker = data.nextMarker;
    state.limit = data.limit;
    state.elapsedMs = data.elapsedMs;
    state.totalBytes = data.objects.reduce((sum, object) => sum + (object.sizeBytes || 0), 0);
    state.lastSync = new Date();
    state.error = null;
    addRecent(target);
    if (data.hasMore) startCount(target, { force });
  } catch (error) {
    if (error.name === 'AbortError' || controller.signal.aborted) return;
    state.error = error.message;
    state.entries = [];
    state.nextMarker = null;
  } finally {
    if (state.listAbort === controller) {
      state.loading = false;
      renderAll({ resetScroll: true });
    }
  }
}

/** 把一页列举结果按 path 去重后并入当前目录条目，并刷新计数。 */
function mergeListedEntries(entries) {
  const seen = new Set(state.entries.map((entry) => entry.path));
  for (const entry of entries) {
    if (!seen.has(entry.path)) {
      state.entries.push(entry);
      seen.add(entry.path);
    }
  }
  state.folders = state.entries.filter((entry) => entry.type === 'folder').length;
  state.objects = state.entries.filter((entry) => entry.type === 'file').length;
  state.totalBytes = state.entries
    .filter((entry) => entry.type === 'file')
    .reduce((sum, object) => sum + (object.sizeBytes || 0), 0);
  state.lastSync = new Date();
}

async function loadMore() {
  if (!state.nextMarker || state.loading || state.loadingMore) return;
  state.loadingMore = true;
  renderLoadMore();
  renderStatus();

  try {
    const data = await fetchJson(
      `/api/list?path=${encodeURIComponent(state.path)}&limit=${PAGE_SIZE}&marker=${encodeURIComponent(state.nextMarker)}`,
    );
    mergeListedEntries(data.entries);
    state.nextMarker = data.nextMarker;
  } catch (error) {
    if (error.name !== 'AbortError') showToast(`加载更多失败：${error.message}`, true);
  } finally {
    state.loadingMore = false;
    renderAll();
  }
}

/* 目录总数 --------------------------------------------------------------- */

async function startCount(target, { force = false } = {}) {
  const controller = new AbortController();
  state.count = { status: 'loading', total: null, atLeast: false, error: null, controller };
  renderTitle();

  try {
    const data = await fetchJson(
      `/api/count?path=${encodeURIComponent(target)}${force ? '&refresh=1' : ''}`,
      { signal: controller.signal },
    );
    if (
      controller.signal.aborted
      || state.path !== target
      || state.count.controller !== controller
    ) return;
    state.count = {
      status: 'done',
      total: Number(data.total) || 0,
      atLeast: Boolean(data.atLeast),
      error: null,
      controller: null,
    };
  } catch (error) {
    if (error.name === 'AbortError' || controller.signal.aborted) return;
    if (state.path !== target || state.count.controller !== controller) return;
    state.count = {
      status: 'error',
      total: null,
      atLeast: false,
      error: error.message,
      controller: null,
    };
  }

  if (state.path === target) renderTitle();
}

function formatTotalCount(count) {
  const value = Math.max(0, Number(count.total) || 0);
  return `${count.atLeast ? '≥' : ''}${value.toLocaleString('zh-CN')}`;
}

/* Recursive search --------------------------------------------------------- */

function blankSearch(overrides = {}) {
  return {
    status: 'idle',
    query: '',
    items: [],
    scanned: 0,
    matched: 0,
    pages: 0,
    elapsedMs: 0,
    stopReason: null,
    error: null,
    controller: null,
    maxResults: 0,
    maxScan: 0,
    ...overrides,
  };
}

function isSearchView() {
  return (
    state.recursive &&
    ['prompt', 'running', 'done', 'error', 'cancelled'].includes(state.search.status)
  );
}

function searchSortedItems() {
  const sorted = [...state.search.items].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' });
    if (byName !== 0) return byName;
    return String(a.relativeDir || '').localeCompare(String(b.relativeDir || ''), 'zh-CN');
  });
  return state.sortDir === 1 ? sorted : sorted.reverse();
}

function abortSearchStream() {
  const controller = state.search.controller;
  state.search.controller = null;
  if (controller) controller.abort();
}

function renderSearchMode() {
  dom.searchField.classList.toggle('is-recursive', state.recursive);
  dom.recursiveToggle.setAttribute('aria-pressed', String(state.recursive));
  // 普通模式：输入框内容与生效查询词不一致时高亮，提示按 Enter 应用
  const pending =
    !state.recursive && dom.searchInput.value.trim() !== state.query;
  dom.searchField.classList.toggle('is-pending', pending);
  dom.searchInput.placeholder = state.recursive
    ? '输入文件名，Enter 递归搜索'
    : '搜索当前目录，Enter 全量搜索';
  dom.searchInput.setAttribute(
    'aria-label',
    state.recursive ? '递归搜索文件名' : '搜索当前目录',
  );
  dom.searchShortcut.textContent = state.recursive ? '↵' : pending ? '↵' : '/';
  dom.searchShortcut.title = state.recursive
    ? '按 Enter 开始递归搜索'
    : pending
      ? '按 Enter 应用当前输入并全量搜索'
      : '按 Enter 全量搜索当前目录（含未加载分页）';
}

function renderSearchUI({ resetScroll = false } = {}) {
  renderTitle();
  renderFilters();
  renderRows({ resetScroll });
  renderSortHeaders();
  renderSearchBanner();
  renderStatus();
}

function toggleRecursiveSearch() {
  clearSelection();
  // 进入/离开递归模式都结束当前层全量搜索，避免后台翻页与递归搜索互相干扰
  abortFullSearch();
  state.fullSearch = blankFullSearch();
  if (state.recursive) {
    abortSearchStream();
    state.recursive = false;
    state.search = blankSearch();
    renderSearchMode();
    renderSearchUI({ resetScroll: true });
    return;
  }

  state.recursive = true;
  // 切入递归模式时以输入框当前内容为准（普通模式输入不再实时同步 state.query）
  const query = dom.searchInput.value.trim();
  state.query = query;
  state.search = blankSearch(
    query ? { status: 'prompt', query } : {},
  );
  state.sortKey = 'name';
  state.sortDir = 1;
  renderSearchMode();
  renderSearchUI({ resetScroll: true });
  dom.searchInput.focus();
  dom.searchInput.setSelectionRange(dom.searchInput.value.length, dom.searchInput.value.length);
}

function handleSearchInput() {
  if (!state.recursive) {
    // 输入过程列表保持不动，避免被误解为即时搜索；按 Enter 才开始全量搜索。
    // 只有清空输入框时才结束搜索、恢复完整列表。
    const value = dom.searchInput.value;
    renderSearchMode();
    if (!value.trim()) {
      const hadQuery = Boolean(state.query) || state.fullSearch.status !== 'idle';
      abortFullSearch();
      state.fullSearch = blankFullSearch();
      if (hadQuery || state.query) {
        state.query = '';
        clearSelection();
        renderSearchMode();
        renderTitle();
        renderFilters();
        renderRows({ resetScroll: true });
        renderSearchBanner();
        renderStatus();
      }
    }
    return;
  }

  state.query = dom.searchInput.value;
  clearSelection();
  abortSearchStream();
  const query = state.query.trim();
  state.search = blankSearch(query ? { status: 'prompt', query } : {});
  state.sortKey = 'name';
  state.sortDir = 1;
  renderSearchUI({ resetScroll: true });
}

function clearRecursiveSearch() {
  abortSearchStream();
  abortFullSearch();
  clearSelection();
  state.recursive = false;
  state.query = '';
  dom.searchInput.value = '';
  state.search = blankSearch();
  state.fullSearch = blankFullSearch();
  renderSearchMode();
  renderSearchUI({ resetScroll: true });
  dom.searchInput.blur();
}

function stopRecursiveSearch() {
  if (state.search.status !== 'running') return;
  abortSearchStream();
  state.search.status = 'cancelled';
  renderSearchUI();
}

/* Full-directory search（当前层全量搜索）------------------------------------ */

function blankFullSearch(overrides = {}) {
  return {
    status: 'idle',
    query: '',
    path: null,
    controller: null,
    pages: 0,
    startedAt: 0,
    elapsedMs: 0,
    matched: 0,
    error: null,
    ...overrides,
  };
}

function abortFullSearch() {
  const task = state.fullSearch;
  const controller = task?.controller;
  if (!controller) return;
  task.controller = null;
  controller.abort();
}

function stopFullSearch() {
  const task = state.fullSearch;
  if (task.status !== 'running' || !task.controller) return;
  task.status = 'cancelled';
  task.elapsedMs = task.startedAt ? Date.now() - task.startedAt : 0;
  abortFullSearch();
}

function startFullSearch() {
  if (state.recursive) return;
  if (state.loading) {
    showToast('目录仍在加载，请稍后再试', true);
    return;
  }
  // 查询词以 Enter 时刻的输入框内容为准（输入过程不实时生效）
  const query = dom.searchInput.value.trim();
  if (!query) {
    showToast('请输入要搜索的名称', true);
    dom.searchInput.focus();
    return;
  }
  state.query = query;

  // 重入时中止旧任务即可：已拉取的条目保留，翻页会从 nextMarker 继续
  abortFullSearch();
  clearSelection();
  if (state.inspector.open) closeInspector({ silent: true });

  const task = blankFullSearch({
    status: 'running',
    query,
    path: state.path,
    controller: new AbortController(),
    startedAt: Date.now(),
  });
  state.fullSearch = task;
  renderRows({ resetScroll: true });
  renderSearchMode();
  renderSearchBanner();
  renderTitle();
  renderStatus();
  runFullSearch(task);
}

async function runFullSearch(task) {
  const controller = task.controller;
  let lastRenderAt = 0;
  let pendingRender = false;
  try {
    while (!controller.signal.aborted && state.fullSearch === task) {
      if (!state.nextMarker) {
        task.status = 'done';
        break;
      }
      const marker = state.nextMarker;
      const data = await fetchJson(
        `/api/list?path=${encodeURIComponent(state.path)}&limit=${FULL_SEARCH_PAGE_SIZE}&marker=${encodeURIComponent(marker)}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted || state.fullSearch !== task) return;

      mergeListedEntries(data.entries);
      state.nextMarker = data.nextMarker;
      task.pages += 1;
      task.elapsedMs = Date.now() - task.startedAt;
      const isLastPage = !data.nextMarker;

      if (task.matched >= FULL_SEARCH_RENDER_LIMIT && !isLastPage) {
        // 匹配数已到渲染上限：行列表封顶，只刷新计数与文本，不再重建上万行
        state.fullSearch.matched = visibleEntries().length;
        renderSearchBanner();
        renderStatus();
      } else if (
        isLastPage
        || !lastRenderAt
        || Date.now() - lastRenderAt >= FULL_SEARCH_RENDER_INTERVAL_MS
      ) {
        // 最后一页始终渲染，保证数据完整上屏；其余页按最小间隔节流合并渲染
        renderRows();
        renderSearchBanner();
        renderTitle();
        renderStatus();
        lastRenderAt = Date.now();
        pendingRender = false;
      } else {
        pendingRender = true;
      }

      if (isLastPage) {
        task.status = 'done';
        break;
      }
      if (data.nextMarker === marker) {
        task.status = 'error';
        task.error = '分页标记未前进，已停止加载';
        break;
      }
    }
  } catch (error) {
    if (controller.signal.aborted || state.fullSearch !== task) return;
    task.status = 'error';
    task.error = error.message;
  } finally {
    // 结束（完成/停止/出错）时行 DOM 与最后一次页渲染一致，无需重建；
    // 只更新状态标记与文案，避免完成瞬间再闪一次入场动画。
    // 注意不能在这里移除 is-searching：.file-row 基础样式是 opacity: 0，
    // class 留到下一次 renderRows 重建行时再随 toggle 移除（旧行被丢弃，不会重放）。
    if (state.fullSearch === task) {
      task.controller = null;
      task.elapsedMs = task.startedAt ? Date.now() - task.startedAt : 0;
      dom.tableScroll.setAttribute('aria-busy', 'false');
      if (pendingRender) {
        renderRows();
        pendingRender = false;
      }
      renderLoadMore();
      renderSearchBanner();
      renderTitle();
      renderStatus();
    }
  }
}

async function startRecursiveSearch() {
  if (!state.recursive) return;
  // 以 Enter 时刻输入框内容为准，避免依赖输入过程中同步的旧值
  const query = dom.searchInput.value.trim();
  if (!query) {
    showToast('请输入要搜索的文件名', true);
    dom.searchInput.focus();
    return;
  }

  state.query = query;
  dom.searchInput.value = query;
  clearSelection();
  abortSearchStream();
  if (state.inspector.open) closeInspector({ silent: true });

  const controller = new AbortController();
  state.sortKey = 'name';
  state.sortDir = 1;
  state.search = blankSearch({
    status: 'running',
    query,
    controller,
  });

  renderSearchMode();
  renderSearchUI({ resetScroll: true });

  let doneReceived = false;

  try {
    const params = new URLSearchParams({ path: state.path, q: query });
    const response = await fetch(`/api/search?${params}`, {
      signal: controller.signal,
      headers: { Accept: 'application/x-ndjson' },
    });

    if (!response.ok) {
      let message = `搜索请求失败（HTTP ${response.status}）`;
      try {
        const payload = await response.json();
        if (payload?.error) message = payload.error;
      } catch {
        // Keep the HTTP fallback message.
      }
      throw new Error(message);
    }
    if (!response.body) throw new Error('搜索接口没有返回数据流');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (state.search.controller !== controller) return;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          const event = JSON.parse(line);
          if (event.type === 'done') doneReceived = true;
          handleSearchEvent(event);
        }
        newline = buffer.indexOf('\n');
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      const event = JSON.parse(buffer.trim());
      if (event.type === 'done') doneReceived = true;
      handleSearchEvent(event);
    }

    if (state.search.controller === controller && state.search.status === 'running' && !doneReceived) {
      state.search.status = 'error';
      state.search.error = '搜索连接意外中断，请重试';
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (state.search.controller !== controller) return;
    state.search.status = 'error';
    state.search.error = error.message;
  } finally {
    if (state.search.controller === controller) {
      state.search.controller = null;
      renderSearchBanner();
      renderTitle();
      renderStatus();
    }
  }
}

function handleSearchEvent(event) {
  if (event.type === 'start') {
    state.search.maxResults = event.maxResults || 0;
    state.search.maxScan = event.maxScan || 0;
    return;
  }

  if (event.type === 'matches' && Array.isArray(event.items)) {
    const seen = new Set(state.search.items.map((item) => item.path));
    for (const item of event.items) {
      if (!seen.has(item.path)) {
        state.search.items.push(item);
        seen.add(item.path);
      }
    }
    state.search.matched = state.search.items.length;
    renderRows();
    renderSearchBanner();
    renderTitle();
    renderStatus();
    return;
  }

  if (event.type === 'progress') {
    state.search.scanned = event.scanned ?? state.search.scanned;
    state.search.matched = event.matched ?? state.search.matched;
    state.search.pages = event.pages ?? state.search.pages;
    state.search.elapsedMs = event.elapsedMs ?? state.search.elapsedMs;
    renderSearchBanner();
    renderTitle();
    renderStatus();
    return;
  }

  if (event.type === 'done') {
    state.search.status = 'done';
    state.search.scanned = event.scanned ?? state.search.scanned;
    state.search.matched = event.matched ?? state.search.matched;
    state.search.pages = event.pages ?? state.search.pages;
    state.search.elapsedMs = event.elapsedMs ?? state.search.elapsedMs;
    state.search.stopReason = event.stopReason || 'complete';
    renderSearchUI();
    return;
  }

  if (event.type === 'error') {
    state.search.status = 'error';
    state.search.error = event.message || '搜索失败';
    renderSearchUI();
  }
}

function searchStatsText() {
  const search = state.search;
  const scanned = search.scanned.toLocaleString();
  const matched = search.items.length.toLocaleString();
  const elapsed = formatDuration(search.elapsedMs);
  let text = `扫描 ${scanned} 个对象 · 匹配 ${matched} 条 · ${elapsed}`;

  if (search.status === 'running') {
    return `已扫描 ${scanned} 个对象 · 已匹配 ${matched} 条`;
  }
  if (search.stopReason === 'max-results') {
    text += ` · 已达到 ${search.maxResults || 300} 条结果上限`;
  } else if (search.stopReason === 'max-scan') {
    text += ` · 已达到 ${(search.maxScan || 20000).toLocaleString()} 个对象扫描上限`;
  } else if (search.stopReason === 'max-pages') {
    text += ' · 已达到分页上限';
  } else if (search.stopReason === 'stalled') {
    text += ' · 分页标记重复，提前停止';
  }
  return text;
}

function hideSearchBanner() {
  dom.searchBanner.hidden = true;
  dom.searchActionButton.hidden = true;
}

function renderSearchBanner() {
  if (state.recursive) {
    if (state.search.status === 'idle') {
      hideSearchBanner();
      return;
    }
    renderRecursiveSearchBanner();
    return;
  }
  if (state.fullSearch.status !== 'idle') {
    renderFullSearchBanner();
    return;
  }
  hideSearchBanner();
}

function fullSearchStatsText() {
  const task = state.fullSearch;
  const scanned = state.entries.length.toLocaleString('zh-CN');
  // matched 由 renderRows 在渲染时缓存，避免这里重复对全量条目排序
  const matched = task.matched.toLocaleString('zh-CN');
  if (task.status === 'running') {
    const totalText = state.count.status === 'done' ? ` · 共 ${formatTotalCount(state.count)} 项` : '';
    return `已扫描 ${scanned} 项${totalText} · 匹配 ${matched} 项`;
  }
  const elapsed = formatDuration(task.elapsedMs);
  if (task.status === 'done') {
    return `当前目录共 ${scanned} 项 · 匹配 ${matched} 项 · ${elapsed}`;
  }
  return `已扫描 ${scanned} 项 · 匹配 ${matched} 项 · ${elapsed}`;
}

function renderFullSearchBanner() {
  const task = state.fullSearch;
  const matched = task.matched;
  dom.searchBanner.hidden = false;
  dom.searchBanner.className = `search-banner is-${task.status}`;
  dom.searchBannerQuery.textContent = task.query ? `“${task.query}”` : '';
  dom.searchActionButton.hidden = false;

  if (task.status === 'running') {
    dom.searchBannerIcon.innerHTML = '<span class="search-spinner"></span>';
    dom.searchBannerTitle.textContent = '正在搜索当前目录';
    dom.searchBannerStats.textContent = fullSearchStatsText();
    dom.searchActionButton.textContent = '停止';
    dom.searchActionButton.dataset.searchAction = 'stop';
    return;
  }

  if (task.status === 'done') {
    dom.searchBannerIcon.innerHTML = svg(matched ? 'check' : 'search');
    dom.searchBannerTitle.textContent = matched ? '全量搜索完成' : '未找到匹配项';
    dom.searchBannerStats.textContent = fullSearchStatsText();
    dom.searchActionButton.hidden = true;
    return;
  }

  if (task.status === 'cancelled') {
    dom.searchBannerIcon.innerHTML = svg('alert');
    dom.searchBannerTitle.textContent = '搜索已停止';
    dom.searchBannerStats.textContent = fullSearchStatsText();
    dom.searchActionButton.textContent = '继续搜索';
    dom.searchActionButton.dataset.searchAction = 'start';
    return;
  }

  dom.searchBannerIcon.innerHTML = svg('alert');
  dom.searchBannerTitle.textContent = '搜索失败';
  dom.searchBannerStats.textContent = task.error || '发生未知错误';
  dom.searchActionButton.textContent = '重试';
  dom.searchActionButton.dataset.searchAction = 'start';
}

function renderRecursiveSearchBanner() {
  const search = state.search;
  dom.searchBanner.hidden = false;
  dom.searchBanner.className = `search-banner is-${search.status}`;
  dom.searchBannerQuery.textContent = search.query ? `“${search.query}”` : '';
  dom.searchActionButton.hidden = false;

  if (search.status === 'prompt') {
    dom.searchBannerIcon.innerHTML = svg('search');
    dom.searchBannerTitle.textContent = '递归搜索';
    dom.searchBannerStats.textContent = '范围：当前目录及所有子目录 · 支持 * 和 ? 通配符 · 按 Enter 开始';
    dom.searchActionButton.textContent = '搜索';
    dom.searchActionButton.dataset.searchAction = 'start';
    return;
  }

  if (search.status === 'running') {
    dom.searchBannerIcon.innerHTML = '<span class="search-spinner"></span>';
    dom.searchBannerTitle.textContent = '正在递归搜索';
    dom.searchBannerStats.textContent = searchStatsText();
    dom.searchActionButton.textContent = '停止';
    dom.searchActionButton.dataset.searchAction = 'stop';
    return;
  }

  if (search.status === 'done') {
    dom.searchBannerIcon.innerHTML = svg(search.items.length ? 'check' : 'search');
    dom.searchBannerTitle.textContent = search.items.length ? '搜索完成' : '未找到匹配文件';
    dom.searchBannerStats.textContent = searchStatsText();
    dom.searchActionButton.hidden = true;
    return;
  }

  if (search.status === 'cancelled') {
    dom.searchBannerIcon.innerHTML = svg('alert');
    dom.searchBannerTitle.textContent = '搜索已停止';
    dom.searchBannerStats.textContent = searchStatsText();
    dom.searchActionButton.textContent = '重新搜索';
    dom.searchActionButton.dataset.searchAction = 'start';
    return;
  }

  if (search.status === 'error') {
    dom.searchBannerIcon.innerHTML = svg('alert');
    dom.searchBannerTitle.textContent = '搜索失败';
    dom.searchBannerStats.textContent = search.error || '发生未知错误';
    dom.searchActionButton.textContent = '重试';
    dom.searchActionButton.dataset.searchAction = 'start';
  }
}

function handleSearchAction() {
  const action = dom.searchActionButton.dataset.searchAction;
  if (state.recursive) {
    if (action === 'stop') stopRecursiveSearch();
    else startRecursiveSearch();
    return;
  }
  if (action === 'stop') stopFullSearch();
  else startFullSearch();
}

function getEntryByPath(path) {
  return (
    state.entries.find((entry) => entry.path === path) ||
    state.search.items.find((entry) => entry.path === path) ||
    null
  );
}

/* File management --------------------------------------------------------- */

function showModal({
  type,
  title,
  subtitle = '',
  icon = 'inbox',
  body = null,
  confirmLabel = '确定',
  cancelLabel = '取消',
  danger = false,
  initialConfirmDisabled = false,
  focusSelector = null,
  onConfirm = null,
}) {
  state.modal = {
    open: true,
    type,
    busy: false,
    onConfirm,
    returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
  };

  dom.modalBackdrop.hidden = false;
  dom.app.inert = true;
  dom.modalIcon.className = `modal-icon${danger ? ' is-danger' : ''}`;
  dom.modalIcon.innerHTML = svg(icon);
  dom.modalTitle.textContent = title;
  dom.modalSubtitle.textContent = subtitle;
  dom.modalBody.replaceChildren();
  if (body instanceof Node) dom.modalBody.append(body);
  else if (typeof body === 'string') dom.modalBody.innerHTML = body;
  else if (body) dom.modalBody.append(body);

  dom.modalConfirmButton.hidden = false;
  dom.modalConfirmButton.disabled = initialConfirmDisabled;
  dom.modalConfirmButton.textContent = confirmLabel;
  dom.modalConfirmButton.classList.toggle('button-danger', danger);
  dom.modalConfirmButton.classList.toggle('button-primary', !danger);
  dom.modalCancelButton.hidden = false;
  dom.modalCancelButton.disabled = false;
  dom.modalCancelButton.textContent = cancelLabel;
  dom.modalCloseButton.disabled = false;

  dom.modalConfirmButton.onclick = () => {
    if (!state.modal.busy) state.modal.onConfirm?.();
  };
  dom.modalCancelButton.onclick = requestModalCancel;
  dom.modalCloseButton.onclick = requestModalCancel;
  dom.modalBackdrop.onclick = (event) => {
    if (event.target === dom.modalBackdrop) requestModalCancel();
  };

  requestAnimationFrame(() => {
    const focusTarget = focusSelector ? dom.modalBody.querySelector(focusSelector) : null;
    if (focusTarget) focusTarget.focus();
    else if (danger) dom.modalCancelButton.focus();
    else dom.modalConfirmButton.focus();
  });
}

function hideModal() {
  if (!state.modal.open) return;
  const returnFocus = state.modal.returnFocus;
  dom.modalBackdrop.hidden = true;
  dom.app.inert = false;
  dom.modalBody.replaceChildren();
  dom.modalConfirmButton.onclick = null;
  dom.modalCancelButton.onclick = null;
  dom.modalCloseButton.onclick = null;
  dom.modalBackdrop.onclick = null;
  state.modal = { open: false, type: null, busy: false, onConfirm: null, returnFocus: null };
  if (returnFocus?.isConnected) returnFocus.focus();
}

function requestModalCancel() {
  if (!state.modal.open) return;
  if (state.modal.busy) {
    if (state.modal.type === 'upload' && state.upload.running) cancelUpload();
    else if (state.modal.type === 'batch' && state.batch.running) cancelBatchOperation();
    return;
  }
  hideModal();
}

function setModalBusy(busy, label = null, { allowCancel = false } = {}) {
  state.modal.busy = busy;
  dom.modalConfirmButton.disabled = busy;
  dom.modalCancelButton.disabled = busy && !allowCancel;
  dom.modalCloseButton.disabled = busy;
  if (label) dom.modalConfirmButton.textContent = label;
}

function makeModalPathPreview(pathText, icon = 'folder') {
  const preview = document.createElement('div');
  preview.className = 'path-preview';
  preview.innerHTML = svg(icon);
  const text = document.createElement('span');
  text.textContent = pathText;
  preview.append(text);
  return preview;
}

function openNewFolderModal() {
  if (isSearchView()) {
    showToast('请先退出递归搜索', true);
    return;
  }
  if (state.loading || state.error) {
    showToast('当前目录尚未就绪', true);
    return;
  }

  const body = document.createElement('div');
  body.append(makeModalPathPreview(state.path));
  const label = document.createElement('label');
  label.className = 'field-label';
  label.htmlFor = 'newFolderName';
  label.textContent = '文件夹名称';
  const input = document.createElement('input');
  input.className = 'modal-input';
  input.id = 'newFolderName';
  input.type = 'text';
  input.maxLength = 200;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = '例如：task_configs_2026';
  const hint = document.createElement('p');
  hint.className = 'modal-hint';
  hint.textContent = '新文件夹会创建在当前目录下。';
  body.append(label, input, hint);

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!state.modal.busy) createFolder(input);
    }
  });

  showModal({
    type: 'mkdir',
    title: '新建文件夹',
    subtitle: `在 “${lastSegment(state.path)}” 中创建`,
    icon: 'folderPlus',
    body,
    confirmLabel: '创建',
    focusSelector: '#newFolderName',
    onConfirm: () => createFolder(input),
  });
}

async function createFolder(input) {
  const name = input.value.trim();
  if (!name) {
    showToast('请输入文件夹名称', true);
    input.focus();
    return;
  }
  if (name.length > 200) {
    showToast('文件夹名称过长', true);
    return;
  }
  if (name === '.' || name === '..' || /[\/\\\u0000-\u001f\u007f]/.test(name)) {
    showToast('文件夹名称不合法', true);
    input.focus();
    return;
  }

  setModalBusy(true, '创建中…');
  try {
    await fetchJson('/api/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: state.path, name }),
    });
    hideModal();
    showToast('文件夹已创建');
    await loadPath(state.path, { force: true, resetView: false });
  } catch (error) {
    setModalBusy(false, '创建');
    showToast(error.message, true);
    input.focus();
  }
}

function openDeleteModal(entry) {
  const isFolder = entry.type === 'folder';
  const body = document.createElement('div');
  const warning = document.createElement('div');
  warning.className = 'delete-warning';
  warning.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.8 21 20H3z"/><path d="M12 9v5M12 17.3v.2"/></svg>
    <div>
      <strong>${isFolder ? '文件夹及其中的所有对象都会被删除' : '此对象将被永久删除'}</strong>
      <p>删除后无法恢复，请确认路径无误。</p>
    </div>
  `;
  const path = document.createElement('div');
  path.className = 'delete-path';
  path.textContent = entry.path;
  body.append(warning, path);

  let confirmCheck = null;
  if (isFolder) {
    const label = document.createElement('label');
    label.className = 'delete-check';
    confirmCheck = document.createElement('input');
    confirmCheck.type = 'checkbox';
    confirmCheck.id = 'deleteConfirmCheck';
    const text = document.createElement('span');
    text.textContent = '我确认要递归删除这个文件夹及其全部内容';
    label.append(confirmCheck, text);
    body.append(label);
  }

  showModal({
    type: 'delete',
    title: isFolder ? '删除文件夹？' : '删除对象？',
    subtitle: entry.name,
    icon: 'trash',
    body,
    confirmLabel: '确认删除',
    danger: true,
    initialConfirmDisabled: isFolder,
    onConfirm: () => deleteEntry(entry, confirmCheck),
  });

  if (confirmCheck) {
    confirmCheck.addEventListener('change', () => {
      dom.modalConfirmButton.disabled = !confirmCheck.checked;
    });
    requestAnimationFrame(() => confirmCheck.focus());
  }
}

async function deleteEntry(entry, confirmCheck) {
  const isFolder = entry.type === 'folder';
  if (isFolder && !confirmCheck?.checked) {
    showToast('请先勾选删除确认', true);
    return;
  }

  setModalBusy(true, '删除中…');
  try {
    await fetchJson('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: entry.path,
        recursive: isFolder,
        confirm: true,
      }),
    });
    hideModal();
    state.selected.delete(entry.path);
    if (state.inspector.open) closeInspector({ silent: true });
    showToast(isFolder ? '文件夹已删除' : '对象已删除');
    await loadPath(state.path, { force: true, resetView: false });
  } catch (error) {
    setModalBusy(false, '确认删除');
    if (isFolder) dom.modalConfirmButton.disabled = !confirmCheck?.checked;
    showToast(error.message, true);
  }
}

function openUploadPicker() {
  if (isSearchView()) {
    showToast('请先退出递归搜索', true);
    return;
  }
  if (state.loading || state.error) {
    showToast('当前目录尚未就绪', true);
    return;
  }
  dom.fileInput.value = '';
  dom.fileInput.click();
}

function handleFileSelection(fileList) {
  if (isSearchView()) {
    showToast('请先退出递归搜索', true);
    return;
  }
  if (state.loading || state.error) {
    showToast('当前目录尚未就绪', true);
    return;
  }
  const files = Array.from(fileList || []).filter((file) => file instanceof File && file.name);
  dom.fileInput.value = '';
  if (!files.length) return;
  openUploadModal(files);
}

function openUploadModal(files) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const body = document.createElement('div');
  body.append(makeModalPathPreview(state.path, 'upload'));

  const summary = document.createElement('div');
  summary.className = 'upload-summary';
  const summaryLeft = document.createElement('span');
  summaryLeft.textContent = `${files.length} 个文件 · ${formatBytes(totalBytes)}`;
  const summaryRight = document.createElement('span');
  summaryRight.textContent = '等待上传';
  summary.append(summaryLeft, summaryRight);

  const overall = document.createElement('div');
  overall.className = 'upload-overall';
  const overallBar = document.createElement('span');
  overall.append(overallBar);

  const list = document.createElement('div');
  list.className = 'upload-list';
  const rows = files.map((file) => {
    const row = document.createElement('div');
    row.className = 'upload-row';
    const nameEl = document.createElement('span');
    nameEl.className = 'upload-file-name';
    nameEl.textContent = file.name;
    nameEl.title = file.name;
    const sizeEl = document.createElement('span');
    sizeEl.className = 'upload-file-size';
    sizeEl.textContent = formatBytes(file.size);
    const statusEl = document.createElement('span');
    statusEl.className = 'upload-status';
    statusEl.innerHTML = svg('clock');
    row.append(nameEl, sizeEl, statusEl);
    list.append(row);
    return { file, row, statusEl };
  });

  const checkLabel = document.createElement('label');
  checkLabel.className = 'upload-check';
  const overwriteInput = document.createElement('input');
  overwriteInput.type = 'checkbox';
  const checkText = document.createElement('span');
  checkText.textContent = '覆盖同名对象';
  checkLabel.append(overwriteInput, checkText);

  const limitHint = document.createElement('p');
  limitHint.className = 'modal-hint';
  limitHint.textContent = state.meta?.uploadLimitBytes
    ? `支持多选和拖拽；单个文件上限 ${formatBytes(state.meta.uploadLimitBytes)}。`
    : '支持多选和拖拽上传。';

  const result = document.createElement('div');
  result.className = 'upload-result';
  result.hidden = true;

  body.append(summary, overall, list, checkLabel, limitHint, result);

  state.upload = {
    files,
    rows,
    currentIndex: -1,
    xhr: null,
    cancelled: false,
    running: false,
    overwrite: false,
    success: 0,
    conflicts: 0,
    failures: 0,
    summaryLeft,
    summaryRight,
    overallBar,
    resultEl: result,
    checkLabel,
    overwriteInput,
  };

  showModal({
    type: 'upload',
    title: '上传文件',
    subtitle: `上传到 “${lastSegment(state.path)}”`,
    icon: 'upload',
    body,
    confirmLabel: '开始上传',
    onConfirm: startUpload,
  });
}

function setUploadSummary(left, right) {
  state.upload.summaryLeft.textContent = left;
  state.upload.summaryRight.textContent = right;
}

function uploadSingleFile(file, index, overwrite) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    state.upload.xhr = xhr;
    const params = new URLSearchParams({
      path: state.path,
      name: file.name,
      overwrite: overwrite ? '1' : '0',
    });
    xhr.open('POST', `/api/upload?${params}`);
    xhr.responseType = 'text';
    xhr.upload.onprogress = (event) => {
      if (!state.upload.running) return;
      const fraction = event.lengthComputable && event.total ? event.loaded / event.total : 0;
      const percent = ((index + fraction) / state.upload.files.length) * 100;
      state.upload.overallBar.style.width = `${Math.min(100, percent).toFixed(2)}%`;
      setUploadSummary(
        `正在上传 ${index + 1} / ${state.upload.files.length}`,
        `${Math.round(fraction * 100)}%`,
      );
    };
    xhr.upload.onload = () => {
      if (!state.upload.running) return;
      setUploadSummary(
        `正在写入 OBS ${index + 1} / ${state.upload.files.length}`,
        '处理中',
      );
    };
    xhr.onload = () => {
      state.upload.xhr = null;
      let payload = null;
      try {
        payload = JSON.parse(xhr.responseText || '{}');
      } catch {
        payload = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload?.ok) {
        resolve(payload);
        return;
      }
      const error = new Error(payload?.error || `上传失败（HTTP ${xhr.status}）`);
      error.status = xhr.status;
      error.code = payload?.code;
      reject(error);
    };
    xhr.onerror = () => {
      state.upload.xhr = null;
      reject(new Error('上传连接失败'));
    };
    xhr.onabort = () => {
      state.upload.xhr = null;
      const error = new Error('上传已取消');
      error.aborted = true;
      reject(error);
    };
    xhr.send(file);
  });
}

async function startUpload() {
  if (state.upload.running || !state.upload.files.length) return;
  state.upload.running = true;
  state.upload.cancelled = false;
  state.upload.success = 0;
  state.upload.conflicts = 0;
  state.upload.failures = 0;
  state.upload.overwrite = Boolean(state.upload.overwriteInput.checked);
  state.upload.checkLabel.hidden = true;

  setModalBusy(true, '上传中…', { allowCancel: true });
  dom.modalCancelButton.hidden = false;
  dom.modalCancelButton.textContent = '取消上传';
  dom.modalCancelButton.disabled = false;
  dom.modalCloseButton.disabled = true;
  dom.modalConfirmButton.disabled = true;

  for (let index = 0; index < state.upload.files.length; index += 1) {
    if (state.upload.cancelled) break;
    const row = state.upload.rows[index];
    state.upload.currentIndex = index;
    row.row.classList.add('is-active');
    row.statusEl.innerHTML = '<span class="search-spinner"></span>';
    setUploadSummary(
      `正在上传 ${index + 1} / ${state.upload.files.length}`,
      '0%',
    );
    const base = (index / state.upload.files.length) * 100;
    state.upload.overallBar.style.width = `${base}%`;

    try {
      await uploadSingleFile(row.file, index, state.upload.overwrite);
      state.upload.success += 1;
      row.row.classList.remove('is-active');
      row.row.classList.add('is-done');
      row.statusEl.innerHTML = svg('check');
    } catch (error) {
      row.row.classList.remove('is-active');
      if (error.aborted || state.upload.cancelled) {
        row.statusEl.innerHTML = svg('clock');
        break;
      }
      if (error.status === 409 || error.code === 'AlreadyExists') {
        state.upload.conflicts += 1;
        row.row.classList.add('is-conflict');
        row.statusEl.innerHTML = svg('alert');
        row.row.title = '同名对象已存在，未覆盖';
      } else {
        state.upload.failures += 1;
        row.row.classList.add('is-error');
        row.statusEl.innerHTML = svg('alert');
        row.row.title = error.message;
      }
    }

    const complete = ((index + 1) / state.upload.files.length) * 100;
    state.upload.overallBar.style.width = `${complete}%`;
  }

  finalizeUpload();
}

function cancelUpload() {
  if (!state.upload.running) {
    hideModal();
    return;
  }
  state.upload.cancelled = true;
  setUploadSummary('正在取消上传…', '');
  dom.modalCancelButton.disabled = true;
  state.upload.xhr?.abort();
}

async function finalizeUpload() {
  if (!state.modal.open || state.modal.type !== 'upload') {
    state.upload.running = false;
    return;
  }

  state.upload.running = false;
  const { success, conflicts, failures, cancelled } = state.upload;
  if (!cancelled) state.upload.overallBar.style.width = '100%';
  setModalBusy(false, '完成');
  dom.modalCloseButton.disabled = false;
  dom.modalConfirmButton.hidden = false;
  dom.modalConfirmButton.disabled = false;
  dom.modalConfirmButton.textContent = '完成';
  dom.modalCancelButton.hidden = true;
  state.modal.onConfirm = () => hideModal();

  if (cancelled) {
    dom.modalTitle.textContent = '上传已取消';
    dom.modalSubtitle.textContent = `${success} 个成功 · ${conflicts} 个同名跳过 · ${failures} 个失败`;
  } else if (failures || conflicts) {
    dom.modalTitle.textContent = '上传已结束';
    dom.modalSubtitle.textContent = `${success} 个成功 · ${conflicts} 个同名跳过 · ${failures} 个失败`;
  } else {
    dom.modalTitle.textContent = '上传完成';
    dom.modalSubtitle.textContent = `${success} 个文件已上传`;
  }

  setUploadSummary(
    `成功 ${success}`,
    `${conflicts ? `同名跳过 ${conflicts} · ` : ''}${failures ? `失败 ${failures}` : '已完成'}`,
  );
  state.upload.resultEl.hidden = false;
  state.upload.resultEl.textContent = [
    `成功上传：${success}`,
    conflicts ? `同名跳过：${conflicts}（重新上传时可勾选“覆盖同名对象”）` : '',
    failures ? `失败：${failures}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  state.upload.resultEl.style.whiteSpace = 'pre-line';

  if (success > 0) {
    await loadPath(state.path, { force: true, resetView: false });
  }
  if (success > 0) showToast(`已上传 ${success} 个文件`);
  else if (conflicts || failures) showToast('没有文件被上传', true);
}

function hasFileDrag(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

function showDropOverlay() {
  if (state.modal.open || isSearchView() || state.loading || state.error) return;
  dom.dropTarget.textContent = state.path;
  dom.dropOverlay.hidden = false;
}

function hideDropOverlay() {
  dom.dropOverlay.hidden = true;
}

/* Batch operations -------------------------------------------------------- */

function batchVerb(action) {
  return action === 'move' ? '移动' : action === 'copy' ? '拷贝' : '删除';
}

function openBatchDestinationModal(action) {
  const entries = selectedEntries().filter((entry) => entry.type === 'file');
  if (!entries.length) {
    showToast('请先勾选要处理的对象', true);
    return;
  }
  if (entries.length > state.batchLimit) {
    showToast(`一次最多处理 ${state.batchLimit} 个对象`, true);
    return;
  }

  state.batch = {
    action,
    paths: entries.map((entry) => entry.path),
    running: false,
    controller: null,
    destination: null,
    total: entries.length,
    completed: 0,
    failures: [],
  };

  const body = document.createElement('div');
  const summary = document.createElement('div');
  summary.className = 'batch-selection';
  const names = entries.slice(0, 4).map((entry) => entry.name).join('、');
  summary.textContent = `${entries.length} 个对象：${names}${entries.length > 4 ? ` 等 ${entries.length} 个` : ''}`;

  const label = document.createElement('label');
  label.className = 'field-label';
  label.htmlFor = 'batchDestination';
  label.textContent = '目标目录';
  const input = document.createElement('input');
  input.className = 'modal-input';
  input.id = 'batchDestination';
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = 'obs://bucket/path/to/destination/';

  const suggestions = document.createElement('div');
  suggestions.className = 'batch-suggestions';
  const candidates = [
    { label: '上级目录', path: parentOf(state.path) },
    { label: '当前目录', path: state.path },
    ...state.pinned.map((path) => ({ label: '固定', path })),
    ...state.recent.map((path) => ({ label: '最近', path })),
  ];
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate.path || seen.has(candidate.path)) continue;
    seen.add(candidate.path);
    if (seen.size > 4) break;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'batch-suggestion';
    chip.title = candidate.path;
    chip.textContent =
      candidate.label === '最近' || candidate.label === '固定'
        ? `${candidate.label} · ${lastSegment(candidate.path)}`
        : candidate.label;
    chip.addEventListener('click', () => {
      input.value = candidate.path;
      input.focus();
    });
    suggestions.append(chip);
  }

  const hint = document.createElement('p');
  hint.className = 'modal-hint';
  hint.textContent = '目标目录中的同名对象不会被覆盖；存在同名冲突时会中止操作。';
  const error = document.createElement('div');
  error.className = 'batch-inline-error';
  error.hidden = true;

  body.append(summary, label, input, suggestions, hint, error);

  showModal({
    type: 'batch',
    title: `${batchVerb(action)}到`,
    subtitle: `已选择 ${entries.length} 个对象`,
    icon: action === 'move' ? 'move' : 'copy',
    body,
    confirmLabel: `${batchVerb(action)}到`,
    focusSelector: '#batchDestination',
    onConfirm: () => startBatchDestination(action, input, error),
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!state.modal.busy) startBatchDestination(action, input, error);
    }
  });
  requestAnimationFrame(() => input.focus());
}

async function startBatchDestination(action, input, errorEl) {
  let destination;
  try {
    destination = normalizePathInput(input.value);
  } catch (error) {
    errorEl.hidden = false;
    errorEl.textContent = error.message;
    input.focus();
    return;
  }
  if (!destination) return;
  errorEl.hidden = true;
  input.disabled = true;
  await runBatchOperation(action, destination);
}

function openBatchDeleteModal() {
  const entries = selectedEntries().filter((entry) => entry.type === 'file');
  if (!entries.length) {
    showToast('请先勾选要删除的对象', true);
    return;
  }
  if (entries.length > state.batchLimit) {
    showToast(`一次最多处理 ${state.batchLimit} 个对象`, true);
    return;
  }

  state.batch = {
    action: 'delete',
    paths: entries.map((entry) => entry.path),
    running: false,
    controller: null,
    destination: null,
    total: entries.length,
    completed: 0,
    failures: [],
  };

  const body = document.createElement('div');
  const warning = document.createElement('div');
  warning.className = 'delete-warning';
  warning.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.8 21 20H3z"/><path d="M12 9v5M12 17.3v.2"/></svg>
    <div>
      <strong>将永久删除 ${entries.length} 个对象</strong>
      <p>删除后无法恢复，请确认选择无误。</p>
    </div>
  `;
  const preview = document.createElement('div');
  preview.className = 'batch-file-preview';
  preview.textContent = entries.slice(0, 8).map((entry) => entry.name).join('\n') + (entries.length > 8 ? `\n... 另外 ${entries.length - 8} 个对象` : '');

  const label = document.createElement('label');
  label.className = 'delete-check';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'batchDeleteConfirm';
  const text = document.createElement('span');
  text.textContent = `我确认删除这 ${entries.length} 个对象`;
  label.append(checkbox, text);
  body.append(warning, preview, label);

  showModal({
    type: 'batch',
    title: '批量删除？',
    subtitle: `已选择 ${entries.length} 个对象`,
    icon: 'trash',
    body,
    confirmLabel: '确认删除',
    danger: true,
    initialConfirmDisabled: true,
    onConfirm: () => {
      if (!checkbox.checked) {
        showToast('请先勾选删除确认', true);
        return;
      }
      runBatchOperation('delete', null);
    },
  });
  checkbox.addEventListener('change', () => {
    dom.modalConfirmButton.disabled = !checkbox.checked;
  });
}

function setupBatchProgressUI(action, destination, total) {
  const body = document.createElement('div');
  body.className = 'batch-progress';
  const head = document.createElement('div');
  head.className = 'batch-progress-head';
  const status = document.createElement('span');
  status.className = 'batch-progress-status';
  status.textContent = '正在准备…';
  const count = document.createElement('span');
  count.className = 'batch-progress-count';
  count.textContent = `0 / ${total}`;
  head.append(status, count);

  const bar = document.createElement('div');
  bar.className = 'upload-overall batch-overall';
  const fill = document.createElement('span');
  bar.append(fill);

  const errors = document.createElement('div');
  errors.className = 'batch-failure-list';
  errors.hidden = true;

  const hint = document.createElement('p');
  hint.className = 'modal-hint';
  hint.textContent = destination
    ? `目标目录：${destination}。可以点击“取消”中止剩余操作。`
    : '可以点击“取消”中止剩余操作；已经处理的对象不会回滚。';

  body.append(head, bar, errors, hint);
  dom.modalBody.replaceChildren(body);
  dom.modalTitle.textContent = `正在${batchVerb(action)}…`;
  dom.modalSubtitle.textContent = `共 ${total} 个对象`;
  dom.modalIcon.className = 'modal-icon';
  dom.modalIcon.innerHTML = svg(action === 'delete' ? 'trash' : action === 'move' ? 'move' : 'copy');
  setModalBusy(true, '处理中…', { allowCancel: true });
  dom.modalCancelButton.hidden = false;
  dom.modalCancelButton.textContent = '取消';
  dom.modalCancelButton.disabled = false;
  dom.modalCloseButton.disabled = true;
  dom.modalConfirmButton.disabled = true;

  return { status, count, fill, errors, hint, total };
}

function appendBatchFailure(ui, failure) {
  ui.errors.hidden = false;
  const item = document.createElement('div');
  item.className = 'batch-failure';
  const name = document.createElement('span');
  name.className = 'batch-failure-name';
  name.textContent = failure.name || failure.path || '未知对象';
  const message = document.createElement('span');
  message.className = 'batch-failure-message';
  message.textContent = failure.error || '处理失败';
  item.append(name, message);
  ui.errors.append(item);
}

function updateBatchProgressUI(ui, completed, total, name, statusText) {
  ui.count.textContent = `${completed} / ${total}`;
  ui.fill.style.width = `${total ? (completed / total) * 100 : 0}%`;
  ui.status.textContent = statusText || `正在处理 ${completed} / ${total}`;
  if (name) ui.status.title = name;
}

function readBatchStream(response, onEvent) {
  return (async () => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) onEvent(JSON.parse(line));
        newline = buffer.indexOf('\n');
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) onEvent(JSON.parse(buffer.trim()));
  })();
}

async function runBatchOperation(action, destination) {
  if (state.batch.running || !state.batch.paths.length) return;
  const total = state.batch.paths.length;
  const controller = new AbortController();
  state.batch.running = true;
  state.batch.controller = controller;
  state.batch.destination = destination;
  state.batch.completed = 0;
  state.batch.failures = [];
  const ui = setupBatchProgressUI(action, destination, total);
  state.batch.ui = ui;

  let doneEvent = null;
  try {
    const response = await fetch('/api/batch', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson, application/json',
      },
      body: JSON.stringify({
        action,
        paths: state.batch.paths,
        destination,
        confirm: true,
      }),
    });

    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      const error = new Error(payload?.error || `批量操作失败（HTTP ${response.status}）`);
      error.payload = payload;
      error.status = response.status;
      throw error;
    }
    if (!response.body) throw new Error('批量操作没有返回数据流');

    await readBatchStream(response, (event) => {
      if (state.batch.controller !== controller) return;
      if (event.type === 'start') {
        ui.status.textContent = '正在处理…';
        return;
      }
      if (event.type === 'progress') {
        state.batch.completed = event.index ?? state.batch.completed;
        if (event.status === 'ok') {
          updateBatchProgressUI(
            ui,
            state.batch.completed,
            total,
            event.name,
            `正在${batchVerb(action)} ${state.batch.completed} / ${total}`,
          );
        } else {
          const failure = { name: event.name, path: event.path, error: event.error };
          state.batch.failures.push(failure);
          appendBatchFailure(ui, failure);
          updateBatchProgressUI(
            ui,
            state.batch.completed,
            total,
            event.name,
            `已处理 ${state.batch.completed} / ${total}，有失败项`,
          );
        }
        return;
      }
      if (event.type === 'done') {
        doneEvent = event;
        return;
      }
      if (event.type === 'error') {
        throw new Error(event.message || '批量操作失败');
      }
    });

    if (doneEvent) {
      await finalizeBatchOperation(doneEvent, ui);
    } else if (!controller.signal.aborted) {
      throw new Error('批量操作连接中断');
    }
  } catch (error) {
    if (controller.signal.aborted || error.name === 'AbortError') {
      await finalizeBatchCancelled(ui);
    } else if (state.batch.completed > 0) {
      await finalizeBatchInterrupted(error, ui);
    } else {
      showBatchError(error);
    }
  } finally {
    if (state.batch.controller === controller) {
      state.batch.controller = null;
      state.batch.running = false;
    }
  }
}

function cancelBatchOperation() {
  if (!state.batch.running) {
    hideModal();
    return;
  }
  if (state.batch.ui) {
    state.batch.ui.status.textContent = '正在取消…';
  }
  dom.modalCancelButton.disabled = true;
  state.batch.controller?.abort();
}

async function finalizeBatchOperation(done, ui) {
  state.batch.running = false;
  state.batch.controller = null;
  const action = done.action || state.batch.action;
  const succeeded = done.succeeded ?? 0;
  const failed = done.failed ?? 0;
  const total = done.total ?? state.batch.total;
  ui.fill.style.width = '100%';
  ui.count.textContent = `${total} / ${total}`;
  ui.status.textContent = failed
    ? `完成：成功 ${succeeded}，失败 ${failed}`
    : `全部成功：${succeeded} 个对象`;

  dom.modalTitle.textContent = failed ? `${batchVerb(action)}完成，有失败项` : `${batchVerb(action)}完成`;
  dom.modalSubtitle.textContent = `成功 ${succeeded} / ${total}${failed ? ` · 失败 ${failed}` : ''}`;
  if (ui.hint) {
    ui.hint.textContent = state.batch.destination
      ? `目标目录：${state.batch.destination}`
      : '批量删除已完成。';
  }
  dom.modalConfirmButton.textContent = '完成';
  dom.modalConfirmButton.disabled = false;
  dom.modalConfirmButton.hidden = false;
  dom.modalCancelButton.hidden = true;
  dom.modalCloseButton.disabled = false;
  state.modal.busy = false;
  state.modal.onConfirm = () => hideModal();
  for (const failure of done.failures || []) {
    const duplicate = state.batch.failures.some(
      (item) => item.path === failure.path && item.error === failure.error,
    );
    if (!duplicate) {
      state.batch.failures.push(failure);
      appendBatchFailure(ui, failure);
    }
  }

  clearSelection();
  await loadPath(state.path, { force: true, resetView: false });
  if (failed) showToast(`${batchVerb(action)}完成：成功 ${succeeded}，失败 ${failed}`, true);
  else showToast(`${batchVerb(action)}完成，共 ${succeeded} 个对象`);
}

async function finalizeBatchCancelled(ui) {
  state.batch.running = false;
  state.batch.controller = null;
  const action = state.batch.action;
  dom.modalTitle.textContent = '操作已取消';
  dom.modalSubtitle.textContent = `已处理 ${state.batch.completed} / ${state.batch.total} 个对象`;
  dom.modalConfirmButton.textContent = '完成';
  dom.modalConfirmButton.disabled = false;
  dom.modalConfirmButton.hidden = false;
  dom.modalCancelButton.hidden = true;
  dom.modalCloseButton.disabled = false;
  state.modal.busy = false;
  state.modal.onConfirm = () => hideModal();
  if (ui) {
    ui.status.textContent = `已取消，已处理 ${state.batch.completed} / ${state.batch.total}`;
    ui.fill.style.width = `${state.batch.total ? (state.batch.completed / state.batch.total) * 100 : 0}%`;
    if (ui.hint) ui.hint.textContent = '已处理的对象不会回滚，请刷新后检查结果。';
  }
  clearSelection();
  await loadPath(state.path, { force: true, resetView: false });
  showToast('批量操作已取消');
}

async function finalizeBatchInterrupted(error, ui) {
  state.batch.running = false;
  state.batch.controller = null;
  dom.modalTitle.textContent = '操作中断';
  dom.modalSubtitle.textContent = `已处理 ${state.batch.completed} / ${state.batch.total} 个对象`;
  dom.modalConfirmButton.textContent = '完成';
  dom.modalConfirmButton.disabled = false;
  dom.modalConfirmButton.hidden = false;
  dom.modalCancelButton.hidden = true;
  dom.modalCloseButton.disabled = false;
  state.modal.busy = false;
  state.modal.onConfirm = () => hideModal();
  appendBatchFailure(ui, { name: '操作流', error: error.message });
  if (ui.hint) ui.hint.textContent = '部分对象可能已完成，请刷新后检查结果。';
  clearSelection();
  await loadPath(state.path, { force: true, resetView: false });
  showToast('操作中断，请检查已处理的对象', true);
}

function showBatchError(error) {
  state.batch.running = false;
  state.batch.controller = null;
  const body = document.createElement('div');
  const box = document.createElement('div');
  box.className = 'batch-error-box';
  box.textContent = error.message;
  body.append(box);
  const conflicts = error.payload?.conflicts;
  if (Array.isArray(conflicts) && conflicts.length) {
    const list = document.createElement('div');
    list.className = 'batch-file-preview';
    list.textContent = conflicts.join('\n');
    body.append(list);
  }
  dom.modalBody.replaceChildren(body);
  dom.modalTitle.textContent = '操作未执行';
  dom.modalSubtitle.textContent = '没有对象被处理';
  dom.modalConfirmButton.textContent = '关闭';
  dom.modalConfirmButton.disabled = false;
  dom.modalConfirmButton.hidden = false;
  dom.modalCancelButton.hidden = true;
  dom.modalCloseButton.disabled = false;
  state.modal.busy = false;
  state.modal.onConfirm = () => hideModal();
  showToast(error.message, true);
}

/* Paths -------------------------------------------------------------------- */

function normalizePathInput(input) {
  let value = String(input || '').trim();
  if (!value) throw new Error('请输入 OBS 路径');
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error('路径中包含非法字符');
  if (!/^obs:\/\//i.test(value)) value = `obs://${value.replace(/^\/+/, '')}`;

  const withoutScheme = value.slice(6);
  const pieces = withoutScheme.split('/');
  const bucket = pieces.shift()?.trim().toLowerCase();
  if (!bucket) throw new Error('路径中缺少存储桶名称');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error('存储桶名称不合法');
  }
  if (value.includes('?') || value.includes('#')) throw new Error('路径中不能包含 ? 或 #');

  const segments = pieces.filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('路径中不能包含 . 或 ..');
  }
  return `obs://${bucket}/${segments.join('/')}${segments.length ? '/' : ''}`;
}

function normalizePathSafe(input) {
  if (!input) return null;
  try {
    return normalizePathInput(input);
  } catch {
    return null;
  }
}

function parentOf(path) {
  const clean = String(path || '').replace(/\/$/, '');
  if (!clean.startsWith('obs://')) return clean;
  const index = clean.lastIndexOf('/');
  if (index <= 5) return `${clean}/`;
  return `${clean.slice(0, index + 1)}`;
}

function pathSegments(path) {
  return String(path || '')
    .replace(/^obs:\/\//, '')
    .replace(/\/$/, '')
    .split('/')
    .filter(Boolean);
}

function lastSegment(path) {
  const segments = pathSegments(path);
  return segments[segments.length - 1] || '存储桶根目录';
}

function bucketOf(path) {
  return pathSegments(path)[0] || '';
}

function readHash() {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function pushHistory(path) {
  const url = `#${encodeURIComponent(path)}`;
  if (window.location.hash !== url) window.history.pushState({ path }, '', url);
}

function replaceHistory(path) {
  window.history.replaceState({ path }, '', `#${encodeURIComponent(path)}`);
}

/* Rendering ---------------------------------------------------------------- */

function renderAll({ resetScroll = false } = {}) {
  renderBreadcrumbs();
  renderTitle();
  renderFilters();
  renderRows({ resetScroll });
  renderBuckets();
  renderShortcuts();
  renderSortHeaders();
  renderStatus();
  renderConnection();
  renderSearchMode();
  renderSearchBanner();
}

function renderBreadcrumbs() {
  dom.breadcrumbs.replaceChildren();
  const segments = pathSegments(state.path);
  if (!segments.length) return;

  const scheme = document.createElement('span');
  scheme.className = 'breadcrumb-scheme';
  scheme.textContent = 'obs://';
  dom.breadcrumbs.append(scheme);

  let built = 'obs://';
  segments.forEach((segment, index) => {
    built += `${segment}/`;
    const isLast = index === segments.length - 1;
    if (index > 0) {
      const separator = document.createElement('span');
      separator.className = 'crumb-separator';
      separator.textContent = '/';
      dom.breadcrumbs.append(separator);
    }

    if (isLast) {
      const current = document.createElement('span');
      current.className = 'crumb is-current';
      current.textContent = segment;
      current.setAttribute('aria-current', 'page');
      dom.breadcrumbs.append(current);
    } else {
      const targetPath = built;
      const crumb = document.createElement('button');
      crumb.type = 'button';
      crumb.className = 'crumb';
      crumb.textContent = segment;
      crumb.title = targetPath;
      crumb.addEventListener('click', () => loadPath(targetPath));
      dom.breadcrumbs.append(crumb);
    }
  });

  const parent = parentOf(state.path);
  dom.upButton.disabled = parent === state.path;
  dom.upButton.title = parent === state.path ? '已是存储桶根目录' : `返回 ${parent}`;

  const isPinned = state.pinned.includes(state.path);
  dom.starButton.classList.toggle('is-active', isPinned);
  dom.starButton.setAttribute('aria-label', isPinned ? '取消固定此路径' : '固定此路径');
  dom.starButton.title = isPinned ? '取消固定此路径' : '固定此路径';

  revealCurrentCrumb();
}

function revealCurrentCrumb() {
  if (!dom.breadcrumbs.lastElementChild) return;
  requestAnimationFrame(() => {
    dom.breadcrumbs.scrollLeft = dom.breadcrumbs.scrollWidth;
    dom.breadcrumbs.lastElementChild?.scrollIntoView({ block: 'nearest', inline: 'end' });
  });
  setTimeout(() => {
    dom.breadcrumbs.scrollLeft = dom.breadcrumbs.scrollWidth;
  }, 140);
}

function renderTitle() {
  const title = lastSegment(state.path);
  const searchView = isSearchView();
  const search = state.search;
  dom.folderTitle.textContent =
    state.loading && !state.entries.length && !searchView ? '正在读取…' : title;
  const segments = pathSegments(state.path);
  dom.locationEyebrow.textContent = searchView
    ? '递归搜索'
    : segments.length <= 1
      ? '存储桶根目录'
      : '当前目录';

  if (searchView) {
    document.title = `${search.query || '递归搜索'} · OBS Explorer`;
    if (search.status === 'prompt') {
      dom.folderMeta.textContent = '输入文件名后按 Enter，在当前目录及所有子目录中搜索';
      dom.listState.textContent = '等待开始';
    } else if (search.status === 'running') {
      dom.folderMeta.textContent = `正在递归搜索 · 已扫描 ${search.scanned.toLocaleString()} 个对象 · 匹配 ${search.items.length} 条`;
      dom.listState.textContent = '搜索中…';
    } else if (search.status === 'done') {
      dom.folderMeta.textContent = `“${search.query}” 找到 ${search.items.length} 个文件 · 扫描 ${search.scanned.toLocaleString()} 个对象`;
      dom.listState.textContent = `${search.items.length} 条匹配`;
    } else if (search.status === 'cancelled') {
      dom.folderMeta.textContent = `搜索已停止 · 已扫描 ${search.scanned.toLocaleString()} 个对象 · 匹配 ${search.items.length} 条`;
      dom.listState.textContent = '已停止';
    } else {
      dom.folderMeta.textContent = '搜索失败';
      dom.listState.textContent = '搜索失败';
    }
    return;
  }

  document.title = `${title} · OBS Explorer`;
  const visible = visibleEntries();
  const count = state.count;
  if (state.query || state.filter !== 'all') {
    const totalSuffix = count.status === 'done' ? `（共 ${formatTotalCount(count)} 项）` : '';
    dom.folderMeta.textContent = `已筛选 ${visible.length} 项，共加载 ${state.entries.length} 项${totalSuffix}`;
  } else if (state.loading) {
    dom.folderMeta.textContent = '正在通过本地 obsutil 读取目录…';
  } else if (state.error) {
    dom.folderMeta.textContent = '目录读取失败';
  } else if (!state.entries.length) {
    dom.folderMeta.textContent = '此路径下没有对象';
  } else {
    const sizeText = state.totalBytes > 0 ? ` · ${formatBytes(state.totalBytes)}` : '';
    const moreText = state.nextMarker ? ' · 还有更多' : '';
    dom.folderMeta.textContent = `本页 ${state.folders} 个文件夹 · ${state.objects} 个对象${sizeText}${moreText}`;
  }

  if (state.loading) {
    dom.listState.textContent = '同步中…';
  } else if (state.error) {
    dom.listState.textContent = '读取失败';
  } else if (state.loadingMore) {
    dom.listState.textContent = '加载更多…';
  } else if (state.entries.length) {
    const elapsed = state.elapsedMs ? ` · ${(state.elapsedMs / 1000).toFixed(2)}s` : '';
    const loaded = state.entries.length;
    const filtered = Boolean(state.query) || state.filter !== 'all';
    if (filtered) {
      const totalSuffix = count.status === 'done' ? ` · 共 ${formatTotalCount(count)} 项` : '';
      dom.listState.textContent = `${visible.length} / ${loaded} 项${totalSuffix}${elapsed}`;
      dom.listState.title = count.status === 'done'
        ? '已筛选 / 已加载（当前目录共 N 项）'
        : '已筛选 / 已加载';
    } else if (count.status === 'done') {
      const total = Math.max(Number(count.total) || 0, loaded);
      const totalText = `${count.atLeast ? '≥' : ''}${total.toLocaleString('zh-CN')}`;
      dom.listState.textContent = `${loaded.toLocaleString('zh-CN')} / ${totalText} 项${elapsed}`;
      dom.listState.title = '已加载 / 当前目录总项数';
    } else if (count.status === 'loading') {
      dom.listState.textContent = `${loaded.toLocaleString('zh-CN')} 项已加载 · 正在统计总数…${elapsed}`;
      dom.listState.title = '已加载当前页；后台正在列举当前目录统计总数';
    } else {
      const moreText = state.nextMarker ? ' · 还有更多' : '';
      dom.listState.textContent = `${loaded.toLocaleString('zh-CN')} 项${moreText}${elapsed}`;
      dom.listState.title = state.nextMarker ? '当前目录还有更多项未加载' : '';
    }
  } else {
    dom.listState.textContent = '0 项';
    dom.listState.title = '';
  }
}

function renderFilters() {
  const searchView = isSearchView();
  dom.filterChips.hidden = searchView;
  dom.toolbar.hidden = searchView;
  const counts = {
    all: state.entries.length,
    folder: state.entries.filter((entry) => entry.type === 'folder').length,
    file: state.entries.filter((entry) => entry.type === 'file').length,
  };
  dom.allCount.textContent = counts.all;
  dom.folderCount.textContent = counts.folder;
  dom.fileCount.textContent = counts.file;
  const count = state.count;
  const countTitle = count.status === 'done'
    ? `已加载 ${counts.all} 项，当前目录共 ${formatTotalCount(count)} 项`
    : '已加载项数（筛选只作用于已加载的条目）';
  dom.allCount.title = countTitle;
  dom.folderCount.title = countTitle;
  dom.fileCount.title = countTitle;
  dom.filterChips.querySelectorAll('[data-filter]').forEach((button) => {
    const active = button.dataset.filter === state.filter;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
}

function renderRows({ resetScroll = false } = {}) {
  const previousScroll = dom.tableScroll.scrollTop;
  const rows = dom.rows;
  const searchView = isSearchView();
  const search = state.search;
  rows.replaceChildren();
  dom.tableRegion.classList.toggle('is-search-results', searchView);
  // 全量搜索任务存活期间（含补渲染）行会被反复重建，动画瞬时完成避免整表闪烁；
  // class 留到任务结束后的下一次 renderRows 重建行时才移除（旧行被丢弃，不会重放）
  dom.tableRegion.classList.toggle(
    'is-searching',
    !searchView && state.fullSearch.status !== 'idle',
  );
  dom.tableScroll.setAttribute(
    'aria-busy',
    String(
      state.loading
        || state.loadingMore
        || search.status === 'running'
        || (!searchView && state.fullSearch.status === 'running'),
    ),
  );

  if (searchView) {
    renderSearchRows(rows);
  } else if (state.loading) {
    for (let index = 0; index < 8; index += 1) rows.append(makeSkeletonRow(index));
  } else if (state.error) {
    rows.append(
      makeState({
        kind: 'error',
        title: '无法读取这个目录',
        message: '请检查路径是否存在，或确认本地 obsutil 的访问权限。',
        detail: state.error,
        action: 'retry',
        actionLabel: '重新读取',
      }),
    );
  } else {
    const visible = visibleEntries();
    if (!searchView) state.fullSearch.matched = visible.length;
    if (!visible.length) {
      const filtered = Boolean(state.query || state.filter !== 'all');
      rows.append(
        makeState({
          kind: filtered ? 'empty' : 'folder',
          title: filtered ? '没有匹配的对象' : '这个文件夹是空的',
          message: filtered
            ? '尝试更换搜索词，或切换到其他筛选条件。'
            : '当前前缀下没有可显示的文件或子目录。',
          action: filtered ? 'clear-filter' : 'retry',
          actionLabel: filtered ? '清除筛选' : '重新读取',
        }),
      );
    } else {
      // 搜索过滤的匹配项过多时只渲染前 N 行，避免上万行 DOM 拖垮页面
      const truncated = Boolean(state.query) && visible.length > FULL_SEARCH_RENDER_LIMIT;
      const shown = truncated ? visible.slice(0, FULL_SEARCH_RENDER_LIMIT) : visible;
      const fragment = document.createDocumentFragment();
      shown.forEach((entry, index) => {
        fragment.append(makeRow(entry, index));
      });
      if (truncated) {
        fragment.append(
          makeState({
            kind: 'empty',
            title: `仅显示前 ${FULL_SEARCH_RENDER_LIMIT.toLocaleString('zh-CN')} 项匹配`,
            message: `当前关键词共匹配 ${visible.length.toLocaleString('zh-CN')} 项。请细化关键词或点击表头排序后滚动查看。`,
          }),
        );
      }
      rows.append(fragment);
    }
  }

  renderLoadMore();
  syncSelectionUI();
  const targetScroll = resetScroll ? 0 : previousScroll;
  requestAnimationFrame(() => {
    dom.tableScroll.scrollTop = targetScroll;
  });
}

function renderSearchRows(rows) {
  const search = state.search;

  if (search.status === 'prompt') {
    const stateNode = makeState({
      kind: 'empty',
      title: '递归搜索文件名',
      message: '在输入框里输入文件名后按 Enter。会在当前目录及所有子目录中扫描，并支持 * 和 ? 通配符。',
      action: 'start-search',
      actionLabel: '开始搜索',
    });
    stateNode.classList.add('search-prompt');
    rows.append(stateNode);
    return;
  }

  if (search.status === 'running' && !search.items.length) {
    for (let index = 0; index < 6; index += 1) rows.append(makeSkeletonRow(index));
    return;
  }

  if (search.status === 'error' && !search.items.length) {
    const stateNode = makeState({
      kind: 'error',
      title: '递归搜索失败',
      message: '请确认路径可访问，或稍后重试。',
      detail: search.error || '',
      action: 'start-search',
      actionLabel: '重新搜索',
    });
    rows.append(stateNode);
    return;
  }

  if (!search.items.length) {
    const stateNode = makeState({
      kind: 'empty',
      title: '没有找到匹配的文件',
      message:
        search.status === 'cancelled'
          ? '搜索已停止。可以重新搜索，或换一个文件名。'
          : `已扫描 ${search.scanned.toLocaleString()} 个对象，但没有文件名匹配 “${search.query}”。`,
      action: search.status === 'cancelled' ? 'start-search' : 'clear-search',
      actionLabel: search.status === 'cancelled' ? '重新搜索' : '清除搜索',
    });
    stateNode.classList.add('search-empty');
    rows.append(stateNode);
    return;
  }

  const fragment = document.createDocumentFragment();
  searchSortedItems().forEach((entry, index) => {
    fragment.append(makeRow(entry, index));
  });
  rows.append(fragment);
}

function displayedFileEntries() {
  if (isSearchView()) {
    if (state.search.status === 'prompt' || state.search.status === 'running' && !state.search.items.length) return [];
    return searchSortedItems().filter((entry) => entry.type === 'file');
  }
  return visibleEntries().filter((entry) => entry.type === 'file');
}

function selectedEntries() {
  return [...state.selected]
    .map((path) => getEntryByPath(path))
    .filter(Boolean);
}

function syncSelectionUI() {
  for (const row of dom.rows.children) {
    if (!row.dataset.path) continue;
    const checkbox = row.querySelector('[data-select]');
    const checked = state.selected.has(row.dataset.path);
    if (checkbox) checkbox.checked = checked;
    row.classList.toggle('is-checked', checked);
  }

  const files = displayedFileEntries();
  const selectedVisible = files.filter((entry) => state.selected.has(entry.path)).length;
  dom.selectAllCheckbox.disabled = files.length === 0;
  dom.selectAllCheckbox.checked = files.length > 0 && selectedVisible === files.length;
  dom.selectAllCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < files.length;
  renderBatchBar();
}

function renderBatchBar() {
  const count = state.selected.size;
  dom.batchBar.hidden = count === 0;
  dom.batchCount.textContent = String(count);
  const tooMany = count > state.batchLimit;
  const disabled = count === 0 || state.batch.running || tooMany;
  dom.batchMoveButton.disabled = disabled;
  dom.batchCopyButton.disabled = disabled;
  dom.batchDeleteButton.disabled = disabled;
  dom.clearSelectionButton.disabled = state.batch.running;
  dom.batchLimitHint.hidden = !tooMany;
  dom.batchLimitHint.textContent = ` · 单次最多 ${state.batchLimit} 个`;
  dom.batchBar.title = tooMany ? `一次最多处理 ${state.batchLimit} 个对象` : '';
}

function clearSelection() {
  if (!state.selected.size) return;
  state.selected.clear();
  syncSelectionUI();
}

function toggleSelection(path, checked) {
  if (checked) state.selected.add(path);
  else state.selected.delete(path);
  syncSelectionUI();
}

function toggleSelectAll(checked) {
  const files = displayedFileEntries();
  if (checked) files.forEach((entry) => state.selected.add(entry.path));
  else files.forEach((entry) => state.selected.delete(entry.path));
  syncSelectionUI();
}

function makeSkeletonRow(index) {
  const row = document.createElement('div');
  row.className = 'file-row skeleton-row';
  row.style.animationDelay = '0ms';
  row.innerHTML = `
    <div class="select-cell"></div>
    <div class="name-cell">
      <span class="skeleton skeleton-glyph"></span>
      <span class="skeleton skeleton-name" style="width:${34 + ((index * 13) % 38)}%"></span>
    </div>
    <div class="size-cell"><span class="skeleton skeleton-small"></span></div>
    <div class="modified-cell"><span class="skeleton skeleton-small" style="width:72px"></span></div>
    <div class="storage-cell"><span class="skeleton skeleton-shrink"></span></div>
    <div class="row-actions"></div>
  `;
  return row;
}

function makeRow(entry, index) {
  const isFolder = entry.type === 'folder';
  const isSearchResult = entry.relativeDir !== undefined;
  const row = document.createElement('div');
  row.className = 'file-row';
  if (isSearchResult) row.classList.add('is-search-result');
  row.dataset.path = entry.path;
  row.dataset.type = entry.type;
  row.tabIndex = 0;
  row.setAttribute('role', 'row');
  row.setAttribute('aria-label', `${isFolder ? '文件夹' : '对象'} ${entry.name}`);
  // 全量搜索任务存活期间行会被反复重建：跳过级联入场延迟，配合 0s 动画时长避免闪烁
  if (state.fullSearch.status === 'idle') {
    row.style.animationDelay = `${Math.min(index * 9, 160)}ms`;
  }
  if (state.selectedPath === entry.path) row.classList.add('is-selected');

  const selectCell = document.createElement('div');
  selectCell.className = 'select-cell';
  if (!isFolder) {
    const selectLabel = document.createElement('label');
    selectLabel.className = 'row-select';
    selectLabel.title = '选择此对象';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.select = entry.path;
    checkbox.checked = state.selected.has(entry.path);
    checkbox.setAttribute('aria-label', `选择 ${entry.name}`);
    selectLabel.append(checkbox);
    selectCell.append(selectLabel);
  }

  const nameCell = document.createElement('div');
  nameCell.className = 'name-cell';

  const glyph = document.createElement(isFolder ? 'span' : 'span');
  if (isFolder) {
    glyph.className = 'file-glyph folder-glyph';
    glyph.innerHTML = svg('folder');
  } else {
    glyph.className = `file-glyph ext-chip ${extensionClass(entry.ext)}`;
    glyph.textContent = extensionLabel(entry.ext);
  }

  const nameWrap = document.createElement('div');
  nameWrap.className = 'name-wrap';
  const nameLine = document.createElement('div');
  nameLine.className = 'name-line';
  const name = document.createElement('span');
  name.className = 'file-name';
  appendHighlighted(name, entry.name, state.query);
  name.title = entry.name;
  nameLine.append(name);
  if (isFolder) {
    const suffix = document.createElement('span');
    suffix.className = 'name-suffix';
    suffix.textContent = 'DIR';
    nameLine.append(suffix);
  }
  nameWrap.append(nameLine);

  if (isSearchResult) {
    const subpath = document.createElement('span');
    subpath.className = 'file-subpath';
    subpath.textContent = entry.relativeDir || '当前目录';
    subpath.title = entry.relativeDir || state.path;
    nameWrap.append(subpath);
  }
  nameCell.append(glyph, nameWrap);

  const sizeCell = document.createElement('div');
  sizeCell.className = 'size-cell';
  sizeCell.textContent = isFolder ? '—' : formatBytes(entry.sizeBytes);

  const modifiedCell = document.createElement('div');
  modifiedCell.className = 'modified-cell';
  modifiedCell.textContent = formatModified(entry.modified);
  modifiedCell.title = formatFullDate(entry.modified);

  const storageCell = document.createElement('div');
  storageCell.className = 'storage-cell';
  if (entry.storageClass) {
    const pill = document.createElement('span');
    pill.className = `storage-pill storage-${String(entry.storageClass).toLowerCase()}`;
    pill.textContent = entry.storageClass;
    storageCell.append(pill);
  } else {
    storageCell.textContent = '—';
    storageCell.style.color = 'var(--text-faint)';
  }

  const actions = document.createElement('div');
  actions.className = 'row-actions';
  if (isFolder) {
    actions.append(actionButton('copy', '复制文件夹路径', 'copy'));
    actions.append(actionButton('trajectory', '作为轨迹数据打开', 'trajectory'));
    actions.append(actionButton('open', '打开文件夹', 'chevronRight'));
    actions.append(actionButton('delete', '删除文件夹', 'trash'));
  } else {
    actions.append(actionButton('preview', '预览对象', 'eye'));
    actions.append(actionButton('copy', '复制对象路径', 'copy'));
    actions.append(actionButton('download', '下载对象', 'download'));
    actions.append(actionButton('delete', '删除对象', 'trash'));
  }

  row.append(selectCell, nameCell, sizeCell, modifiedCell, storageCell, actions);
  return row;
}

function actionButton(action, label, iconName) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.dataset.action = action;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = svg(iconName);
  return button;
}

function makeState({ kind, title, message, detail = '', action, actionLabel }) {
  const wrapper = document.createElement('div');
  wrapper.className = kind === 'error' ? 'error-state' : 'empty-state';

  const icon = document.createElement('span');
  icon.className = kind === 'error' ? 'error-icon' : 'empty-icon';
  icon.innerHTML = svg(kind === 'error' ? 'alert' : kind === 'folder' ? 'inbox' : 'search');

  const heading = document.createElement('h3');
  heading.textContent = title;
  const paragraph = document.createElement('p');
  paragraph.textContent = message;
  wrapper.append(icon, heading, paragraph);

  if (detail) {
    const pre = document.createElement('pre');
    pre.textContent = detail;
    wrapper.append(pre);
  }

  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button-ghost';
    button.dataset.action = action;
    button.textContent = actionLabel;
    wrapper.append(button);
  }
  return wrapper;
}

function renderLoadMore() {
  // 全量搜索运行时翻页由搜索接管，隐藏手动「加载更多」
  const show =
    Boolean(state.nextMarker)
    && !state.loading
    && !state.error
    && !isSearchView()
    && state.fullSearch.status !== 'running';
  dom.loadMoreWrap.hidden = !show;
  dom.loadMoreButton.disabled = state.loadingMore;
  dom.loadMoreButton.innerHTML = state.loadingMore
    ? '正在加载…'
    : `加载更多对象 ${svg('chevronDown')}`;
}

function renderSortHeaders() {
  dom.sortButtons.forEach((button) => {
    const active = button.dataset.sort === state.sortKey;
    button.classList.toggle('is-sorted', active);
    const indicator = button.querySelector('.sort-indicator');
    if (indicator) indicator.textContent = active ? (state.sortDir === 1 ? '↑' : '↓') : '';
    if (active) button.setAttribute('aria-sort', state.sortDir === 1 ? 'ascending' : 'descending');
    else button.removeAttribute('aria-sort');
  });
}

function renderStatus() {
  const search = state.search;
  const searchView = isSearchView();
  const searching = searchView && search.status === 'running';
  const searchFailed = searchView && search.status === 'error';
  const fullSearching = !searchView && state.fullSearch.status === 'running';
  const fullSearchFailed = !searchView && state.fullSearch.status === 'error';
  const busy = state.loading || state.loadingMore || searching || fullSearching;
  dom.progressTrack.classList.toggle('is-active', busy);
  dom.topRefreshButton.classList.toggle('is-spinning', busy);
  dom.topRefreshButton.disabled = busy;
  dom.refreshButton.disabled = busy;
  dom.uploadButton.disabled = busy || Boolean(state.error) || isSearchView();
  dom.newFolderButton.disabled = busy || Boolean(state.error) || isSearchView();
  dom.footDot.className = `foot-dot ${
    state.error || searchFailed || fullSearchFailed ? 'is-error' : busy ? 'is-busy' : 'is-ready'
  }`;

  if (searching) dom.footStatus.textContent = '正在递归搜索对象';
  else if (searchView && search.status === 'done') {
    dom.footStatus.textContent = `${search.items.length} 条匹配 · 已扫描 ${search.scanned.toLocaleString()} 项`;
  } else if (searchView && search.status === 'cancelled') {
    dom.footStatus.textContent = `搜索已停止 · ${search.items.length} 条匹配`;
  } else if (searchFailed) dom.footStatus.textContent = '递归搜索失败';
  else if (searchView && search.status === 'prompt') dom.footStatus.textContent = '等待开始递归搜索';
  else if (fullSearching) {
    dom.footStatus.textContent = `正在搜索当前目录 · 已扫描 ${state.entries.length.toLocaleString('zh-CN')} 项`;
  } else if (fullSearchFailed) dom.footStatus.textContent = '全量搜索失败';
  else if (!searchView && state.fullSearch.status === 'cancelled') {
    dom.footStatus.textContent = `搜索已停止 · 已扫描 ${state.entries.length.toLocaleString('zh-CN')} 项`;
  } else if (!searchView && state.fullSearch.status === 'done' && state.query) {
    dom.footStatus.textContent = `全量搜索完成 · 已加载 ${state.entries.length.toLocaleString('zh-CN')} 项`;
  } else if (state.loadingMore) dom.footStatus.textContent = '正在加载更多对象';
  else if (state.loading) dom.footStatus.textContent = '正在通过 obsutil 同步目录';
  else if (state.error) dom.footStatus.textContent = '目录同步失败';
  else {
    dom.footStatus.textContent = `${state.entries.length} 项已加载${state.nextMarker ? ' · 还有更多' : ''}`;
  }

  dom.endpointLabel.textContent = state.meta?.endpoint || '本地 obsutil';
  dom.syncLabel.textContent = state.lastSync
    ? `同步于 ${formatClock(state.lastSync)}`
    : '尚未同步';
}

function renderConnection() {
  dom.connection.className = 'connection';
  if (state.metaError || state.meta?.versionError) {
    dom.connection.classList.add('is-error');
    dom.connectionLabel.textContent = '连接异常';
    dom.connection.title = state.metaError || state.meta?.versionError || 'obsutil 不可用';
    dom.connection.setAttribute('aria-label', `连接异常：${dom.connection.title}`);
    return;
  }
  if (!state.meta) {
    dom.connection.classList.add('is-loading');
    dom.connectionLabel.textContent = '正在连接';
    dom.connection.title = '正在读取本地 obsutil';
    dom.connection.setAttribute('aria-label', '正在连接本地 obsutil');
    return;
  }
  dom.connection.classList.add('is-ready');
  dom.connectionLabel.textContent = state.meta.version ? `obsutil ${state.meta.version}` : 'obsutil 就绪';
  dom.connection.title = [
    state.meta.platform,
    state.meta.endpoint,
    state.meta.configMode === 'isolated' ? '隔离运行配置' : '用户配置',
  ]
    .filter(Boolean)
    .join(' · ');
  dom.connection.setAttribute('aria-label', dom.connectionLabel.textContent);
}

/* Sidebar ------------------------------------------------------------------ */

function renderBuckets() {
  const previousScroll = dom.bucketList.scrollTop;
  dom.bucketList.replaceChildren();
  dom.bucketCount.textContent = state.bucketsLoading
    ? '…'
    : state.bucketsError
      ? '!'
      : String(state.buckets.length);

  if (state.bucketsLoading) {
    const skeleton = document.createElement('div');
    skeleton.className = 'sidebar-skeleton';
    skeleton.innerHTML = '<span></span><span></span><span></span><span></span>';
    dom.bucketList.append(skeleton);
    return;
  }

  if (state.bucketsError) {
    const message = document.createElement('div');
    message.className = 'sidebar-message';
    message.textContent = '存储桶列表读取失败';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'button button-ghost button-compact';
    retry.style.marginTop = '6px';
    retry.textContent = '重试';
    retry.addEventListener('click', () => loadBuckets(true));
    message.append(document.createElement('br'), retry);
    dom.bucketList.append(message);
    return;
  }

  const query = state.bucketQuery.trim().toLowerCase();
  const filtered = state.buckets.filter((bucket) => bucket.name.toLowerCase().includes(query));
  if (!filtered.length) {
    const message = document.createElement('div');
    message.className = 'sidebar-message';
    message.textContent = query ? '没有匹配的存储桶' : '没有找到存储桶';
    dom.bucketList.append(message);
    return;
  }

  const activeBucket = bucketOf(state.path);
  const fragment = document.createDocumentFragment();
  let activeButton = null;
  for (const bucket of filtered) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bucket-item';
    if (bucket.name === activeBucket) {
      button.classList.add('is-active');
      button.setAttribute('aria-current', 'true');
      activeButton = button;
    }
    button.title = bucket.path;
    button.innerHTML = `<span class="bucket-icon">${svg('database')}</span><span class="bucket-text"><span class="bucket-name"></span><span class="bucket-region"></span></span>`;
    button.querySelector('.bucket-name').textContent = bucket.name;
    button.querySelector('.bucket-region').textContent = bucket.region || '';
    button.addEventListener('click', () => loadPath(bucket.path));
    fragment.append(button);
  }
  dom.bucketList.append(fragment);

  if (activeButton && activeBucket !== lastActiveBucket) {
    lastActiveBucket = activeBucket;
    requestAnimationFrame(() => {
      const listRect = dom.bucketList.getBoundingClientRect();
      const itemRect = activeButton.getBoundingClientRect();
      if (itemRect.top < listRect.top || itemRect.bottom > listRect.bottom) {
        dom.bucketList.scrollTop += itemRect.top - listRect.top - (listRect.height - itemRect.height) / 2;
      }
    });
  } else {
    dom.bucketList.scrollTop = previousScroll;
  }
}

function renderShortcuts() {
  dom.pinnedSection.hidden = state.pinned.length === 0;
  dom.pinnedCount.textContent = String(state.pinned.length);
  dom.pinnedList.replaceChildren();
  for (const path of state.pinned) {
    dom.pinnedList.append(makeShortcut(path, true));
  }

  dom.recentSection.hidden = state.recent.length === 0;
  dom.recentList.replaceChildren();
  for (const path of state.recent.slice(0, 7)) {
    dom.recentList.append(makeShortcut(path, false));
  }
}

function makeShortcut(path, removable) {
  const row = document.createElement('div');
  row.className = 'shortcut-row';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'shortcut-item';
  button.title = path;
  button.innerHTML = `${svg(removable ? 'starFill' : 'clock')}<span class="shortcut-text"></span>`;
  button.querySelector('.shortcut-text').textContent = lastSegment(path);
  button.addEventListener('click', () => loadPath(path));
  row.append(button);

  if (removable) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'shortcut-remove';
    remove.setAttribute('aria-label', `取消固定 ${path}`);
    remove.title = '取消固定';
    remove.innerHTML = svg('close');
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      state.pinned = state.pinned.filter((pinned) => pinned !== path);
      saveStore(PINNED_KEY, state.pinned);
      renderShortcuts();
      renderBreadcrumbs();
    });
    row.append(remove);
  }
  return row;
}

function addRecent(path) {
  state.recent = [path, ...state.recent.filter((item) => item !== path)].slice(0, 10);
  saveStore(RECENT_KEY, state.recent);
  renderShortcuts();
}

function togglePinned() {
  if (!state.path) return;
  const isPinned = state.pinned.includes(state.path);
  if (isPinned) {
    state.pinned = state.pinned.filter((path) => path !== state.path);
    showToast('已取消固定当前路径');
  } else {
    state.pinned = [state.path, ...state.pinned.filter((path) => path !== state.path)].slice(0, 12);
    showToast('已固定当前路径');
  }
  saveStore(PINNED_KEY, state.pinned);
  renderBreadcrumbs();
  renderShortcuts();
}

/* Selection and navigation -------------------------------------------------- */

function visibleEntries() {
  const query = state.query.trim().toLowerCase();
  let list = state.entries;
  if (state.filter !== 'all') list = list.filter((entry) => entry.type === state.filter);
  if (query) list = list.filter((entry) => entry.name.toLowerCase().includes(query));

  return [...list].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    let result = 0;
    if (state.sortKey === 'size') {
      result = (a.sizeBytes ?? -1) - (b.sizeBytes ?? -1);
    } else if (state.sortKey === 'modified') {
      result = new Date(a.modified || 0) - new Date(b.modified || 0);
    } else {
      result = a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' });
    }
    if (result === 0) {
      result = a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' });
    }
    return result * state.sortDir;
  });
}

function setFilter(filter) {
  if (!['all', 'folder', 'file'].includes(filter)) return;
  clearSelection();
  state.filter = filter;
  renderFilters();
  renderTitle();
  renderRows({ resetScroll: true });
}

function setSort(key) {
  if (!['name', 'size', 'modified'].includes(key)) return;
  if (state.sortKey === key) state.sortDir *= -1;
  else {
    state.sortKey = key;
    state.sortDir = key === 'name' ? 1 : -1;
  }
  renderSortHeaders();
  renderRows({ resetScroll: true });
}

function activateRow(row) {
  if (!row) return;
  const entry = getEntryByPath(row.dataset.path);
  if (!entry) return;
  if (entry.type === 'folder') loadPath(entry.path);
  else openInspector(entry);
}

function updateSelection() {
  for (const row of dom.rows.children) {
    row.classList.toggle('is-selected', row.dataset.path === state.selectedPath);
  }
}

/* Inspector ---------------------------------------------------------------- */

async function openInspector(entry) {
  state.previewAbort?.abort();
  const controller = new AbortController();
  state.previewAbort = controller;

  state.selectedPath = entry.path;
  state.inspector = {
    open: true,
    entry,
    loading: true,
    data: null,
    error: null,
    tab: 'preview',
    jsonMode: 'pretty',
  };

  dom.shell.classList.add('has-inspector');
  dom.inspector.setAttribute('aria-hidden', 'false');
  updateSelection();
  revealCurrentCrumb();
  renderInspector();
  dom.previewBody.scrollTop = 0;

  try {
    const data = await fetchJson(`/api/preview?path=${encodeURIComponent(entry.path)}`, {
      signal: controller.signal,
    });
    if (!state.inspector.open || state.inspector.entry?.path !== entry.path) return;
    state.inspector.data = data;
    state.inspector.loading = false;
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (!state.inspector.open || state.inspector.entry?.path !== entry.path) return;
    state.inspector.error = error.message;
    state.inspector.loading = false;
  }
  renderInspector();
}

function closeInspector({ silent = false } = {}) {
  state.previewAbort?.abort();
  state.previewAbort = null;
  state.inspector.open = false;
  state.inspector.entry = null;
  state.inspector.data = null;
  state.inspector.error = null;
  state.inspector.loading = false;
  state.selectedPath = null;
  dom.shell.classList.remove('has-inspector');
  dom.inspector.setAttribute('aria-hidden', 'true');
  revealCurrentCrumb();
  dom.copyContentButton.hidden = true;
  dom.downloadButton.href = '#';
  updateSelection();
  if (!silent) dom.previewBody.scrollTop = 0;
}

function renderInspector() {
  const inspector = state.inspector;
  if (!inspector.open || !inspector.entry) return;
  const entry = inspector.entry;
  const data = inspector.data;
  const stat = data?.stat;
  const ext = entry.ext || '';

  dom.previewBadge.className = `ext-chip ${extensionClass(ext)}`;
  dom.previewBadge.textContent = extensionLabel(ext);
  dom.previewName.textContent = entry.name;
  dom.previewName.title = entry.name;
  dom.previewPathText.textContent = entry.path;
  dom.previewPath.title = '复制对象路径';

  dom.downloadButton.href = `/api/download?path=${encodeURIComponent(entry.path)}`;
  dom.downloadButton.removeAttribute('aria-disabled');
  dom.copyObjectPathButton.disabled = false;

  dom.previewMeta.replaceChildren();
  if (inspector.loading) {
    addMetaChip('读取中…');
  } else if (inspector.error) {
    addMetaChip('读取失败');
  } else {
    addMetaChip(formatBytes(stat?.sizeBytes ?? entry.sizeBytes));
    addMetaChip(formatModified(stat?.modified || entry.modified));
    if (stat?.storageClass || entry.storageClass) {
      addMetaChip(String(stat?.storageClass || entry.storageClass), true);
    }
    if (stat?.contentType) addMetaChip(stat.contentType);
  }

  dom.inspectorTabs.querySelectorAll('[data-tab]').forEach((button) => {
    const active = button.dataset.tab === inspector.tab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });

  dom.previewBody.replaceChildren();
  if (inspector.tab === 'details') {
    renderDetails();
    dom.copyContentButton.hidden = true;
    return;
  }

  renderPreviewContent();
  dom.copyContentButton.hidden = !data?.text || !data.supported;
}

function addMetaChip(text, accent = false) {
  const chip = document.createElement('span');
  chip.className = `meta-chip${accent ? ' accent' : ''}`;
  chip.textContent = text;
  dom.previewMeta.append(chip);
}

function renderPreviewContent() {
  const inspector = state.inspector;
  const data = inspector.data;

  if (inspector.loading) {
    dom.previewBody.innerHTML = `
      <div class="preview-loading" aria-label="正在加载预览">
        <div class="skeleton line"></div>
        <div class="skeleton line"></div>
        <div class="skeleton line"></div>
        <div class="skeleton line"></div>
        <div class="skeleton line"></div>
      </div>`;
    return;
  }

  if (inspector.error) {
    dom.previewBody.append(
      makePreviewNotice({
        icon: 'alert',
        title: '预览加载失败',
        message: inspector.error,
        error: true,
      }),
    );
    return;
  }

  if (!data) return;

  if (!data.supported) {
    const copy =
      data.reason === 'too-large'
        ? `该对象大小超过内联预览上限（${formatBytes(data.maxPreviewBytes)}），请下载后查看。`
        : data.reason === 'binary'
          ? '这个文件是二进制格式，无法在浏览器中直接展示文本内容。'
          : '该对象暂不支持内联预览。';
    dom.previewBody.append(
      makePreviewNotice({
        icon: 'eye',
        title: '暂无内联预览',
        message: copy,
        action: true,
      }),
    );
    return;
  }

  if (data.kind === 'image') {
    const wrapper = document.createElement('div');
    wrapper.className = 'inline-media';
    const image = document.createElement('img');
    image.src = data.url;
    image.alt = inspector.entry.name;
    wrapper.append(image);
    dom.previewBody.append(wrapper);
    return;
  }

  if (data.kind === 'pdf') {
    const frame = document.createElement('iframe');
    frame.className = 'pdf-preview';
    frame.src = data.url;
    frame.title = inspector.entry.name;
    dom.previewBody.append(frame);
    return;
  }

  if (data.kind === 'video') {
    const wrapper = document.createElement('div');
    wrapper.className = 'inline-media';
    const video = document.createElement('video');
    video.controls = true;
    video.src = data.url;
    wrapper.append(video);
    dom.previewBody.append(wrapper);
    return;
  }

  if (data.kind === 'audio') {
    const wrapper = document.createElement('div');
    wrapper.className = 'audio-preview';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = data.url;
    wrapper.append(audio);
    dom.previewBody.append(wrapper);
    return;
  }

  renderTextPreview(data);
}

function renderTextPreview(data) {
  const inspector = state.inspector;
  if (!data.text) {
    dom.previewBody.append(
      makePreviewNotice({
        icon: 'inbox',
        title: '空对象',
        message: '这个对象的内容长度为 0 字节。',
      }),
    );
    return;
  }

  let parsed = null;
  if (data.kind === 'json') {
    try {
      parsed = JSON.parse(data.text);
    } catch {
      parsed = null;
    }
  }

  let code = data.text;
  if (data.kind === 'json' && parsed !== null && inspector.jsonMode === 'pretty') {
    code = JSON.stringify(parsed, null, 2);
  }

  const lines = code.split('\n');
  const truncateAt = 6000;
  const visibleLines = lines.slice(0, truncateAt);

  if (parsed !== null) {
    const toolbar = document.createElement('div');
    toolbar.className = 'code-toolbar';
    const label = document.createElement('span');
    label.className = 'code-label';
    label.textContent = `${(inspector.entry.ext || 'json').toUpperCase()} · ${lines.length} 行`;
    const segmented = document.createElement('div');
    segmented.className = 'segmented';
    segmented.innerHTML = `
      <button type="button" data-json-mode="pretty" class="${inspector.jsonMode === 'pretty' ? 'is-active' : ''}">格式化</button>
      <button type="button" data-json-mode="raw" class="${inspector.jsonMode === 'raw' ? 'is-active' : ''}">原始</button>
    `;
    toolbar.append(label, segmented);
    dom.previewBody.append(toolbar);
  }

  const block = document.createElement('div');
  block.className = `code-block${data.kind === 'json' ? '' : ' plain'}`;
  const linesWrap = document.createElement('div');
  linesWrap.className = 'code-lines';

  for (let index = 0; index < visibleLines.length; index += 1) {
    const line = document.createElement('div');
    line.className = 'code-line';
    const number = document.createElement('span');
    number.className = 'line-number';
    number.textContent = String(index + 1);
    const content = document.createElement('span');
    content.className = 'line-code';
    if (data.kind === 'json' && code.length <= 300_000) {
      content.innerHTML = highlightJson(visibleLines[index]);
    } else {
      content.textContent = visibleLines[index];
    }
    line.append(number, content);
    linesWrap.append(line);
  }
  block.append(linesWrap);

  if (lines.length > truncateAt) {
    const note = document.createElement('div');
    note.className = 'code-truncated';
    note.textContent = `预览已截断，仅显示前 ${truncateAt.toLocaleString()} 行。下载对象以查看全部内容。`;
    block.append(note);
  }

  dom.previewBody.append(block);
}

function renderDetails() {
  const inspector = state.inspector;
  if (inspector.loading) {
    dom.previewBody.innerHTML = `
      <div class="preview-loading" aria-label="正在加载详情">
        <div class="skeleton line"></div>
        <div class="skeleton line"></div>
        <div class="skeleton line"></div>
        <div class="skeleton line"></div>
      </div>`;
    return;
  }

  if (inspector.error) {
    dom.previewBody.append(
      makePreviewNotice({
        icon: 'alert',
        title: '无法读取对象属性',
        message: inspector.error,
        error: true,
      }),
    );
    return;
  }

  const entry = inspector.entry;
  const stat = inspector.data?.stat || {};
  const values = [
    ['对象路径', entry.path, true],
    ['存储桶', bucketOf(entry.path)],
    ['大小', stat.sizeBytes != null ? `${formatBytes(stat.sizeBytes)} (${stat.sizeBytes.toLocaleString()} B)` : formatBytes(entry.sizeBytes)],
    ['修改时间', formatFullDate(stat.modified || entry.modified)],
    ['存储类型', stat.storageClass || entry.storageClass || '—'],
    ['Content-Type', stat.contentType || '—'],
    ['ETag', stat.etag || entry.etag || '—', true],
    ['本地预览', inspector.data?.kind || (inspector.data?.supported ? 'text' : '不支持')],
  ];

  const list = document.createElement('div');
  list.className = 'details-list';
  for (const [label, value, copyable] of values) {
    const row = document.createElement('div');
    row.className = 'detail-row';
    const key = document.createElement('span');
    key.className = 'detail-label';
    key.textContent = label;
    const val = document.createElement('span');
    val.className = `detail-value${copyable ? ' copyable' : ''}`;
    val.textContent = value;
    if (copyable) {
      val.title = '点击复制';
      val.addEventListener('click', () => copyText(String(value), `${label}已复制`));
    }
    row.append(key, val);
    list.append(row);
  }
  dom.previewBody.append(list);

  const actions = document.createElement('div');
  actions.className = 'detail-actions';
  actions.innerHTML = `
    <button class="button button-ghost" type="button" data-detail-action="copy-path">${svg('copy')}复制路径</button>
    <button class="button button-ghost" type="button" data-detail-action="copy-link">${svg('link')}临时链接</button>
  `;
  dom.previewBody.append(actions);
}

function makePreviewNotice({ icon, title, message, action = false, error = false }) {
  const wrapper = document.createElement('div');
  wrapper.className = `preview-notice${error ? ' preview-error' : ''}`;
  const badge = document.createElement('span');
  badge.className = `ext-chip ${error ? 'ext-pdf' : 'ext-other'}`;
  badge.innerHTML = svg(icon);
  const heading = document.createElement('h3');
  heading.textContent = title;
  const paragraph = document.createElement('p');
  paragraph.textContent = message;
  wrapper.append(badge, heading, paragraph);
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button-ghost';
    button.dataset.action = 'download';
    button.innerHTML = `${svg('download')}下载对象`;
    wrapper.append(button);
  }
  return wrapper;
}

async function copySignedLink() {
  const entry = state.inspector.entry;
  if (!entry) return;
  try {
    const data = await fetchJson(`/api/sign?path=${encodeURIComponent(entry.path)}&expires=600`);
    await copyText(data.url, '临时链接已复制（10 分钟内有效）');
  } catch (error) {
    showToast(`生成临时链接失败：${error.message}`, true);
  }
}

/* Utilities ---------------------------------------------------------------- */

function svg(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.inbox}</svg>`;
}

function appendHighlighted(element, text, query) {
  const needle = String(query || '').trim();
  if (!needle) {
    element.textContent = text;
    return;
  }
  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let cursor = 0;
  let index = lowerText.indexOf(lowerNeedle);
  if (index === -1) {
    element.textContent = text;
    return;
  }
  while (index !== -1) {
    if (index > cursor) element.append(document.createTextNode(text.slice(cursor, index)));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(index, index + needle.length);
    element.append(mark);
    cursor = index + needle.length;
    index = lowerText.indexOf(lowerNeedle, cursor);
  }
  if (cursor < text.length) element.append(document.createTextNode(text.slice(cursor)));
}

function extensionLabel(ext) {
  const value = String(ext || '').toLowerCase();
  const labels = {
    markdown: 'MD',
    dockerfile: 'DOCK',
    makefile: 'MAKE',
    jsonl: 'JSONL',
    ndjson: 'NDJSON',
    jpeg: 'JPEG',
  };
  return labels[value] || (value ? value.slice(0, 4).toUpperCase() : 'FILE');
}

function extensionClass(ext) {
  const value = String(ext || '').toLowerCase();
  if (value === 'json' || value === 'jsonl' || value === 'ndjson') return 'ext-json';
  if (IMAGE_EXTENSIONS.has(value)) return 'ext-image';
  if (value === 'pdf') return 'ext-pdf';
  if (ARCHIVE_EXTENSIONS.has(value)) return 'ext-archive';
  if (['csv', 'tsv'].includes(value)) return 'ext-data';
  if (CODE_EXTENSIONS.has(value)) return 'ext-code';
  if (TEXT_EXTENSIONS.has(value)) return 'ext-text';
  return 'ext-other';
}

function formatBytes(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const bytes = Number(value);
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let size = bytes;
  let unit = -1;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1')} ${units[unit]}`;
}

function formatModified(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const now = new Date();
  const options = {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
  return new Intl.DateTimeFormat('zh-CN', options).format(date);
}

function formatFullDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatClock(date) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatDuration(milliseconds) {
  const value = Number(milliseconds) || 0;
  if (value < 1000) return `${value}ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`;
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function highlightJson(line) {
  const pattern =
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let result = '';
  let lastIndex = 0;
  for (const match of line.matchAll(pattern)) {
    result += escapeHtml(line.slice(lastIndex, match.index));
    const [full, stringToken, colon, literal, numberToken] = match;
    if (stringToken !== undefined) {
      result += `<span class="${colon ? 'tok-key' : 'tok-string'}">${escapeHtml(stringToken)}</span>`;
      if (colon) result += escapeHtml(colon);
    } else if (literal !== undefined) {
      result += `<span class="${literal === 'null' ? 'tok-null' : 'tok-boolean'}">${escapeHtml(literal)}</span>`;
    } else if (numberToken !== undefined) {
      result += `<span class="tok-number">${escapeHtml(numberToken)}</span>`;
    } else {
      result += escapeHtml(full);
    }
    lastIndex = match.index + full.length;
  }
  result += escapeHtml(line.slice(lastIndex));
  return result;
}

async function copyText(text, successMessage = '已复制') {
  let copied = false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
  }
  if (!copied) {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      copied = document.execCommand('copy');
      area.remove();
    } catch {
      copied = false;
    }
  }
  if (copied) showToast(successMessage);
  else showToast('复制失败，请手动选择文本', true);
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  dom.toastText.textContent = message;
  dom.toastIcon.innerHTML = svg(isError ? 'alert' : 'check');
  dom.toast.classList.toggle('is-error', isError);
  dom.toast.classList.remove('is-visible');
  requestAnimationFrame(() => dom.toast.classList.add('is-visible'));
  toastTimer = setTimeout(() => dom.toast.classList.remove('is-visible'), 3200);
}

function downloadEntry(entry) {
  if (!entry) return;
  const anchor = document.createElement('a');
  anchor.href = `/api/download?path=${encodeURIComponent(entry.path)}`;
  anchor.download = entry.name || '';
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  showToast('正在准备下载对象…');
}

function loadStore(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.startsWith('obs://')) : [];
  } catch {
    return [];
  }
}

function saveStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable in private browsing; the session still works.
  }
}

/* Path editor and sidebar drawers ----------------------------------------- */

function openPathEditor() {
  if (state.editingPath) return;
  state.editingPath = true;
  dom.pathRow.hidden = true;
  dom.pathForm.hidden = false;
  dom.pathInput.value = state.path.replace(/^obs:\/\//, '');
  requestAnimationFrame(() => {
    dom.pathInput.focus();
    dom.pathInput.setSelectionRange(dom.pathInput.value.length, dom.pathInput.value.length);
  });
}

function closePathEditor() {
  state.editingPath = false;
  dom.pathForm.hidden = true;
  dom.pathRow.hidden = false;
}

function closeSidebar() {
  dom.shell.classList.remove('sidebar-open');
  dom.menuButton.setAttribute('aria-expanded', 'false');
}

function toggleSidebar() {
  const open = !dom.shell.classList.contains('sidebar-open');
  dom.shell.classList.toggle('sidebar-open', open);
  dom.menuButton.setAttribute('aria-expanded', String(open));
}

async function hardRefresh() {
  if (state.loading) return;
  await Promise.all([loadPath(state.path, { force: true, resetView: false }), loadBuckets(true)]);
}

/* Events ------------------------------------------------------------------- */

function bindEvents() {
  dom.menuButton.addEventListener('click', toggleSidebar);
  dom.drawerBackdrop.addEventListener('click', closeSidebar);

  dom.brandLink.addEventListener('click', (event) => {
    event.preventDefault();
    loadPath(state.meta?.defaultPath || FALLBACK_PATH);
  });

  dom.topRefreshButton.addEventListener('click', hardRefresh);
  dom.refreshButton.addEventListener('click', hardRefresh);
  dom.uploadButton.addEventListener('click', openUploadPicker);
  dom.newFolderButton.addEventListener('click', openNewFolderModal);
  dom.fileInput.addEventListener('change', () => handleFileSelection(dom.fileInput.files));
  dom.upButton.addEventListener('click', () => loadPath(parentOf(state.path)));
  dom.copyPathButton.addEventListener('click', () => copyText(state.path, '目录路径已复制'));
  dom.starButton.addEventListener('click', togglePinned);
  dom.editPathButton.addEventListener('click', openPathEditor);
  dom.cancelPathButton.addEventListener('click', closePathEditor);

  dom.pathForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = dom.pathInput.value.trim();
    if (!value) return;
    closePathEditor();
    loadPath(value);
  });

  dom.searchInput.addEventListener('input', handleSearchInput);
  dom.searchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    // 输入法组合期间按 Enter 是确认候选词（keyCode 229），不应触发搜索
    if (event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (state.recursive) startRecursiveSearch();
    else startFullSearch();
  });
  dom.recursiveToggle.addEventListener('click', toggleRecursiveSearch);
  dom.searchActionButton.addEventListener('click', handleSearchAction);
  dom.clearSearchButton.addEventListener('click', clearRecursiveSearch);

  dom.filterChips.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (button) setFilter(button.dataset.filter);
  });

  dom.sortButtons.forEach((button) => {
    button.addEventListener('click', () => setSort(button.dataset.sort));
  });

  dom.loadMoreButton.addEventListener('click', loadMore);

  dom.selectAllCheckbox.addEventListener('change', () => {
    toggleSelectAll(dom.selectAllCheckbox.checked);
  });
  dom.clearSelectionButton.addEventListener('click', clearSelection);
  dom.batchMoveButton.addEventListener('click', () => openBatchDestinationModal('move'));
  dom.batchCopyButton.addEventListener('click', () => openBatchDestinationModal('copy'));
  dom.batchDeleteButton.addEventListener('click', openBatchDeleteModal);

  dom.rows.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-select]');
    if (!checkbox) return;
    toggleSelection(checkbox.dataset.select, checkbox.checked);
  });

  dom.rows.addEventListener('click', (event) => {
    if (event.target.closest('.row-select') || event.target.closest('.select-cell')) {
      event.stopPropagation();
      return;
    }
    const action = event.target.closest('[data-action]');
    if (action) {
      event.stopPropagation();
      handleAction(action.dataset.action, action.closest('.file-row'));
      return;
    }
    const row = event.target.closest('.file-row');
    if (row) activateRow(row);
  });

  dom.rows.addEventListener('keydown', (event) => {
    if (event.target !== event.currentTarget && (event.target.closest('button') || event.target.matches('input'))) return;
    const row = event.target.closest('.file-row');
    if (!row) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activateRow(row);
    }
  });

  dom.closeInspectorButton.addEventListener('click', () => closeInspector());
  dom.inspectorBackdrop.addEventListener('click', () => closeInspector());
  dom.previewPath.addEventListener('click', () => {
    if (state.inspector.entry) copyText(state.inspector.entry.path, '对象路径已复制');
  });
  dom.copyObjectPathButton.addEventListener('click', () => {
    if (state.inspector.entry) copyText(state.inspector.entry.path, '对象路径已复制');
  });
  dom.copyContentButton.addEventListener('click', () => {
    if (state.inspector.data?.text) copyText(state.inspector.data.text, '对象内容已复制');
  });
  dom.downloadButton.addEventListener('click', (event) => {
    if (!state.inspector.entry) {
      event.preventDefault();
      return;
    }
    showToast('正在准备下载对象…');
  });

  dom.inspectorTabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    state.inspector.tab = button.dataset.tab;
    renderInspector();
    dom.previewBody.scrollTop = 0;
  });

  dom.previewBody.addEventListener('click', (event) => {
    const mode = event.target.closest('[data-json-mode]');
    if (mode) {
      state.inspector.jsonMode = mode.dataset.jsonMode;
      renderInspector();
      return;
    }
    const detailAction = event.target.closest('[data-detail-action]');
    if (detailAction) {
      if (detailAction.dataset.detailAction === 'copy-path' && state.inspector.entry) {
        copyText(state.inspector.entry.path, '对象路径已复制');
      } else if (detailAction.dataset.detailAction === 'copy-link') {
        copySignedLink();
      }
      return;
    }
    const action = event.target.closest('[data-action]');
    if (action?.dataset.action === 'download' && state.inspector.entry) {
      downloadEntry(state.inspector.entry);
    }
  });

  dom.bucketSearch.addEventListener('input', () => {
    state.bucketQuery = dom.bucketSearch.value;
    renderBuckets();
  });

  let dragDepth = 0;
  window.addEventListener('dragenter', (event) => {
    if (!hasFileDrag(event)) return;
    event.preventDefault();
    if (state.modal.open || isSearchView() || state.loading || state.error) return;
    dragDepth += 1;
    showDropOverlay();
  });
  window.addEventListener('dragover', (event) => {
    if (!hasFileDrag(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', (event) => {
    if (!hasFileDrag(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) hideDropOverlay();
  });
  window.addEventListener('drop', (event) => {
    if (!hasFileDrag(event)) return;
    event.preventDefault();
    dragDepth = 0;
    hideDropOverlay();
    if (state.modal.open || isSearchView() || state.loading || state.error) {
      showToast('当前无法上传，请先退出搜索或等待目录加载', true);
      return;
    }
    if (event.dataTransfer?.files?.length) handleFileSelection(event.dataTransfer.files);
  });

  window.addEventListener('keydown', (event) => {
    const tag = event.target.tagName;
    const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable;

    if (state.modal.open) {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestModalCancel();
      }
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      openPathEditor();
      return;
    }
    if (event.key === '/' && !isTyping) {
      event.preventDefault();
      dom.searchInput.focus();
      return;
    }
    if (event.key === 'Escape') {
      if (state.editingPath) closePathEditor();
      else if (state.search.status === 'running') stopRecursiveSearch();
      else if (state.fullSearch.status === 'running') stopFullSearch();
      else if (state.inspector.open) closeInspector();
      else if (dom.shell.classList.contains('sidebar-open')) closeSidebar();
      return;
    }
    if (event.key.toLowerCase() === 'r' && !isTyping && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      hardRefresh();
    }
  });

  window.addEventListener('hashchange', () => {
    const path = normalizePathSafe(readHash());
    if (path && path !== state.path) loadPath(path, { history: 'none' });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 980) closeSidebar();
    revealCurrentCrumb();
  });
}

function handleAction(action, row) {
  if (action === 'retry') {
    loadPath(state.path, { force: true, resetView: false });
    return;
  }
  if (action === 'clear-filter') {
    state.query = '';
    state.filter = 'all';
    dom.searchInput.value = '';
    renderFilters();
    renderTitle();
    renderRows({ resetScroll: true });
    return;
  }
  if (action === 'start-search') {
    startRecursiveSearch();
    return;
  }
  if (action === 'clear-search') {
    clearRecursiveSearch();
    return;
  }
  if (!row) return;
  const entry = getEntryByPath(row.dataset.path);
  if (!entry) return;
  if (action === 'copy') copyText(entry.path, entry.type === 'folder' ? '文件夹路径已复制' : '对象路径已复制');
  else if (action === 'trajectory' && entry.type === 'folder') {
    window.open(`/trajectory?path=${encodeURIComponent(entry.path)}`, '_blank', 'noopener');
  }
  else if (action === 'open' && entry.type === 'folder') loadPath(entry.path);
  else if (action === 'preview' && entry.type === 'file') openInspector(entry);
  else if (action === 'download' && entry.type === 'file') downloadEntry(entry);
  else if (action === 'delete') openDeleteModal(entry);
}

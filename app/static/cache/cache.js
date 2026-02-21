/**
 * 本地缓存管理（Cloudflare Workers 版）
 * 后端当前仅支持本地 image/video 缓存；在线资产相关能力已移除。
 */

const AUTO_REFRESH_MS = 10000;
const DELETE_BATCH_SIZE = 10;

/** @typedef {'image' | 'video'} CacheType */

/**
 * @typedef {Object} LocalCacheItem
 * @property {string} name
 * @property {number} size_bytes
 * @property {number} mtime_ms
 * @property {string} [preview_url]
 */

/**
 * @typedef {Object} CacheSectionState
 * @property {boolean} loaded
 * @property {boolean} visible
 * @property {LocalCacheItem[]} items
 */

/**
 * @typedef {Object} CacheUI
 * @property {HTMLElement | null} imgCount
 * @property {HTMLElement | null} imgSize
 * @property {HTMLElement | null} videoCount
 * @property {HTMLElement | null} videoSize
 * @property {HTMLElement | null} selectedCount
 * @property {HTMLButtonElement | null} loadBtn
 * @property {HTMLButtonElement | null} deleteBtn
 * @property {HTMLElement | null} localCacheLists
 * @property {HTMLElement | null} localImageList
 * @property {HTMLElement | null} localVideoList
 * @property {HTMLElement | null} localImageBody
 * @property {HTMLElement | null} localVideoBody
 * @property {NodeListOf<HTMLElement>} cacheCards
 * @property {HTMLInputElement | null} localImageSelectAll
 * @property {HTMLInputElement | null} localVideoSelectAll
 * @property {HTMLDialogElement | null} confirmDialog
 * @property {HTMLElement | null} confirmMessage
 * @property {HTMLButtonElement | null} confirmOk
 * @property {HTMLButtonElement | null} confirmCancel
 */

/** @type {CacheUI} */
const ui = {
  imgCount: null,
  imgSize: null,
  videoCount: null,
  videoSize: null,
  selectedCount: null,
  loadBtn: null,
  deleteBtn: null,
  localCacheLists: null,
  localImageList: null,
  localVideoList: null,
  localImageBody: null,
  localVideoBody: null,
  cacheCards: /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.cache-card')),
  localImageSelectAll: null,
  localVideoSelectAll: null,
  confirmDialog: null,
  confirmMessage: null,
  confirmOk: null,
  confirmCancel: null,
};

/** @type {Record<CacheType, Set<string>>} */
const selectedLocal = {
  image: new Set(),
  video: new Set(),
};

/** @type {Record<CacheType, CacheSectionState>} */
const cacheListState = {
  image: { loaded: false, visible: false, items: [] },
  video: { loaded: false, visible: false, items: [] },
};

let apiKey = '';
/** @type {CacheType} */
let currentSection = 'image';
/** @type {ReturnType<typeof setInterval> | null} */
let localStatsTimer = null;
/** @type {((value: boolean) => void) | null} */
let confirmResolver = null;
let isLocalDeleting = false;

function cacheUI() {
  ui.imgCount = document.getElementById('img-count');
  ui.imgSize = document.getElementById('img-size');
  ui.videoCount = document.getElementById('video-count');
  ui.videoSize = document.getElementById('video-size');
  ui.selectedCount = document.getElementById('selected-count');
  ui.loadBtn = document.getElementById('btn-load-stats');
  ui.deleteBtn = document.getElementById('btn-delete-assets');
  ui.localCacheLists = document.getElementById('local-cache-lists');
  ui.localImageList = document.getElementById('local-image-list');
  ui.localVideoList = document.getElementById('local-video-list');
  ui.localImageBody = document.getElementById('local-image-body');
  ui.localVideoBody = document.getElementById('local-video-body');
  ui.localImageSelectAll = /** @type {HTMLInputElement | null} */ (document.getElementById('local-image-select-all'));
  ui.localVideoSelectAll = /** @type {HTMLInputElement | null} */ (document.getElementById('local-video-select-all'));
  ui.confirmDialog = /** @type {HTMLDialogElement | null} */ (document.getElementById('confirm-dialog'));
  ui.confirmMessage = document.getElementById('confirm-message');
  ui.confirmOk = /** @type {HTMLButtonElement | null} */ (document.getElementById('confirm-ok'));
  ui.confirmCancel = /** @type {HTMLButtonElement | null} */ (document.getElementById('confirm-cancel'));
}

/** @param {CacheType} type */
function getTableBody(type) {
  return type === 'image' ? ui.localImageBody : ui.localVideoBody;
}

/** @param {CacheType} type */
function getSelectAllBox(type) {
  return type === 'image' ? ui.localImageSelectAll : ui.localVideoSelectAll;
}

function setupConfirmDialog() {
  const dialog = ui.confirmDialog;
  if (!dialog) return;

  dialog.addEventListener('close', () => {
    if (!confirmResolver) return;
    const ok = dialog.returnValue === 'ok';
    confirmResolver(ok);
    confirmResolver = null;
  });

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dialog.close('cancel');
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close('cancel');
    }
  });

  ui.confirmOk?.addEventListener('click', () => dialog.close('ok'));
  ui.confirmCancel?.addEventListener('click', () => dialog.close('cancel'));
}

/**
 * @param {string} message
 * @param {{ okText?: string, cancelText?: string }} [options]
 */
function confirmAction(message, options = {}) {
  const dialog = ui.confirmDialog;
  if (!dialog || typeof dialog.showModal !== 'function') {
    return Promise.resolve(window.confirm(message));
  }

  if (ui.confirmMessage) ui.confirmMessage.textContent = message;
  if (ui.confirmOk) ui.confirmOk.textContent = options.okText || '确定';
  if (ui.confirmCancel) ui.confirmCancel.textContent = options.cancelText || '取消';

  return new Promise((resolve) => {
    confirmResolver = resolve;
    dialog.showModal();
  });
}

function bindEvents() {
  ui.cacheCards.forEach((card) => {
    card.addEventListener('click', () => {
      const type = card.getAttribute('data-type');
      if (type === 'image' || type === 'video') {
        void showCacheSection(type);
      }
    });
  });

  document.querySelectorAll('.cache-clear-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const type = button.getAttribute('data-type');
      if (type === 'image' || type === 'video') {
        void clearCache(type);
      }
    });
  });

  ui.localImageSelectAll?.addEventListener('change', () => {
    toggleLocalSelectAll('image', Boolean(ui.localImageSelectAll?.checked));
  });

  ui.localVideoSelectAll?.addEventListener('change', () => {
    toggleLocalSelectAll('video', Boolean(ui.localVideoSelectAll?.checked));
  });

  ui.loadBtn?.addEventListener('click', () => {
    void handleLoadClick();
  });

  ui.deleteBtn?.addEventListener('click', () => {
    void handleDeleteClick();
  });

  ui.localImageBody?.addEventListener('change', (event) => {
    handleRowSelectChange('image', event);
  });
  ui.localVideoBody?.addEventListener('change', (event) => {
    handleRowSelectChange('video', event);
  });

  ui.localImageBody?.addEventListener('click', (event) => {
    handleRowAction('image', event);
  });
  ui.localVideoBody?.addEventListener('click', (event) => {
    handleRowAction('video', event);
  });

  window.addEventListener('beforeunload', () => {
    stopLocalStatsRefresh();
  });
}

/** @param {CacheType} type */
function clearStateForType(type) {
  selectedLocal[type].clear();
  cacheListState[type].loaded = false;
  cacheListState[type].items = [];
}

function startLocalStatsRefresh() {
  stopLocalStatsRefresh();
  localStatsTimer = setInterval(() => {
    void loadLocalStats(true);
  }, AUTO_REFRESH_MS);
}

function stopLocalStatsRefresh() {
  if (localStatsTimer !== null) {
    clearInterval(localStatsTimer);
    localStatsTimer = null;
  }
}

/** @param {unknown} value */
function toNonNegativeNumber(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return 0;
  return numberValue;
}

/** @param {boolean} silent */
async function loadLocalStats(silent = false) {
  try {
    const res = await fetch('/api/v1/admin/cache/local', {
      headers: buildAuthHeaders(apiKey),
    });

    if (res.status === 401) {
      logout();
      return;
    }

    if (!res.ok) {
      if (!silent) showToast('加载缓存统计失败', 'error');
      return;
    }

    /** @type {{ local_image?: { count?: number, size_mb?: number }, local_video?: { count?: number, size_mb?: number } }} */
    const data = await res.json();

    if (ui.imgCount) ui.imgCount.textContent = String(toNonNegativeNumber(data.local_image?.count));
    if (ui.imgSize) ui.imgSize.textContent = `${toNonNegativeNumber(data.local_image?.size_mb)} MB`;
    if (ui.videoCount) ui.videoCount.textContent = String(toNonNegativeNumber(data.local_video?.count));
    if (ui.videoSize) ui.videoSize.textContent = `${toNonNegativeNumber(data.local_video?.size_mb)} MB`;
  } catch (_error) {
    if (!silent) showToast('请求缓存统计失败', 'error');
  }
}

/**
 * @param {CacheType} type
 * @param {{ force?: boolean, silent?: boolean }} [options]
 */
async function loadLocalCacheList(type, options = {}) {
  const force = options.force === true;
  const silent = options.silent === true;
  const state = cacheListState[type];

  if (!force && state.loaded) {
    if (state.visible) {
      renderLocalCacheList(type, state.items);
    }
    return state.items;
  }

  const body = getTableBody(type);
  if (body) {
    body.innerHTML = '<tr><td colspan="5">加载中...</td></tr>';
  }

  try {
    const params = new URLSearchParams({ type, page: '1', page_size: '1000' });
    const res = await fetch(`/api/v1/admin/cache/list?${params.toString()}`, {
      headers: buildAuthHeaders(apiKey),
    });

    if (res.status === 401) {
      logout();
      return [];
    }

    if (!res.ok) {
      if (body) body.innerHTML = '<tr><td colspan="5">加载失败</td></tr>';
      if (!silent) showToast('加载缓存列表失败', 'error');
      return [];
    }

    /** @type {{ status?: string, items?: LocalCacheItem[] }} */
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];

    state.items = items;
    state.loaded = true;

    const selected = selectedLocal[type];
    const existingNames = new Set(items.map((item) => String(item.name || '')));
    [...selected].forEach((name) => {
      if (!existingNames.has(name)) {
        selected.delete(name);
      }
    });

    if (state.visible) {
      renderLocalCacheList(type, items);
    }

    return items;
  } catch (_error) {
    if (body) body.innerHTML = '<tr><td colspan="5">加载失败</td></tr>';
    if (!silent) showToast('请求缓存列表失败', 'error');
    return [];
  }
}

/** @param {number} ms */
function formatTime(ms) {
  if (!ms) return '-';
  const date = new Date(ms);
  return date.toLocaleString('zh-CN', { hour12: false });
}

/** @param {number} bytes */
function formatSize(bytes) {
  if (!bytes) return '-';
  const kb = 1024;
  const mb = kb * 1024;
  if (bytes >= mb) return `${(bytes / mb).toFixed(2)} MB`;
  if (bytes >= kb) return `${(bytes / kb).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * @param {CacheType} type
 * @param {LocalCacheItem[]} items
 */
function renderLocalCacheList(type, items) {
  const body = getTableBody(type);
  if (!body) return;

  if (!items.length) {
    body.innerHTML = '<tr><td colspan="5">暂无文件</td></tr>';
    syncLocalSelectAllState(type);
    updateSelectedCount();
    return;
  }

  const selected = selectedLocal[type];

  body.innerHTML = items
    .map((item) => {
      const name = String(item.name || '');
      const safeName = escapeHtml(name);
      const checked = selected.has(name) ? 'checked' : '';
      const rowClass = selected.has(name) ? 'row-selected' : '';
      const preview = type === 'image' && item.preview_url
        ? `<img src="${escapeHtml(String(item.preview_url))}" alt="" class="cache-preview">`
        : '';

      return `
      <tr class="${rowClass}">
        <td class="text-center">
          <input type="checkbox" class="checkbox" data-name="${safeName}" ${checked}>
        </td>
        <td class="text-left">
          <div class="flex items-center gap-2">
            ${preview}
            <span class="font-mono text-xs text-gray-500">${safeName}</span>
          </div>
        </td>
        <td class="text-left">${formatSize(Number(item.size_bytes || 0))}</td>
        <td class="text-left text-xs text-gray-500">${formatTime(Number(item.mtime_ms || 0))}</td>
        <td class="text-center">
          <div class="cache-list-actions">
            <button type="button" class="cache-icon-button" data-action="view" data-name="${safeName}" title="查看">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
            <button type="button" class="cache-icon-button" data-action="delete" data-name="${safeName}" title="删除">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
    })
    .join('');

  syncLocalSelectAllState(type);
  updateSelectedCount();
}

/**
 * @param {CacheType} type
 * @param {Event} event
 */
function handleRowSelectChange(type, event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.type !== 'checkbox') return;

  const name = target.getAttribute('data-name');
  if (!name) return;

  toggleLocalSelect(type, name, target.checked, target);
}

/**
 * @param {CacheType} type
 * @param {Event} event
 */
function handleRowAction(type, event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const button = target.closest('button[data-action]');
  if (!(button instanceof HTMLButtonElement)) return;

  const action = button.getAttribute('data-action');
  const name = button.getAttribute('data-name');
  if (!action || !name) return;

  if (action === 'view') {
    viewLocalFile(type, name);
    return;
  }

  if (action === 'delete') {
    void deleteLocalFile(type, name);
  }
}

/**
 * @param {CacheType} type
 * @param {string} name
 * @param {boolean} checked
 * @param {HTMLInputElement} [checkbox]
 */
function toggleLocalSelect(type, name, checked, checkbox) {
  const selected = selectedLocal[type];
  if (checked) {
    selected.add(name);
  } else {
    selected.delete(name);
  }

  const row = checkbox?.closest('tr');
  row?.classList.toggle('row-selected', checked);

  syncLocalSelectAllState(type);
  updateSelectedCount();
}

/**
 * @param {CacheType} type
 * @param {boolean} shouldSelect
 */
function toggleLocalSelectAll(type, shouldSelect) {
  const selected = selectedLocal[type];
  selected.clear();

  if (shouldSelect) {
    cacheListState[type].items.forEach((item) => {
      if (item?.name) selected.add(item.name);
    });
  }

  syncLocalRowCheckboxes(type);
  updateSelectedCount();
}

/** @param {CacheType} type */
function syncLocalRowCheckboxes(type) {
  const body = getTableBody(type);
  if (!body) return;

  const selected = selectedLocal[type];
  body.querySelectorAll('input[type="checkbox"].checkbox').forEach((checkbox) => {
    if (!(checkbox instanceof HTMLInputElement)) return;
    const name = checkbox.getAttribute('data-name');
    if (!name) return;
    const checked = selected.has(name);
    checkbox.checked = checked;
    checkbox.closest('tr')?.classList.toggle('row-selected', checked);
  });

  syncLocalSelectAllState(type);
}

/** @param {CacheType} type */
function syncLocalSelectAllState(type) {
  const selectAll = getSelectAllBox(type);
  if (!selectAll) return;

  const total = cacheListState[type].items.length;
  const selected = selectedLocal[type].size;

  selectAll.checked = total > 0 && selected === total;
  selectAll.indeterminate = selected > 0 && selected < total;
}

function updateSelectedCount() {
  const selected = selectedLocal[currentSection].size;
  if (ui.selectedCount) {
    ui.selectedCount.textContent = String(selected);
  }
  setActionButtonsState();
}

function setActionButtonsState() {
  const selected = selectedLocal[currentSection].size;

  if (ui.loadBtn) {
    ui.loadBtn.disabled = isLocalDeleting;
    ui.loadBtn.textContent = '加载';
  }

  if (ui.deleteBtn) {
    ui.deleteBtn.disabled = isLocalDeleting || selected === 0;
    ui.deleteBtn.textContent = isLocalDeleting ? '清理中...' : '清理';
  }
}

/** @param {CacheType} type */
async function showCacheSection(type) {
  currentSection = type;

  cacheListState.image.visible = type === 'image';
  cacheListState.video.visible = type === 'video';

  ui.cacheCards.forEach((card) => {
    card.classList.toggle('selected', card.getAttribute('data-type') === type);
  });

  if (ui.localCacheLists) ui.localCacheLists.classList.remove('hidden');
  if (ui.localImageList) ui.localImageList.classList.toggle('hidden', type !== 'image');
  if (ui.localVideoList) ui.localVideoList.classList.toggle('hidden', type !== 'video');

  await loadLocalCacheList(type, { silent: true });
  syncLocalSelectAllState(type);
  updateSelectedCount();
}

/** @param {CacheType} type */
function viewLocalFile(type, name) {
  const safeName = encodeURIComponent(name);
  const url = type === 'image' ? `/v1/files/image/${safeName}` : `/v1/files/video/${safeName}`;
  window.open(url, '_blank');
}

/** @param {CacheType} type */
async function clearCache(type) {
  const target = type === 'image' ? '图片' : '视频';
  const ok = await confirmAction(`确定要清空本地${target}缓存吗？`, { okText: '清空' });
  if (!ok) return;

  try {
    const res = await fetch('/api/v1/admin/cache/clear', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(apiKey),
      },
      body: JSON.stringify({ type }),
    });

    if (res.status === 401) {
      logout();
      return;
    }

    /** @type {{ status?: string, result?: { deleted?: number }, error?: string }} */
    const data = await res.json();
    if (!res.ok || data.status !== 'success') {
      showToast(data.error || '清理失败', 'error');
      return;
    }

    clearStateForType(type);
    if (cacheListState[type].visible) {
      await loadLocalCacheList(type, { force: true, silent: true });
    }
    await loadLocalStats(true);
    updateSelectedCount();

    showToast(`清理成功，删除 ${toNonNegativeNumber(data.result?.deleted)} 项`, 'success');
  } catch (_error) {
    showToast('请求失败', 'error');
  }
}

/**
 * @param {CacheType} type
 * @param {string} name
 */
async function requestDeleteLocalFile(type, name) {
  try {
    const res = await fetch('/api/v1/admin/cache/item/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(apiKey),
      },
      body: JSON.stringify({ type, name }),
    });

    if (res.status === 401) {
      logout();
      return false;
    }

    if (!res.ok) {
      return false;
    }

    /** @type {{ status?: string }} */
    const data = await res.json();
    return data.status === 'success';
  } catch (_error) {
    return false;
  }
}

/**
 * @param {CacheType} type
 * @param {string} name
 */
async function deleteLocalFile(type, name) {
  if (isLocalDeleting) return;

  const ok = await confirmAction('确定要删除该文件吗？', { okText: '删除' });
  if (!ok) return;

  isLocalDeleting = true;
  setActionButtonsState();

  const deleted = await requestDeleteLocalFile(type, name);
  if (!deleted) {
    isLocalDeleting = false;
    setActionButtonsState();
    showToast('删除失败', 'error');
    return;
  }

  const state = cacheListState[type];
  state.items = state.items.filter((item) => item.name !== name);
  state.loaded = true;
  selectedLocal[type].delete(name);

  if (state.visible) {
    renderLocalCacheList(type, state.items);
  }

  await loadLocalStats(true);

  isLocalDeleting = false;
  setActionButtonsState();
  showToast('删除成功', 'success');
}

/** @param {CacheType} type */
async function deleteSelectedLocal(type) {
  const selectedNames = [...selectedLocal[type]];
  if (!selectedNames.length) {
    showToast('未选择文件', 'info');
    return;
  }

  const ok = await confirmAction(`确定要删除选中的 ${selectedNames.length} 个文件吗？`, { okText: '删除' });
  if (!ok) return;

  isLocalDeleting = true;
  setActionButtonsState();

  let success = 0;
  let failed = 0;

  for (let index = 0; index < selectedNames.length; index += DELETE_BATCH_SIZE) {
    const chunk = selectedNames.slice(index, index + DELETE_BATCH_SIZE);
    const results = await Promise.all(chunk.map((name) => requestDeleteLocalFile(type, name)));
    results.forEach((deleted) => {
      if (deleted) success += 1;
      else failed += 1;
    });
  }

  if (success > 0) {
    const removedSet = new Set(selectedNames);
    cacheListState[type].items = cacheListState[type].items.filter((item) => !removedSet.has(item.name));
    cacheListState[type].loaded = true;
    selectedLocal[type].clear();

    if (cacheListState[type].visible) {
      renderLocalCacheList(type, cacheListState[type].items);
    }

    await loadLocalStats(true);
  }

  isLocalDeleting = false;
  setActionButtonsState();

  if (failed === 0) {
    showToast(`已删除 ${success} 个文件`, 'success');
  } else {
    showToast(`删除完成：成功 ${success}，失败 ${failed}`, 'info');
  }
}

async function handleLoadClick() {
  if (isLocalDeleting) return;
  await loadLocalCacheList(currentSection, { force: true });
  await loadLocalStats(true);
  updateSelectedCount();
}

async function handleDeleteClick() {
  if (isLocalDeleting) return;
  await deleteSelectedLocal(currentSection);
}

async function init() {
  apiKey = await ensureApiKey();
  if (apiKey === null) return;

  cacheUI();
  setupConfirmDialog();
  bindEvents();

  await loadLocalStats();
  await showCacheSection('image');
  startLocalStatsRefresh();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void init();
  });
} else {
  void init();
}

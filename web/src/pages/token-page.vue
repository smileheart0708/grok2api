<script setup lang="ts">
import AdminPageShell from '@/components/admin/admin-page-shell.vue'
import { useLegacyPage } from '@/composables/use-legacy-page'
import '@/styles/pages/token-page.css'

useLegacyPage({
  scripts: [
    '/legacy/common/admin-auth.js',
    '/legacy/common/toast.js',
    '/legacy/common/draggable.js',
    '/legacy/scripts/token.js',
  ],
  mountName: 'mountTokenPage',
})
</script>

<template>
  <div id="toast-container" class="toast-container"></div>

  <AdminPageShell max-width="1280px">
    <div class="space-y-6">
      <div class="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h2 class="text-2xl font-semibold tracking-tight">Token 列表</h2>
          <p class="text-[var(--accents-4)] mt-1 text-sm">管理 Grok2API 的 Token 服务号池。</p>
        </div>
        <div class="flex items-center gap-3 w-full sm:w-auto">
          <button onclick="openImportModal()" class="geist-button-outline gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            导入
          </button>
          <button onclick="addToken()" class="geist-button gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            添加
          </button>
        </div>
      </div>

      <div class="h-px bg-[var(--border)] my-6"></div>

      <div id="stats-container" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="stat-card">
          <div id="stat-total" class="stat-value">-</div>
          <div class="stat-label">Token 总数</div>
        </div>
        <div class="stat-card">
          <div id="stat-active" class="stat-value text-green-600">-</div>
          <div class="stat-label">Token 正常</div>
        </div>
        <div class="stat-card">
          <div id="stat-cooling" class="stat-value text-orange-500">-</div>
          <div class="stat-label">Token 限流</div>
        </div>
        <div class="stat-card">
          <div id="stat-invalid" class="stat-value text-red-600">-</div>
          <div class="stat-label">Token 失效</div>
        </div>
        <div class="stat-card">
          <div id="stat-chat-quota" class="stat-value">-</div>
          <div class="stat-label">Chat 剩余</div>
        </div>
        <div class="stat-card">
          <div id="stat-image-quota" class="stat-value text-blue-600">-</div>
          <div class="stat-label">Image 剩余</div>
        </div>
        <div class="stat-card">
          <div id="stat-video-quota" class="stat-value text-gray-400">无法统计</div>
          <div class="stat-label">Video 剩余</div>
        </div>
        <div class="stat-card">
          <div id="stat-total-calls" class="stat-value">-</div>
          <div class="stat-label">总调用次数</div>
        </div>
      </div>

      <div
        id="token-filter-bar"
        class="token-filter-bar mb-4 bg-white border border-[var(--border)] rounded-lg px-4 py-3 flex flex-wrap items-center gap-4"
      >
        <div class="filter-group flex items-center gap-3">
          <span class="text-xs text-[var(--accents-5)]">类型</span>
          <label class="filter-chip">
            <input id="filter-type-sso" type="checkbox" onchange="onFilterChange()">
            <span>sso</span>
          </label>
          <label class="filter-chip">
            <input id="filter-type-supersso" type="checkbox" onchange="onFilterChange()">
            <span>supersso</span>
          </label>
        </div>
        <div class="filter-group flex items-center gap-3">
          <span class="text-xs text-[var(--accents-5)]">状态</span>
          <label class="filter-chip">
            <input id="filter-status-active" type="checkbox" onchange="onFilterChange()">
            <span>活跃</span>
          </label>
          <label class="filter-chip">
            <input id="filter-status-invalid" type="checkbox" onchange="onFilterChange()">
            <span>失效</span>
          </label>
          <label class="filter-chip">
            <input id="filter-status-exhausted" type="checkbox" onchange="onFilterChange()">
            <span>额度用尽</span>
          </label>
        </div>
        <div class="filter-summary ml-auto flex items-center gap-3">
          <span class="text-xs text-[var(--accents-5)]">结果 <span id="filter-result-count">0</span></span>
          <button onclick="resetFilters()" class="geist-button-outline text-xs px-3 h-7">清空筛选</button>
        </div>
      </div>

      <div class="rounded-lg overflow-hidden bg-white mb-4 overflow-x-auto">
        <table class="geist-table min-w-[800px]">
          <thead>
            <tr>
              <th class="w-10"><input id="select-all" type="checkbox" class="checkbox" onclick="toggleSelectAll()"></th>
              <th class="w-48 text-left">Token</th>
              <th class="w-24">类型</th>
              <th class="w-24">状态</th>
              <th class="w-20">额度</th>
              <th class="text-left">备注</th>
              <th class="w-40 text-center">操作</th>
            </tr>
          </thead>
          <tbody id="token-table-body"></tbody>
        </table>
        <div id="loading" class="text-center py-12 text-[var(--accents-4)]">加载中...</div>
        <div id="empty-state" class="hidden text-center py-12 text-[var(--accents-4)]">暂无 Token，请点击右上角导入或添加。</div>
      </div>
    </div>
  </AdminPageShell>

  <div
    id="batch-actions"
    class="fixed bottom-8 left-1/2 -translate-x-1/2 z-20 bg-white border border-[var(--border)] rounded-full px-3 py-2 flex items-center shadow-lg gap-3 cursor-move select-none active:cursor-grabbing whitespace-nowrap"
  >
    <div class="batch-actions-meta text-sm font-medium flex items-center gap-2">
      <span class="text-[var(--accents-5)] text-xs">已选择</span>
      <span id="selected-count" class="bg-black text-white text-xs px-1.5 py-0.5 rounded-full">0</span>
      <span class="text-[var(--accents-5)] text-xs">项</span>
    </div>
    <span class="toolbar-sep"></span>
    <div class="batch-actions-buttons flex items-center gap-1">
      <button id="btn-batch-export" onclick="batchExport()" class="geist-button-outline text-xs px-3 gap-1 border-0 hover:bg-gray-100">导出</button>
      <button
        id="btn-batch-update"
        onclick="batchUpdate()"
        class="geist-button-outline text-xs px-3 gap-1 border-0 hover:bg-gray-100 justify-center"
      >
        刷新
      </button>
      <button id="btn-batch-delete" onclick="batchDelete()" class="geist-button-danger text-xs px-3">删除</button>
    </div>
    <div id="batch-progress" class="hidden text-xs text-[var(--accents-5)] flex items-center gap-2">
      <span class="toolbar-sep"></span>
      <span id="batch-progress-text"></span>
      <button id="btn-pause-action" type="button" class="batch-link hidden" onclick="toggleBatchPause()">暂停</button>
      <button id="btn-stop-action" type="button" class="batch-link hidden" onclick="stopBatchRefresh()">终止</button>
    </div>
  </div>

  <div id="add-modal" class="modal-overlay hidden">
    <div id="add-modal-content" class="modal-content modal-lg">
      <div class="modal-header">
        <h3 class="modal-title">添加 Token</h3>
        <button onclick="closeAddModal()" class="modal-close" type="button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div id="add-tab-manual" class="tab-panel">
        <div class="space-y-4">
          <div>
            <label class="modal-label mb-1 block">Token</label>
            <input id="add-token-input" type="text" class="geist-input font-mono" placeholder="sso=...">
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="modal-label mb-1 block">类型</label>
              <select id="add-token-pool" class="geist-input">
                <option value="ssoBasic">ssoBasic</option>
                <option value="ssoSuper">ssoSuper</option>
              </select>
            </div>
            <div>
              <label class="modal-label mb-1 block">额度</label>
              <input id="add-token-quota" type="number" class="geist-input" min="0" value="80">
            </div>
          </div>
          <div>
            <label class="modal-label mb-1 block">备注</label>
            <input id="add-token-note" type="text" class="geist-input" placeholder="可选备注" maxlength="50">
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button onclick="closeAddModal()" class="geist-button-outline text-xs px-3" type="button">取消</button>
            <button onclick="submitManualAdd()" class="geist-button text-xs px-3" type="button">添加</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div id="import-modal" class="modal-overlay hidden">
    <div id="import-modal-content" class="modal-content modal-lg">
      <div class="modal-header">
        <h3 class="modal-title">批量导入 Token</h3>
        <button onclick="closeImportModal()" class="modal-close" type="button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="space-y-4">
        <div>
          <label class="modal-label mb-1 block">目标 Pool</label>
          <select id="import-pool" class="geist-input">
            <option value="ssoBasic">ssoBasic</option>
            <option value="ssoSuper">ssoSuper</option>
          </select>
        </div>
        <div>
          <label class="modal-label mb-1 block">Token 列表（每行一个）</label>
          <textarea id="import-text" class="geist-input font-mono h-48" placeholder="粘贴 Token，一行一个..."></textarea>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button onclick="closeImportModal()" class="geist-button-outline text-xs px-3" type="button">取消</button>
          <button onclick="submitImport()" class="geist-button text-xs px-3" type="button">开始导入</button>
        </div>
      </div>
    </div>
  </div>

  <div id="edit-modal" class="modal-overlay hidden">
    <div id="edit-modal-content" class="modal-content modal-md">
      <div class="modal-header">
        <h3 class="modal-title">编辑 Token</h3>
        <button onclick="closeEditModal()" class="modal-close" type="button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="space-y-4">
        <input id="edit-original-token" type="hidden">
        <input id="edit-original-pool" type="hidden">
        <div>
          <label class="modal-label mb-1 block">Token</label>
          <input id="edit-token-display" type="text" class="geist-input font-mono bg-gray-50 text-gray-500" disabled>
        </div>
        <div>
          <label class="modal-label mb-1 block">类型</label>
          <select id="edit-pool" class="geist-input">
            <option value="ssoBasic">ssoBasic</option>
            <option value="ssoSuper">ssoSuper</option>
          </select>
        </div>
        <div>
          <label class="modal-label mb-1 block">额度</label>
          <input id="edit-quota" type="number" class="geist-input" min="0">
        </div>
        <div>
          <label class="modal-label mb-1 block">备注</label>
          <input id="edit-note" type="text" class="geist-input" placeholder="可选备注" maxlength="50">
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button onclick="closeEditModal()" class="geist-button-outline text-xs px-3" type="button">取消</button>
          <button onclick="saveEdit()" class="geist-button text-xs px-3" type="button">保存</button>
        </div>
      </div>
    </div>
  </div>

  <div id="test-modal" class="modal-overlay hidden">
    <div id="test-modal-content" class="modal-content modal-lg">
      <div class="modal-header">
        <h3 class="modal-title">测试 Token</h3>
        <button onclick="closeTestModal()" class="modal-close" type="button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="space-y-4">
        <input id="test-token-value" type="hidden">
        <input id="test-token-type" type="hidden">
        <div>
          <label class="modal-label mb-1 block">当前 Token</label>
          <input id="test-token-display" type="text" class="geist-input font-mono bg-gray-50 text-gray-500" readonly>
        </div>
        <div>
          <label class="modal-label mb-1 block">测试模型（仅聊天模型）</label>
          <select id="test-model-select" class="geist-input"></select>
        </div>
        <div class="text-xs text-[var(--accents-5)]">测试消息固定为 <code>hi</code>，仅用于模拟一次下游聊天请求。</div>
        <div id="test-result-meta" class="text-xs text-[var(--accents-5)] hidden"></div>
        <pre
          id="test-result-content"
          class="hidden test-result-box text-xs font-mono whitespace-pre-wrap bg-[var(--accents-1)] border border-[var(--border)] rounded-md p-2 max-h-64 overflow-auto"
        ></pre>
        <div class="flex justify-end gap-2 pt-2">
          <button onclick="closeTestModal()" class="geist-button-outline text-xs px-3" type="button">取消</button>
          <button id="test-run-btn" onclick="runTokenTest()" class="geist-button text-xs px-3" type="button">开始测试</button>
        </div>
      </div>
    </div>
  </div>

  <div id="confirm-dialog" class="modal-overlay confirm-dialog hidden">
    <div class="modal-content modal-md">
      <div class="confirm-dialog-body">
        <div class="confirm-dialog-title">请确认</div>
        <div id="confirm-message" class="confirm-dialog-message"></div>
        <div class="confirm-dialog-actions">
          <button id="confirm-cancel" type="button" class="geist-button-outline text-xs px-3">取消</button>
          <button id="confirm-ok" type="button" class="geist-button-danger text-xs px-3">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

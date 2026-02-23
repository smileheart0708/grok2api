<script setup lang="ts">
import AdminPageShell from '@/components/admin/admin-page-shell.vue'
import { useLegacyPage } from '@/composables/use-legacy-page'
import '@/styles/pages/keys-page.css'

useLegacyPage({
  scripts: [
    '/legacy/common/admin-auth.js',
    '/legacy/common/toast.js',
    '/legacy/scripts/keys.js',
  ],
  mountName: 'mountKeysPage',
})
</script>

<template>
  <div id="toast-container" class="toast-container"></div>

  <AdminPageShell max-width="960px">
    <div class="keys-page-header flex flex-wrap justify-between items-start gap-3">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight">API Key 管理</h2>
        <p class="text-[var(--accents-4)] mt-1 text-sm">管理访问 /v1/* 的 API Keys（含每日额度）。</p>
      </div>
      <div class="flex items-center gap-3 w-full sm:w-auto">
        <button onclick="openCreateModal()" class="geist-button gap-2" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          新增 Key
        </button>
      </div>
    </div>

    <div class="h-px bg-[var(--border)] my-6"></div>

    <div id="keys-stats" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <div class="stat-card stat-card-compact">
        <div id="keys-stat-total" class="stat-value text-lg">0</div>
        <div class="stat-label">总数</div>
      </div>
      <div class="stat-card stat-card-compact">
        <div id="keys-stat-active" class="stat-value text-lg text-green-600">0</div>
        <div class="stat-label">启用</div>
      </div>
      <div class="stat-card stat-card-compact">
        <div id="keys-stat-inactive" class="stat-value text-lg text-gray-500">0</div>
        <div class="stat-label">禁用</div>
      </div>
      <div class="stat-card stat-card-compact">
        <div id="keys-stat-exhausted" class="stat-value text-lg text-orange-600">0</div>
        <div class="stat-label">今日额度用尽</div>
      </div>
    </div>

    <div class="keys-toolbar mb-4">
      <div class="keys-toolbar-left">
        <input id="keys-search" type="text" class="geist-input" placeholder="搜索名称或 Key..." oninput="onKeyFilterChange()">
        <select id="keys-status-filter" class="geist-input" onchange="onKeyFilterChange()">
          <option value="all">全部状态</option>
          <option value="active">仅启用</option>
          <option value="inactive">仅禁用</option>
          <option value="exhausted">仅额度用尽</option>
        </select>
        <button class="geist-button-outline text-xs px-3" onclick="resetKeyFilters()" type="button">重置</button>
      </div>
      <div class="keys-toolbar-right text-xs text-[var(--accents-5)]">结果 <span id="keys-filter-count">0</span></div>
    </div>

    <div class="rounded-lg overflow-hidden bg-white mb-4 overflow-x-auto">
      <table class="geist-table min-w-[1000px]">
        <thead>
          <tr>
            <th class="w-56 text-left">名称</th>
            <th class="w-52 text-left">Key</th>
            <th class="w-28">状态</th>
            <th class="w-64 text-left">每日额度（chat / heavy / image / video）</th>
            <th class="w-64 text-left">今日已用（chat / heavy / image / video）</th>
            <th class="w-40">创建时间</th>
            <th class="w-40 text-center">操作</th>
          </tr>
        </thead>
        <tbody id="keys-table-body"></tbody>
      </table>
      <div id="loading" class="text-center py-12 text-[var(--accents-4)]">加载中...</div>
      <div id="empty-state" class="hidden text-center py-12 text-[var(--accents-4)]">暂无 API Key，请点击右上角新增。</div>
    </div>
  </AdminPageShell>

  <div id="key-modal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="key-modal-title">
    <div id="key-modal-content" class="modal-content modal-lg">
      <div class="modal-header">
        <h3 id="key-modal-title" class="modal-title">新增 API Key</h3>
        <button type="button" onclick="closeKeyModal()" class="modal-close" aria-label="关闭弹窗">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="modal-label mb-1 block">密钥名</label>
            <input id="key-name" type="text" class="geist-input" placeholder="留空=随机生成" maxlength="50">
          </div>
          <div>
            <label class="modal-label mb-1 block">API Key 值</label>
            <div class="flex flex-col sm:flex-row gap-2">
              <input id="key-value" type="text" class="geist-input font-mono" placeholder="留空=随机生成 sk-...">
              <button type="button" class="geist-button-outline text-xs px-3" onclick="generateKeyValue()">自动生成</button>
            </div>
            <div id="key-value-hint" class="text-xs text-[var(--accents-5)] mt-1">允许任意字符串；建议使用 sk- 前缀。</div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs text-[var(--accents-5)]">额度预设</span>
          <button type="button" class="geist-button-outline text-xs px-3" onclick="applyKeyLimitPreset('recommended')">推荐</button>
          <button type="button" class="geist-button-outline text-xs px-3" onclick="applyKeyLimitPreset('unlimited')">不限</button>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label class="modal-label mb-1 block">Chat / 天</label>
            <input id="limit-chat" type="number" class="geist-input" placeholder="不限" min="0">
          </div>
          <div>
            <label class="modal-label mb-1 block">Heavy / 天</label>
            <input id="limit-heavy" type="number" class="geist-input" placeholder="不限" min="0">
          </div>
          <div>
            <label class="modal-label mb-1 block">生图 / 天</label>
            <input id="limit-image" type="number" class="geist-input" placeholder="不限" min="0">
          </div>
          <div>
            <label class="modal-label mb-1 block">视频 / 天</label>
            <input id="limit-video" type="number" class="geist-input" placeholder="不限" min="0">
          </div>
        </div>

        <div class="flex flex-col gap-3 pt-2 md:flex-row md:items-center md:justify-between">
          <div class="flex items-center gap-2">
            <input id="key-active" type="checkbox" class="checkbox" checked>
            <label for="key-active" class="text-sm">启用</label>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <button onclick="closeKeyModal()" class="geist-button-outline text-xs px-3" type="button">取消</button>
            <button id="submit-btn" onclick="submitKeyModal()" class="geist-button text-xs px-3" type="button">保存</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

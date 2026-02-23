<script setup lang="ts">
import AdminPageShell from '@/components/admin/admin-page-shell.vue'
import { useLegacyPage } from '@/composables/use-legacy-page'
import '@/styles/pages/cache-page.css'

useLegacyPage({
  scripts: [
    '/legacy/common/admin-auth.js',
    '/legacy/common/toast.js',
    '/legacy/common/draggable.js',
    '/legacy/scripts/cache.js',
  ],
  mountName: 'mountCachePage',
})
</script>

<template>
  <div id="toast-container" class="toast-container"></div>

  <AdminPageShell max-width="960px">
    <div class="space-y-6">
      <div class="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h2 class="text-2xl font-semibold tracking-tight">缓存管理</h2>
          <p class="text-[var(--accents-4)] mt-1 text-sm">管理本地图片与视频缓存。</p>
        </div>
      </div>

      <div class="h-px bg-[var(--border)] my-6"></div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="stat-card cache-card" data-type="image">
          <div class="flex items-start justify-between">
            <div>
              <div class="cache-stat-label">本地图片</div>
              <div class="cache-stat-value">
                <span id="img-count">0</span>
                <span class="text-xs text-[var(--accents-4)] ml-1">个文件</span>
              </div>
            </div>
            <div class="text-right">
              <div id="img-size" class="text-xs font-mono text-[var(--accents-4)]">0 MB</div>
              <button type="button" class="cache-action-btn mt-4 cache-clear-btn" data-type="image" title="清空缓存">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div class="stat-card cache-card" data-type="video">
          <div class="flex items-start justify-between">
            <div>
              <div class="cache-stat-label">本地视频</div>
              <div class="cache-stat-value">
                <span id="video-count">0</span>
                <span class="text-xs text-[var(--accents-4)] ml-1">个文件</span>
              </div>
            </div>
            <div class="text-right">
              <div id="video-size" class="text-xs font-mono text-[var(--accents-4)]">0 MB</div>
              <button type="button" class="cache-action-btn mt-4 cache-clear-btn" data-type="video" title="清空缓存">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div id="local-cache-lists" class="space-y-4 hidden">
        <div id="local-image-list" class="cache-list hidden">
          <div class="rounded-lg overflow-hidden bg-white overflow-x-auto">
            <table class="geist-table min-w-[600px]">
              <thead>
                <tr>
                  <th class="w-10 text-center"><input id="local-image-select-all" type="checkbox" class="checkbox"></th>
                  <th class="w-108 text-left">文件</th>
                  <th class="w-32 text-left">大小</th>
                  <th class="w-48 text-left">时间</th>
                  <th class="w-24 text-center">操作</th>
                </tr>
              </thead>
              <tbody id="local-image-body"></tbody>
            </table>
          </div>
        </div>
        <div id="local-video-list" class="cache-list hidden">
          <div class="rounded-lg overflow-hidden bg-white overflow-x-auto">
            <table class="geist-table min-w-[600px]">
              <thead>
                <tr>
                  <th class="w-10 text-center"><input id="local-video-select-all" type="checkbox" class="checkbox"></th>
                  <th class="w-108 text-left">文件</th>
                  <th class="w-32 text-left">大小</th>
                  <th class="w-48 text-left">时间</th>
                  <th class="w-24 text-center">操作</th>
                </tr>
              </thead>
              <tbody id="local-video-body"></tbody>
            </table>
          </div>
        </div>
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
      <button id="btn-load-stats" type="button" class="geist-button-outline text-xs px-3 gap-1 border-0 hover:bg-gray-100">
        加载
      </button>
      <button id="btn-delete-assets" type="button" class="geist-button-danger text-xs px-3">清理</button>
    </div>
  </div>

  <dialog id="confirm-dialog" class="confirm-dialog">
    <div class="confirm-dialog-body">
      <div class="confirm-dialog-title">请确认</div>
      <div id="confirm-message" class="confirm-dialog-message"></div>
      <div class="confirm-dialog-actions">
        <button id="confirm-cancel" type="button" class="geist-button-outline text-xs px-3">取消</button>
        <button id="confirm-ok" type="button" class="geist-button-danger text-xs px-3">确定</button>
      </div>
    </div>
  </dialog>
</template>

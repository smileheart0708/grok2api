<script setup lang="ts">
import Chart from 'chart.js/auto'
import UiToastHost from '@/components/ui/ui-toast-host.vue'
import AdminPageShell from '@/components/admin/admin-page-shell.vue'
import UiButton from '@/components/ui/ui-button.vue'
import { useLegacyPage } from '@/composables/use-legacy-page'
import { useLegacyCommonBridge } from '@/legacy/common-bridge'
import '@/styles/pages/datacenter-page.css'

if (typeof window !== 'undefined') {
  window.Chart = Chart
}

useLegacyCommonBridge({
  enableAdminAuth: true,
  logoutRedirectPath: '/admin/datacenter',
})

useLegacyPage({
  scripts: ['/legacy/scripts/datacenter.js'],
  mountName: 'mountDatacenterPage',
})
</script>

<template>
  <AdminPageShell max-width="960px">
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-2xl font-semibold tracking-tight">数据中心</h2>
          <p class="mt-1 text-sm text-[var(--accents-4)]">常用指标与后台日志。</p>
        </div>
        <div class="datacenter-controls flex items-center gap-2">
          <UiButton id="btn-refresh" variant="outline" size="xs">刷新</UiButton>
          <label class="dc-toggle text-xs text-[var(--accents-4)]">
            <input
              id="auto-refresh"
              type="checkbox"
              class="size-3 shrink-0 cursor-pointer rounded-[4px] border border-[var(--accents-3)] bg-[var(--surface)] accent-black transition-opacity"
              checked
            />
            自动刷新
          </label>
        </div>
      </div>

      <div class="my-6 h-px bg-[var(--border)]"></div>

      <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div class="stat-card">
          <div id="m-token-total" class="stat-value">-</div>
          <div class="stat-label">Token 总数</div>
        </div>
        <div class="stat-card">
          <div id="m-token-active" class="stat-value text-green-600">-</div>
          <div class="stat-label">Token 正常</div>
        </div>
        <div class="stat-card">
          <div id="m-token-cooling" class="stat-value text-orange-500">-</div>
          <div class="stat-label">Token 限流</div>
        </div>
        <div class="stat-card">
          <div id="m-token-invalid" class="stat-value text-red-600">-</div>
          <div class="stat-label">Token 失效</div>
        </div>
        <div class="stat-card">
          <div id="m-total-calls" class="stat-value">-</div>
          <div class="stat-label">总调用次数</div>
        </div>
        <div class="stat-card">
          <div id="m-req-total" class="stat-value">-</div>
          <div class="stat-label">总请求数</div>
        </div>
        <div class="stat-card">
          <div id="m-req-success" class="stat-value text-green-600">-</div>
          <div class="stat-label">成功请求</div>
        </div>
        <div class="stat-card">
          <div id="m-req-failed" class="stat-value text-red-600">-</div>
          <div class="stat-label">失败请求</div>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div class="stat-card">
          <div id="m-success-rate" class="stat-value">-</div>
          <div class="stat-label">成功率</div>
        </div>
        <div class="stat-card">
          <div id="m-local-image" class="stat-value">-</div>
          <div class="stat-label">本地图片</div>
        </div>
        <div class="stat-card">
          <div id="m-local-video" class="stat-value">-</div>
          <div class="stat-label">本地视频</div>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4">
        <div class="card">
          <div class="card-title">24 小时请求趋势</div>
          <div class="chart-wrap">
            <canvas id="chart-hourly"></canvas>
          </div>
        </div>
        <div class="card">
          <div class="card-title">7 天请求统计</div>
          <div class="chart-wrap">
            <canvas id="chart-daily"></canvas>
          </div>
        </div>
        <div class="card">
          <div class="card-title">模型调用分布（Top 10）</div>
          <div class="chart-wrap">
            <canvas id="chart-models"></canvas>
          </div>
        </div>
      </div>

      <div class="my-6 h-px bg-[var(--border)]"></div>

      <div class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold tracking-tight">后台日志</h3>
            <p class="mt-1 text-sm text-[var(--accents-4)]">
              显示 logs/*.log（格式化展示，完整行）。
            </p>
          </div>
          <div class="log-toolbar flex flex-wrap items-center gap-2">
            <select id="log-file" class="geist-input w-56 text-xs"></select>
            <input
              id="log-lines"
              type="number"
              min="50"
              max="5000"
              value="500"
              class="geist-input w-24 text-xs"
              title="尾部行数"
            />
            <input
              id="log-filter"
              type="text"
              placeholder="过滤关键词…"
              class="geist-input w-40 text-xs"
            />
            <UiButton id="log-refresh" variant="outline" size="xs">刷新</UiButton>
          </div>
        </div>
        <div class="log-panel">
          <pre id="log-content" class="log-content">加载中...</pre>
        </div>
      </div>
    </div>
  </AdminPageShell>
  <UiToastHost />
</template>

<script setup lang="ts">
import UiButton from '@/components/ui/ui-button.vue'
import UiToastHost from '@/components/ui/ui-toast-host.vue'
import { useLegacyPage } from '@/composables/use-legacy-page'
import { useLegacyCommonBridge } from '@/legacy/common-bridge'
import '@/styles/pages/chat-page.css'

useLegacyCommonBridge()

useLegacyPage({
  scripts: ['/legacy/scripts/chat.js'],
  mountName: 'mountChatPage',
})

function saveApiKey(): void {
  window.saveApiKey?.()
}

function clearApiKey(): void {
  window.clearApiKey?.()
}

function switchTab(tab: 'chat' | 'image' | 'video'): void {
  window.switchTab?.(tab)
}

function pickChatImage(): void {
  window.pickChatImage?.()
}

function sendChat(): void {
  void window.sendChat?.()
}

function generateImage(): void {
  void window.generateImage?.()
}

function startImageContinuous(): void {
  void window.startImageContinuous?.()
}

function stopImageContinuous(): void {
  window.stopImageContinuous?.()
}

function clearImageWaterfall(): void {
  window.clearImageWaterfall?.()
}

function pickVideoImage(): void {
  window.pickVideoImage?.()
}

function generateVideo(): void {
  void window.generateVideo?.()
}
</script>

<template>
  <header class="border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-md sticky top-0 z-10">
    <div class="chat-public-header max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="font-semibold tracking-tight">Grok2API</div>
        <div class="text-xs text-[var(--accents-5)]">在线聊天</div>
      </div>
      <div class="chat-top-actions flex items-center gap-2">
        <a
          href="/login"
          class="inline-flex min-h-7 items-center justify-center rounded-[var(--btn-radius)] border border-[var(--btn-neutral-outline-border)] bg-[var(--btn-neutral-outline-bg)] px-2.5 text-xs font-semibold text-[var(--btn-neutral-outline-fg)] transition-[color,background-color,border-color] duration-200 ease-out hover:border-[var(--btn-neutral-outline-hover-border)] hover:bg-[var(--btn-neutral-outline-hover-bg)] hover:text-[var(--btn-neutral-outline-hover-fg)]"
        >
          后台登录
        </a>
      </div>
    </div>
  </header>

  <main class="fade-in flex-1 mx-auto w-full max-w-5xl space-y-4 px-6 py-6">
    <div class="card">
      <div class="card-title">连接配置</div>
      <div class="grid grid-cols-12 gap-3 items-end">
        <div class="col-span-12 md:col-span-5">
          <label class="field-label">API Key（Bearer）</label>
          <input id="api-key-input" type="password" class="geist-input font-mono" placeholder="sk-... 或你自定义的 Key">
          <div class="text-xs text-[var(--accents-5)] mt-1">保存在浏览器本地，仅用于调用本服务 /v1/*。</div>
        </div>
        <div class="col-span-12 md:col-span-4">
          <label class="field-label">模型</label>
          <select id="model-select" class="geist-input h-[34px]"></select>
        </div>
        <div class="col-span-6 md:col-span-1 flex items-center gap-2">
          <input
            id="stream-toggle"
            type="checkbox"
            class="size-3 shrink-0 cursor-pointer rounded-[4px] border border-[var(--accents-3)] bg-[var(--surface)] accent-black transition-opacity"
            checked
          >
          <label for="stream-toggle" class="text-sm">Stream</label>
        </div>
        <div class="col-span-12 md:col-span-2 flex flex-wrap justify-end gap-2">
          <UiButton variant="outline" size="xs" @click="saveApiKey">保存</UiButton>
          <UiButton variant="danger" size="xs" @click="clearApiKey">清除</UiButton>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="tabs">
        <UiButton id="tab-chat" class="tab active" variant="tab" size="sm" @click="switchTab('chat')">聊天</UiButton>
        <UiButton id="tab-image" class="tab" variant="tab" size="sm" @click="switchTab('image')">生图</UiButton>
        <UiButton id="tab-video" class="tab" variant="tab" size="sm" @click="switchTab('video')">生成视频</UiButton>
      </div>

      <div id="panel-chat">
        <div id="chat-messages" class="chat-messages"></div>

        <div class="composer">
          <div class="composer-row">
            <input id="chat-file" type="file" accept="image/*" class="hidden">
            <UiButton variant="outline" size="xs" @click="pickChatImage">上传图片</UiButton>
            <div id="chat-attach-info" class="text-xs text-[var(--accents-5)]"></div>
            <div class="flex-1"></div>
            <UiButton variant="solid" size="xs" class="px-4 composer-primary" @click="sendChat">发送</UiButton>
          </div>
          <textarea id="chat-input" class="geist-input h-24" placeholder="输入消息..."></textarea>
          <div id="chat-attach-preview" class="attach-preview hidden"></div>
        </div>
      </div>

      <div id="panel-image" class="hidden">
        <div id="image-mode-hint" class="text-xs text-[var(--accents-5)] mb-2 hidden">当前为新生图方式：支持实时瀑布流、宽高比与并发数量。</div>
        <div id="image-run-mode-wrap" class="grid grid-cols-12 gap-3 items-end mb-3 hidden">
          <div class="col-span-12 md:col-span-3">
            <label class="field-label">运行模式</label>
            <select id="image-run-mode" class="geist-input h-[34px]">
              <option value="single">single（单次）</option>
              <option value="continuous">continuous（持续）</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-12 gap-3 items-end">
          <div class="col-span-12 md:col-span-4">
            <label class="field-label">Prompt</label>
            <textarea id="image-prompt" class="geist-input h-24" placeholder="描述你要生成的图片..."></textarea>
          </div>
          <div id="image-n-wrap" class="col-span-6 md:col-span-2">
            <label class="field-label">数量 n</label>
            <input id="image-n" type="number" class="geist-input" min="1" max="10" value="1">
          </div>
          <div id="image-aspect-wrap" class="col-span-6 md:col-span-2 hidden">
            <label class="field-label">宽高比</label>
            <select id="image-aspect" class="geist-input h-[34px]">
              <option value="2:3">2:3</option>
              <option value="1:1">1:1</option>
              <option value="3:2">3:2</option>
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
            </select>
          </div>
          <div id="image-concurrency-wrap" class="col-span-6 md:col-span-2 hidden">
            <label class="field-label">并发数量</label>
            <select id="image-concurrency" class="geist-input h-[34px]">
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </div>
          <div id="image-generate-wrap" class="col-span-12 md:col-span-2 flex justify-end">
            <UiButton id="image-generate-btn" variant="solid" size="xs" class="px-4" @click="generateImage">生成</UiButton>
          </div>
        </div>
        <div id="image-continuous-wrap" class="mt-4 hidden">
          <div class="imagine-actions mb-3">
            <UiButton id="image-start-btn" variant="outline" size="xs" @click="startImageContinuous">开始</UiButton>
            <UiButton id="image-stop-btn" variant="outline" size="xs" disabled @click="stopImageContinuous">
              停止
            </UiButton>
            <UiButton id="image-clear-btn" variant="outline" size="xs" @click="clearImageWaterfall">清空</UiButton>
          </div>
          <div class="imagine-metrics mb-3">
            <div class="imagine-metric"><span>状态</span><b id="image-status-text">未连接</b></div>
            <div class="imagine-metric"><span>图片数量</span><b id="image-count-value">0</b></div>
            <div class="imagine-metric"><span>活跃任务</span><b id="image-active-value">0</b></div>
            <div class="imagine-metric"><span>平均耗时</span><b id="image-latency-value">-</b></div>
            <div class="imagine-metric"><span>最后错误</span><b id="image-error-value">-</b></div>
          </div>
          <div id="image-empty-state" class="result-placeholder">等待开始持续生图...</div>
          <div id="image-waterfall" class="image-waterfall"></div>
        </div>
        <div id="image-results" class="results-grid mt-4"></div>
      </div>

      <div id="panel-video" class="hidden">
        <div class="grid grid-cols-12 gap-3 items-end">
          <div class="col-span-12 md:col-span-7">
            <label class="field-label">Prompt</label>
            <textarea id="video-prompt" class="geist-input h-24" placeholder="描述你要生成的视频..."></textarea>
          </div>
          <div class="col-span-12 md:col-span-5">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="field-label">比例</label>
                <select id="video-aspect" class="geist-input h-[34px]">
                  <option value="3:2">3:2</option>
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                  <option value="2:3">2:3</option>
                </select>
              </div>
              <div>
                <label class="field-label">时长（秒）</label>
                <input id="video-length" type="number" class="geist-input" min="5" max="15" value="6">
              </div>
              <div>
                <label class="field-label">分辨率</label>
                <select id="video-resolution" class="geist-input h-[34px]">
                  <option value="SD">SD</option>
                  <option value="HD">HD</option>
                </select>
              </div>
              <div>
                <label class="field-label">预设</label>
                <select id="video-preset" class="geist-input h-[34px]">
                  <option value="custom">custom</option>
                  <option value="normal">normal</option>
                  <option value="fun">fun</option>
                  <option value="spicy">spicy</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div class="composer mt-4">
          <div class="composer-row">
            <input id="video-file" type="file" accept="image/*" class="hidden">
            <UiButton variant="outline" size="xs" @click="pickVideoImage">上传参考图（可选）</UiButton>
            <div id="video-attach-info" class="text-xs text-[var(--accents-5)]"></div>
            <div class="flex-1"></div>
            <UiButton variant="solid" size="xs" class="px-4 composer-primary" @click="generateVideo">生成视频</UiButton>
          </div>
          <div id="video-attach-preview" class="attach-preview hidden"></div>
        </div>

        <div id="video-results" class="mt-4"></div>
      </div>
    </div>
  </main>
  <UiToastHost />
</template>

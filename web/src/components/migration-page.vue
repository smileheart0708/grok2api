<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

interface MigrationPageProps {
  title: string
  description: string
  routePath: string
  legacyPath?: string
}

const props = defineProps<MigrationPageProps>()

const quickLinks = [
  '/login',
  '/admin/token',
  '/admin/keys',
  '/admin/config',
  '/admin/datacenter',
  '/admin/cache',
  '/chat',
] as const

const legacyHref = computed(() => props.legacyPath ?? props.routePath)
</script>

<template>
  <main
    class="grid min-h-dvh place-items-center p-6 [background:radial-gradient(800px_420px_at_-10%_-20%,rgb(66_153_225_/_20%),transparent_60%),radial-gradient(760px_420px_at_120%_120%,rgb(56_189_248_/_16%),transparent_58%),linear-gradient(180deg,#f8fbff_0%,#f4f7fb_100%)] max-md:p-4"
  >
    <section
      class="grid w-full max-w-[900px] gap-3.5 rounded-2xl border border-[#d7e4f8] bg-white/92 p-7 shadow-[0_24px_70px_rgb(15_23_42_/_12%)] backdrop-blur-[6px] max-md:p-[18px]"
    >
      <p
        class="m-0 inline-flex w-fit rounded-full border border-[#bfdbfe] bg-[#dbeafe] px-2.5 py-1 text-xs font-semibold text-[#1e3a8a]"
      >
        Vue 渐进迁移中
      </p>
      <h1 class="m-0 text-[clamp(24px,3.5vw,34px)] leading-[1.15] text-[#0f172a]">{{ title }}</h1>
      <p class="m-0 text-[15px] leading-[1.65] text-[#334155]">{{ description }}</p>

      <p class="m-0 text-[13px] text-[#475569]">当前路由：{{ routePath }}</p>

      <div class="flex flex-wrap gap-2.5">
        <a
          class="inline-flex rounded-lg border border-[#2563eb] bg-white px-2.5 py-2 text-[13px] text-[#1d4ed8] no-underline transition-[border-color,transform,box-shadow] duration-200 ease-out hover:-translate-y-px hover:border-[#2563eb] hover:shadow-[0_10px_20px_rgb(37_99_235_/_15%)]"
          :href="legacyHref"
          target="_blank"
          rel="noopener noreferrer"
        >
          打开旧版页面
        </a>
      </div>

      <nav class="flex flex-wrap gap-2" aria-label="管理面板路由导航">
        <RouterLink
          v-for="link in quickLinks"
          :key="link"
          class="inline-flex rounded-lg border border-[#cbd5e1] bg-white px-2.5 py-2 text-[13px] text-[#0f172a] no-underline transition-[border-color,transform,box-shadow] duration-200 ease-out hover:-translate-y-px hover:border-[#2563eb] hover:shadow-[0_10px_20px_rgb(37_99_235_/_15%)]"
          :to="link"
        >
          {{ link }}
        </RouterLink>
      </nav>
    </section>
  </main>
</template>

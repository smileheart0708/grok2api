<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <main
    class="grid min-h-dvh place-items-center bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-6"
  >
    <section
      class="grid w-full max-w-[560px] gap-3 rounded-[14px] border border-[#cbd5e1] bg-white p-6 shadow-[0_14px_40px_rgb(15_23_42_/_8%)]"
    >
      <p class="m-0 text-[40px] font-bold text-[#0f172a]">404</p>
      <h1 class="m-0 text-2xl text-[#0f172a]">页面不存在</h1>
      <p class="m-0 text-sm leading-[1.6] text-[#475569]">
        路由未匹配，请返回登录页或管理页继续操作。
      </p>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          class="inline-flex rounded-lg border border-[#93c5fd] px-2.5 py-2 text-[13px] text-[#1d4ed8] no-underline hover:border-[#2563eb]"
          to="/login"
        >
          前往 /login
        </RouterLink>
        <RouterLink
          class="inline-flex rounded-lg border border-[#93c5fd] px-2.5 py-2 text-[13px] text-[#1d4ed8] no-underline hover:border-[#2563eb]"
          to="/admin/token"
        >
          前往 /admin/token
        </RouterLink>
      </div>
    </section>
  </main>
</template>

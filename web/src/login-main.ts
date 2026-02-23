import { createApp } from 'vue'
import { initTheme } from '@/composables/use-theme'
import LoginPage from '@/pages/login-page.vue'
import '@/styles/index.css'

initTheme()

createApp(LoginPage).mount('#app')

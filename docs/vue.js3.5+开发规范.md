

# Vue.js 3.5+ 现代开发手册

> 专为 AI 辅助开发设计的标准化指南 | 最后更新：2026-02-19

---

## 📋 目录

1. [核心变革概览](#核心变革概览)
2. [响应式 Props 解构](#响应式-props-解构)
3. [模板引用新范式](#模板引用新范式)
4. [监听器增强](#监听器增强)
5. [SSR 现代实践](#ssr-现代实践)
6. [Teleport 延迟挂载](#teleport-延迟挂载)
7. [自定义元素增强](#自定义元素增强)
8. [性能最佳实践](#性能最佳实践)
9. [AI 提示词模板](#ai-提示词模板)

---

## 核心变革概览

| 特性       | 3.4 及以前        | 3.5+ 推荐写法            |
| -------- | -------------- | -------------------- |
| Props 解构 | ❌ 非响应式         | ✅ 默认响应式              |
| 模板引用     | `ref()` + 同名属性 | `useTemplateRef()`   |
| 监听清理     | 手动返回清理函数       | `onWatcherCleanup()` |
| Teleport | 目标必须预先存在       | 支持 `defer` 延迟        |
| SSR 水合   | 全量水合           | 支持懒水合策略              |

---

## 响应式 Props 解构

### ✅ 3.5+ 标准写法

```vue
<script setup lang="ts">
// 直接解构，自动响应式
const { 
  count = 0,           // 默认值
  msg = 'hello',       // 默认值
  user                 // 必需 props
} = defineProps<{
  count?: number
  msg?: string
  user: User
}>()

// ✅ 直接使用 - 编译器自动转换为 props.count
console.log(count)

// ✅ 监听 - 需要包裹在 getter 中
watch(() => count, (newVal) => {
  console.log('count changed:', newVal)
})

// ✅ 传入组合式函数 - 使用 getter 或 toValue
useDynamicCount(() => count)
</script>
```

### ❌ 避免的老写法

```vue
<script setup lang="ts">
// ❌ 3.5+ 不再推荐
const props = withDefaults(
  defineProps<{
    count?: number
    msg?: string
  }>(),
  {
    count: 0,
    msg: 'hello'
  }
)

// ❌ 直接解构失去响应性 (3.4 及以前的问题)
const { count } = props
</script>
```

### ⚠️ 重要注意事项

```vue
<script setup lang="ts">
const { count } = defineProps<{ count?: number }>()

// ❌ 错误：直接传递会失去响应性
watch(count, handler)  // 编译错误

// ✅ 正确：使用 getter
watch(() => count, handler)

// ✅ 正确：使用 computed
const doubled = computed(() => count * 2)

// ✅ 正确：组合式函数应使用 toValue
function useCount(source: MaybeRefOrGetter<number>) {
  const value = toValue(source)
  // ...
}
</script>
```

---

## 模板引用新范式

### ✅ 3.5+ 标准写法：useTemplateRef()

```vue
<script setup lang="ts">
import { useTemplateRef, onMounted } from 'vue'

// 支持动态 ref 名称
const inputRef = useTemplateRef<HTMLInputElement>('input')
const dynamicRef = useTemplateRef<HTMLElement>(dynamicKey)

onMounted(() => {
  inputRef.value?.focus()
})
</script>

<template>
  <!-- ref 属性值匹配 useTemplateRef 的参数 -->
  <input ref="input" type="text" />
  <div :ref="dynamicKey">动态引用</div>
</template>
```

### ❌ 避免的老写法

```vue
<script setup lang="ts">
// ❌ 3.5+ 不再推荐（仅支持静态 ref）
const input = ref<HTMLInputElement | null>(null)
</script>

<template>
  <input ref="input" />  <!-- 变量名必须与 ref 属性完全一致 -->
</template>
```

### 🔑 核心优势对比

| 特性        | `ref()` 老写法 | `useTemplateRef()` 新写法 |
| --------- | ----------- | ---------------------- |
| 动态 ref 名称 | ❌ 不支持       | ✅ 支持                   |
| 类型推断      | 手动声明        | 自动推断                   |
| IDE 支持    | 基础          | 增强（自动补全、警告）            |
| 多个相同 ref  | ❌ 困难        | ✅ 原生支持                 |

---

## 监听器增强

### onWatcherCleanup() 清理副作用

```vue
<script setup lang="ts">
import { watch, onWatcherCleanup } from 'vue'

// ✅ 3.5+ 标准写法
watch(id, (newId) => {
  const controller = new AbortController()

  fetch(`/api/${newId}`, { signal: controller.signal })
    .then(res => res.json())
    .then(data => console.log(data))

  // 自动在下次监听前或组件卸载时调用
  onWatcherCleanup(() => {
    controller.abort()  // 取消过时请求
    console.log('清理完成')
  })
})

// ✅ 支持多个清理回调
watch(source, () => {
  const timer1 = setInterval(() => {}, 1000)
  const timer2 = setInterval(() => {}, 2000)

  onWatcherCleanup(() => clearInterval(timer1))
  onWatcherCleanup(() => clearInterval(timer2))
})
</script>
```

### ❌ 避免的老写法

```vue
<script setup lang="ts">
// ❌ 需要手动返回清理函数
watch(id, (newId) => {
  const controller = new AbortController()

  fetch(`/api/${newId}`)

  return () => {
    controller.abort()
  }
})
</script>
```

### watch deep 选项支持数字

```vue
<script setup lang="ts">
// ✅ 控制监听深度（3.5+）
watch(largeObject, handler, {
  deep: 2  // 只监听 2 层深度，提升性能
})

// ✅ 对比
watch(largeObject, handler, {
  deep: true  // 监听所有层级（可能性能开销大）
})
</script>
```

---

## SSR 现代实践

### Lazy Hydration（懒水合）

```vue
<script setup lang="ts">
import { defineAsyncComponent, hydrateOnVisible, hydrateOnIdle } from 'vue'

// ✅ 可见时水合
const LazyVisible = defineAsyncComponent({
  loader: () => import('./HeavyComponent.vue'),
  hydrate: hydrateOnVisible()
})

// ✅ 空闲时水合（可指定延迟）
const LazyIdle = defineAsyncComponent({
  loader: () => import('./NonUrgentComponent.vue'),
  hydrate: hydrateOnIdle(2000)  // 2 秒后水合
})

// ✅ 交互时水合
const LazyInteraction = defineAsyncComponent({
  loader: () => import('./InteractiveComponent.vue'),
  hydrate: hydrateOnInteraction('click')
})
</script>
```

### useId() 生成稳定 ID

```vue
<script setup lang="ts">
import { useId } from 'vue'

// ✅ SSR 安全的唯一 ID（服务端和客户端一致）
const nameId = useId()
const emailId = useId()
</script>

<template>
  <form>
    <div>
      <label :for="nameId">姓名：</label>
      <input :id="nameId" type="text" />
    </div>
    <div>
      <label :for="emailId">邮箱：</label>
      <input :id="emailId" type="email" />
    </div>
  </form>
</template>
```

### data-allow-mismatch 抑制水合警告

```vue
<template>
  <!-- ✅ 允许文本内容不匹配 -->
  <span data-allow-mismatch="text">
    {{ new Date().toLocaleString() }}
  </span>

  <!-- ✅ 允许特定类型不匹配 -->
  <div data-allow-mismatch="class">
    {{ dynamicClass }}
  </div>

  <!-- ✅ 允许所有类型不匹配 -->
  <section data-allow-mismatch>
    {{ serverOnlyData }}
  </section>
</template>
```

**允许的值：** `text` | `children` | `class` | `style` | `attribute`

---

## Teleport 延迟挂载

### ✅ defer 属性

```vue
<template>
  <!-- ✅ 3.5+ 支持目标元素后定义 -->
  <Teleport defer target="#modal-container">
    <div class="modal">内容</div>
  </Teleport>

  <!-- 目标元素可以在 Teleport 之后 -->
  <div id="modal-container"></div>
</template>
```

### ❌ 避免的限制

```vue
<template>
  <!-- ❌ 3.4 及以前：目标必须预先存在 -->
  <Teleport target="#container">
    <!-- 如果 #container 不存在会报错 -->
  </Teleport>

  <div id="container"></div>
</template>
```

---

## 自定义元素增强

### defineCustomElement 新选项

```ts
import MyElement from './MyElement.ce.vue'
import { defineCustomElement } from 'vue'

// ✅ 3.5+ 支持第二个参数配置
defineCustomElement(MyElement, {
  // 不使用 Shadow DOM
  shadowRoot: false,

  // CSP nonce
  nonce: 'xxx',

  // 配置应用实例
  configureApp(app) {
    app.config.errorHandler = (err) => {
      console.error(err)
    }
    app.use(i18n)
  }
})
```

### 新增组合式 API

```vue
<script setup lang="ts">
import { useHost, useShadowRoot } from 'vue'

// ✅ 获取宿主元素
const host = useHost()

// ✅ 获取 Shadow Root
const shadowRoot = useShadowRoot()

// Options API 中也可用
// this.$host 访问宿主元素
</script>
```

---

## 性能最佳实践

### 响应式系统优化利用

```vue
<script setup lang="ts">
// ✅ 3.5 响应式系统内存使用减少 56%
// ✅ 大型深层响应式数组操作提升 10 倍

// 放心使用深层响应式数据
const largeList = reactive<Array<ComplexObject>>([])

// 计算属性性能提升，无 stale 值问题
const computedValue = computed(() => {
  return largeList.filter(item => item.active)
})
</script>
```

### 避免常见性能陷阱

```vue
<script setup lang="ts">
// ✅ 使用数字控制 watch 深度
watch(largeData, handler, { deep: 2 })

// ✅ 使用 onWatcherCleanup 避免内存泄漏
watch(id, (newId) => {
  const subscription = subscribe(newId)
  onWatcherCleanup(() => subscription.unsubscribe())
})

// ✅ 使用 useTemplateRef 替代多个 ref
const refs = useTemplateRef('item')  // 支持动态
</script>
```

---

## AI 提示词模板

### 🎯 通用提示词前缀

```
你是一名 Vue 3.5+ 专家。请遵循以下规范：
1. 使用响应式 Props 解构（defineProps 直接解构）
2. 使用 useTemplateRef() 获取模板引用
3. 使用 onWatcherCleanup() 处理副作用清理
4. 使用 useId() 生成 SSR 安全 ID
5. 避免 withDefaults，使用 JavaScript 默认值语法
6. 监听 props 时使用 getter 包裹
```

### 📝 组件开发提示词

```
请用 Vue 3.5+ 语法创建一个 [组件描述] 组件：
- 使用 <script setup lang="ts">
- Props 使用响应式解构
- 模板引用使用 useTemplateRef()
- 包含完整的类型定义
- 遵循 Vue 3.5 最佳实践
```

### 🔧 代码审查提示词

```
请审查以下 Vue 代码是否符合 3.5+ 规范：
1. 检查是否使用了老的 withDefaults 模式
2. 检查是否使用了老的 ref() 模板引用
3. 检查 watch 清理是否使用 onWatcherCleanup()
4. 检查是否有可优化的响应式使用
指出所有需要更新的地方并提供修正代码。
```

---

## 快速迁移指南

### 从 3.4 迁移到 3.5+

```diff
<script setup lang="ts">
- const props = withDefaults(
-   defineProps<{
-     count?: number
-     msg?: string
-   }>(),
-   {
-     count: 0,
-     msg: 'hello'
-   }
- )
+ const { count = 0, msg = 'hello' } = defineProps<{
+   count?: number
+   msg?: string
+ }>()

- const inputRef = ref<HTMLInputElement | null>(null)
+ const inputRef = useTemplateRef<HTMLInputElement>('input')

- watch(id, (newId) => {
-   const controller = new AbortController()
-   fetch(`/api/${newId}`)
-   return () => controller.abort()
- })
+ watch(id, (newId) => {
+   const controller = new AbortController()
+   fetch(`/api/${newId}`)
+   onWatcherCleanup(() => controller.abort())
+ })
</script>
```

---

## 参考资源

| 资源                   | 链接                                                                       |
| -------------------- | ------------------------------------------------------------------------ |
| Vue 3.5 官方博客         | https://blog.vuejs.org/posts/vue-3-5                                     |
| Vue 3.5 CHANGELOG    | https://github.com/vuejs/core/blob/main/CHANGELOG.md                     |
| 响应式 Props 解构文档       | https://vuejs.org/guide/components/props.html#reactive-props-destructure |
| useTemplateRef API   | https://vuejs.org/api/computed.html#usetemplateref                       |
| onWatcherCleanup API | https://vuejs.org/api/reactivity-core.html#onwatchercleanup              |
| Vue RFC #502         | https://github.com/vuejs/rfcs/discussions/502                            |

---

## 版本信息

- **本手册适用版本**: Vue 3.5.0+
- **最后更新**: 2026-02-19
- **最新稳定版**: 3.5.28 (2026-02-09)

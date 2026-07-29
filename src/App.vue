<script setup lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const isOnline = ref(navigator.onLine)
const updateFailed = ref(false)

/**
 * 主动接管 Service Worker 更新：发现新部署时安装、接管并刷新当前页面。
 * 这能避免用户长期开着旧版 PWA，误以为 GitHub Pages 没有更新。
 */
const { needRefresh, updateServiceWorker } = useRegisterSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    window.setInterval(() => void registration.update(), 60 * 60 * 1000)
  },
})

async function applyUpdate(): Promise<void> {
  updateFailed.value = false
  try {
    await updateServiceWorker(true)
  } catch {
    updateFailed.value = true
  }
}

watch(needRefresh, (available) => {
  if (available) void applyUpdate()
})

function syncNetworkStatus(): void {
  isOnline.value = navigator.onLine
}

onMounted(() => {
  window.addEventListener('online', syncNetworkStatus)
  window.addEventListener('offline', syncNetworkStatus)
})

onBeforeUnmount(() => {
  window.removeEventListener('online', syncNetworkStatus)
  window.removeEventListener('offline', syncNetworkStatus)
})
</script>

<template>
  <div class="app-shell">
    <aside v-if="needRefresh" class="update-banner" role="status">
      <span>{{ updateFailed ? '自动更新失败，请手动重试。' : '发现新版本，正在更新…' }}</span>
      <button v-if="updateFailed" type="button" @click="applyUpdate">立即更新</button>
    </aside>

    <header class="site-header">
      <RouterLink class="brand" to="/" aria-label="返回 408 MindMap 首页">
        <span class="brand-mark">408</span>
        <span>
          <strong>MindMap</strong>
          <small>知识图谱学习系统</small>
        </span>
      </RouterLink>

      <nav class="site-nav" aria-label="主要导航">
        <RouterLink to="/">知识图谱</RouterLink>
        <RouterLink to="/papers">考研真题与解析</RouterLink>
      </nav>

      <div class="network-pill" :class="{ offline: !isOnline }">
        <span class="network-dot" />
        {{ isOnline ? '在线 · 内容已支持离线' : '离线模式' }}
      </div>
    </header>

    <RouterView />

    <footer class="site-footer">
      <span>408 MindMap PWA</span>
      <span>355 个结构化知识节点 · 真题中心 · 本地优先</span>
    </footer>
  </div>
</template>

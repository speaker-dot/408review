<script setup lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useLearningStore } from '@/stores/learning'
const learning = useLearningStore()
let updateInterval: number | undefined

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
    updateInterval = window.setInterval(() => void registration.update().catch(() => undefined), 60 * 60 * 1000)
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

// 不再自动刷新：整卷考试或未保存笔记不能被新部署打断。

function syncNetworkStatus(): void {
  isOnline.value = navigator.onLine
}

onMounted(() => {
  void learning.initialize().catch(() => undefined)
  window.addEventListener('online', syncNetworkStatus)
  window.addEventListener('offline', syncNetworkStatus)
})

onBeforeUnmount(() => {
  if (updateInterval) window.clearInterval(updateInterval)
  window.removeEventListener('online', syncNetworkStatus)
  window.removeEventListener('offline', syncNetworkStatus)
})
</script>

<template>
  <div class="app-shell">
    <aside v-if="needRefresh" class="update-banner" role="status">
      <span>{{ updateFailed ? '更新失败，请重试。' : '新版本已就绪，完成作答或保存笔记后可更新。' }}</span>
      <button type="button" @click="applyUpdate">更新并刷新</button>
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
        <RouterLink to="/syllabus">408 大纲</RouterLink>
        <RouterLink to="/papers">考研真题与解析</RouterLink>
        <RouterLink to="/study">我的复习</RouterLink>
        <RouterLink to="/demos">推演实验</RouterLink>
        <RouterLink to="/tools">离线与备份</RouterLink>
      </nav>

      <div class="network-pill" :class="{ offline: !isOnline }">
        <span class="network-dot" />
        {{ isOnline ? '网络已连接' : '网络已断开 · 读取本地' }}
      </div>
    </header>

    <RouterView />

    <footer class="site-footer">
      <span>408 MindMap PWA</span>
      <span>355 个结构化知识节点 · 真题中心 · 本地优先</span>
    </footer>
  </div>
</template>

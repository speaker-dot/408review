<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const isOnline = ref(navigator.onLine)

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
    <header class="site-header">
      <RouterLink class="brand" to="/" aria-label="返回 408 MindMap 首页">
        <span class="brand-mark">408</span>
        <span>
          <strong>MindMap</strong>
          <small>知识图谱学习系统</small>
        </span>
      </RouterLink>

      <div class="network-pill" :class="{ offline: !isOnline }">
        <span class="network-dot" />
        {{ isOnline ? '在线 · 内容已支持离线' : '离线模式' }}
      </div>
    </header>

    <RouterView />

    <footer class="site-footer">
      <span>408 MindMap PWA</span>
      <span>355 个结构化知识节点 · 本地优先</span>
    </footer>
  </div>
</template>

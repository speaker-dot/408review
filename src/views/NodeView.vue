<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import KnowledgeCard from '@/components/KnowledgeCard.vue'
import { getNode, saveNode } from '@/db/db'
import type { KnowledgeCategory, KnowledgeNode } from '@/types'

const route = useRoute()

const node = ref<KnowledgeNode | null>(null)
const loading = ref(false)
const errorMessage = ref('')

/** 路由参数理论上可能是数组，这里统一归一化成字符串。 */
const nodeId = computed(() => {
  const id = route.params.id
  return Array.isArray(id) ? (id[0] ?? '') : (id ?? '')
})

const categoryFolders: Record<KnowledgeCategory, string> = {
  DS: 'ds',
  OS: 'os',
  CS: 'cs',
  NET: 'net',
}

/**
 * `?url` 让 Vite 为每个 JSON 生成可 fetch 的构建资源 URL；
 * 这样生产环境不会依赖只在开发服务器存在的 `/src` 文件系统路径。
 */
const contentUrls = import.meta.glob<string>(
  '../content/{ds,os,cs,net}/*.json',
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
)

function getCategory(id: string): KnowledgeCategory | undefined {
  return (Object.keys(categoryFolders) as KnowledgeCategory[]).find((category) =>
    id.startsWith(category),
  )
}

function getContentUrl(id: string, category: KnowledgeCategory): string {
  const folder = categoryFolders[category]
  const modulePath = `../content/${folder}/${id}.json`

  // 在生产构建中使用 Vite 输出的带哈希 URL；开发阶段保留固定路径兜底。
  return contentUrls[modulePath] ?? `/src/content/${folder}/${id}.json`
}

async function fetchNode(
  id: string,
  signal: AbortSignal,
): Promise<KnowledgeNode> {
  const category = getCategory(id)
  if (!category) throw new Error('无法识别该知识点所属科目。')

  const response = await fetch(getContentUrl(id, category), { signal })
  if (!response.ok) {
    throw new Error(`知识点文件加载失败（HTTP ${response.status}）。`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('json')) {
    throw new Error('知识点文件不存在或返回格式不正确。')
  }

  const data = (await response.json()) as KnowledgeNode
  if (data.id !== id || data.category !== category) {
    throw new Error('知识点文件内容与当前路由不匹配。')
  }

  return data
}

watch(
  nodeId,
  async (id, _previousId, onCleanup) => {
    const controller = new AbortController()
    onCleanup(() => controller.abort())

    node.value = null
    errorMessage.value = ''

    // 仅接受约定格式的 ID，避免把任意路由文本拼接为文件路径。
    if (!/^(DS|OS|CS|NET)(?:-\d{2}){1,2}(?:-\d{3})?$/.test(id)) {
      errorMessage.value = '知识点 ID 格式不正确。'
      return
    }

    loading.value = true

    try {
      // 先读取离线副本作为网络失败时的兜底，但在线时不能直接返回：
      // 否则部署新内容后，已访问过的节点会永远停留在旧版 Dexie 数据中。
      const cachedNode = await getNode(id)
      if (controller.signal.aborted) return

      if (!navigator.onLine && cachedNode) {
        node.value = cachedNode
        return
      }

      try {
        // 带哈希的 JSON URL 会随内容变化，在线访问可可靠获得当前版本；
        // Service Worker 同时保留该响应，供后续完全离线使用。
        const remoteNode = await fetchNode(id, controller.signal)
        await saveNode(remoteNode)
        if (!controller.signal.aborted) node.value = remoteNode
      } catch (remoteError) {
        // 网络状态判断并非绝对可靠；请求失败时只要存在本地副本仍可阅读。
        if (cachedNode) {
          node.value = cachedNode
          return
        }
        throw remoteError
      }
    } catch (error) {
      if (controller.signal.aborted) return
      errorMessage.value =
        error instanceof Error ? error.message : '知识点加载失败，请稍后重试。'
    } finally {
      if (!controller.signal.aborted) loading.value = false
    }
  },
  { immediate: true },
)
</script>

<template>
  <main class="node-view">
    <p v-if="loading" class="status" role="status">正在加载知识点…</p>

    <div v-else-if="errorMessage" class="error" role="alert">
      <h1>暂时无法显示该知识点</h1>
      <p>{{ errorMessage }}</p>
      <RouterLink to="/">返回知识图谱</RouterLink>
    </div>

    <KnowledgeCard v-else-if="node" :node="node" />
  </main>
</template>

<style scoped>
.node-view {
  width: min(100% - 2rem, 64rem);
  margin: 0 auto;
  padding: 2rem 0 4rem;
}

.status,
.error {
  padding: 2rem;
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  background: #ffffff;
  color: #334155;
}

.error h1 {
  margin-top: 0;
  color: #0f172a;
}

.error a {
  color: #2563eb;
  font-weight: 600;
}
</style>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import MindMap from '@/components/MindMap.vue'
import rawIndex from '@/content/index.json'
import { useAppStore } from '@/stores/app'
import type {
  KnowledgeCategory,
  MindMapIndex,
  MindMapNode,
} from '@/types'

const router = useRouter()
const appStore = useAppStore()
const { selectedCategory } = storeToRefs(appStore)
const searchQuery = ref('')
const index = rawIndex as MindMapIndex

const subjects: Array<{
  id: KnowledgeCategory
  name: string
  english: string
  short: string
  description: string
}> = [
  {
    id: 'DS',
    name: '数据结构',
    english: 'Data Structures',
    short: 'DS',
    description: '线性表、树、图、查找与排序',
  },
  {
    id: 'CS',
    name: '计算机组成原理',
    english: 'Computer Organization',
    short: 'CO',
    description: '数据表示、存储、CPU 与 I/O',
  },
  {
    id: 'OS',
    name: '操作系统',
    english: 'Operating Systems',
    short: 'OS',
    description: '进程、内存、文件与设备管理',
  },
  {
    id: 'NET',
    name: '计算机网络',
    english: 'Computer Networks',
    short: 'CN',
    description: '分层模型、协议、路由与传输',
  },
]

const nonRootNodes = computed(() =>
  index.nodes.filter((node) => node.parentId),
)

function subjectCount(category: KnowledgeCategory): number {
  return nonRootNodes.value.filter((node) => node.id.startsWith(`${category}-`))
    .length
}

const activeSubject = computed(
  () => subjects.find((subject) => subject.id === selectedCategory.value)!,
)

const subjectNodes = computed(() =>
  index.nodes.filter(
    (node) =>
      node.id === selectedCategory.value ||
      node.id.startsWith(`${selectedCategory.value}-`),
  ),
)

const subjectNodeIds = computed(
  () => new Set(subjectNodes.value.map((node) => node.id)),
)

const subjectLinks = computed(() =>
  index.links.filter(
    (link) =>
      subjectNodeIds.value.has(link.source) && subjectNodeIds.value.has(link.target),
  ),
)

const searchResults = computed<MindMapNode[]>(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  if (!keyword) return []

  return nonRootNodes.value
    .filter(
      (node) =>
        node.name.toLowerCase().includes(keyword) ||
        node.id.toLowerCase().includes(keyword),
    )
    .slice(0, 24)
})

function categoryOf(node: MindMapNode): KnowledgeCategory {
  return subjects.find((subject) => node.id.startsWith(subject.id))!.id
}

function openNode(nodeId: string): void {
  if (!nodeId.includes('-')) {
    appStore.selectCategory(nodeId as KnowledgeCategory)
    return
  }
  void router.push(`/node/${nodeId}`)
}
</script>

<template>
  <main class="home-view">
    <section class="home-hero">
      <div class="hero-copy">
        <span class="eyebrow">408 MINDMAP · OFFLINE FIRST</span>
        <h1>把零散考点，<br /><em>连成一张图。</em></h1>
        <p>
          沿着知识关系理解四门专业课。点击节点进入考点详解，完成习题，并将内容保存在本地。
        </p>
      </div>

      <div class="hero-stat" aria-label="知识库统计">
        <strong>355</strong>
        <span>结构化知识节点</span>
        <div>
          <small>4 门科目</small>
          <small>按考法精选，不凑题数</small>
        </div>
      </div>
    </section>

    <section class="subject-grid" aria-label="选择科目">
      <button
        v-for="subject in subjects"
        :key="subject.id"
        type="button"
        class="subject-card"
        :class="[`subject-${subject.id.toLowerCase()}`, { active: selectedCategory === subject.id }]"
        @click="appStore.selectCategory(subject.id)"
      >
        <span class="subject-monogram">{{ subject.short }}</span>
        <span class="subject-copy">
          <small>{{ subject.english }}</small>
          <strong>{{ subject.name }}</strong>
          <span>{{ subject.description }}</span>
        </span>
        <span class="subject-count">{{ subjectCount(subject.id) }} 节点</span>
      </button>
    </section>

    <section class="explorer-section">
      <div class="explorer-heading">
        <div>
          <span class="section-kicker">KNOWLEDGE EXPLORER</span>
          <h2>{{ activeSubject.name }}知识图谱</h2>
          <p>沿层级从左向右浏览，滚动查看完整图谱，点击节点进入详情。</p>
        </div>

        <label class="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            v-model="searchQuery"
            type="search"
            placeholder="搜索名称或节点 ID"
            aria-label="搜索知识节点"
          />
          <kbd>⌘ K</kbd>
        </label>
      </div>

      <div v-if="searchQuery.trim()" class="search-results">
        <div class="result-summary">
          找到 {{ searchResults.length }} 个匹配节点
        </div>
        <button
          v-for="node in searchResults"
          :key="node.id"
          type="button"
          class="search-result"
          @click="openNode(node.id)"
        >
          <span class="result-category" :data-category="categoryOf(node)">
            {{ categoryOf(node) }}
          </span>
          <span>
            <strong>{{ node.name }}</strong>
            <small>{{ node.id }}</small>
          </span>
          <span class="result-arrow">→</span>
        </button>

        <p v-if="!searchResults.length" class="empty-search">
          没有找到匹配节点，试试“KMP”“Cache”或“TCP”。
        </p>
      </div>

      <MindMap
        v-else
        :nodes="subjectNodes"
        :links="subjectLinks"
        @node-click="openNode"
      />
    </section>
  </main>
</template>

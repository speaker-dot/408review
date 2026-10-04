<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import MindMap from '@/components/MindMap.vue'
import rawIndex from '@/content/index.json'
import { useAppStore } from '@/stores/app'
import { useLearningStore } from '@/stores/learning'
import { demoIndex } from '@/learning/demoIndex'
import type {
  KnowledgeCategory,
  MindMapIndex,
  MindMapNode,
} from '@/types'

const router = useRouter()
const appStore = useAppStore()
const learning = useLearningStore()
const { selectedCategory } = storeToRefs(appStore)
const searchQuery = ref('')
const index = rawIndex as MindMapIndex
const lastRead = computed(() => [...learning.progress].filter(item => item.visits > 0).sort((a, b) => b.lastStudiedAt - a.lastStudiedAt)[0])
const lastReadName = computed(() => index.nodes.find(node => node.id === lastRead.value?.nodeId)?.name)

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
        <span class="eyebrow">YOUR QUIET PLACE TO UNDERSTAND</span>
        <h1>把知识连起来，<br /><em>把理解留下来。</em></h1>
        <p>
          从一张图出发，把每个考点读懂、推演、练习、回忆。四门专业课，不再是互不相干的几本书。
        </p>
      </div>

      <div class="hero-stat" aria-label="知识库统计">
        <span class="home-note-label">一间随身的复习室</span>
        <strong>355<span>个考点</span></strong>
        <p>读懂原理，也记得住它。</p>
        <div><small>4 门科目</small><small>{{ demoIndex.length }} 个推演</small><small>本地优先</small></div>
        <RouterLink v-if="lastRead" class="home-continue" :to="`/node/${lastRead.nodeId}`"><span>接着上次读</span><strong>{{ lastReadName || lastRead.nodeId }}</strong><i>↗</i></RouterLink>
        <RouterLink v-else class="home-continue" to="/syllabus"><span>还不知道从哪里开始？</span><strong>先看 408 大纲与复习路线</strong><i>↗</i></RouterLink>
      </div>
    </section>

    <section class="home-shortcuts" aria-label="复习入口">
      <RouterLink to="/study"><span class="shortcut-symbol">↺</span><div><small>RECALL & REVIEW</small><strong>把学过的再想一遍</strong><p>今日复习、错题与自己的笔记</p></div><span>→</span></RouterLink>
      <RouterLink to="/demos"><span class="shortcut-symbol">↗</span><div><small>THINK IN STEPS</small><strong>亲手走一次过程</strong><p>{{ demoIndex.length }} 个四科实验，先预测再验证</p></div><span>→</span></RouterLink>
      <RouterLink to="/syllabus"><span class="shortcut-symbol">≡</span><div><small>THE EXAM SCOPE</small><strong>对照考纲，知道学什么</strong><p>章纲、学习目标与知识点导航</p></div><span>→</span></RouterLink>
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

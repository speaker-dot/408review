<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useLearningStore } from '@/stores/learning'
import { filterSyllabus, itemProgress, syllabus, syllabusNodeNames } from '@/learning/syllabus'
import { demoIndex, type DemoMetadata } from '@/learning/demoIndex'
import type { SyllabusItem, SyllabusProgressState } from '@/learning/syllabus'
import type { KnowledgeCategory } from '@/types'

const store = useLearningStore()
const subject = ref<KnowledgeCategory | 'all'>('all'), search = ref(''), pendingOnly = ref(false)
const recordsLoaded = ref(false), expanded = ref(new Set<string>())
const progress = computed(() => new Map(store.progress.map(item => [item.nodeId, item])))
const trustworthyProgress = computed(() => recordsLoaded.value && !store.error)
const visible = computed(() => filterSyllabus(syllabus.subjects, {
  subject: subject.value, search: search.value, pendingOnly: pendingOnly.value && trustworthyProgress.value,
}, progress.value))
const allItems = syllabus.subjects.flatMap(s => s.chapters.flatMap(c => c.items))
// 只读轻量实验目录，不加载计算引擎。既有节点与旧手工推演关联共同匹配，
// 以实验 ID 去重：同一 Cache 实验即使同时命中映射、替换两个节点也只显示一次。
const itemDemos = new Map<string, DemoMetadata[]>(allItems.map(item => {
  const nodeIds = new Set([...item.nodeIds, ...item.demoNodeIds])
  const matches = new Map(demoIndex.filter(demo => demo.nodeIds.some(id => nodeIds.has(id))).map(demo => [demo.id, demo]))
  return [item.id, [...matches.values()]]
}))
const visibleCount = computed(() => visible.value.reduce((sum, s) => sum + s.chapters.reduce((n, c) => n + c.items.length, 0), 0))
const chapterCount = syllabus.subjects.reduce((sum, s) => sum + s.chapters.length, 0)
const linkedCount = new Set(allItems.flatMap(item => item.nodeIds)).size
const gapCount = allItems.filter(item => item.missingTopics.length).length
const completedCount = computed(() => trustworthyProgress.value ? allItems.filter(item => itemProgress(item, progress.value).complete).length : 0)
const sources = new Map(syllabus.sources.map(source => [source.id, source]))
const stateNames: Record<SyllabusProgressState, string> = {
  pending: '待学习', learning: '学习中', review: '待复习', mastered: '关联节点已掌握',
  unmapped: '暂无独立节点', 'needs-supplement': '关联节点已掌握，仍需补充',
}
function itemState(item: SyllabusItem): string {
  if (!trustworthyProgress.value) return store.error ? '学习记录不可用' : '正在读取学习记录'
  return stateNames[itemProgress(item, progress.value).state]
}
function nodeState(id: string): string {
  if (!trustworthyProgress.value) return ''
  const item = progress.value.get(id)
  if (!item || (!item.visits && item.status === 'learning')) return '未开始'
  return { learning: '学习中', review: '待复习', mastered: '已掌握' }[item.status]
}
function expandVisible(open: boolean): void {
  const next = new Set(expanded.value)
  for (const s of visible.value) for (const c of s.chapters) open ? next.add(c.id) : next.delete(c.id)
  expanded.value = next
}
function rememberExpansion(id: string, event: Event): void {
  const next = new Set(expanded.value)
  if ((event.currentTarget as HTMLDetailsElement).open) next.add(id)
  else next.delete(id)
  expanded.value = next
}
// 搜索命中后直接展示学习任务，不让结果藏在折叠章节里。
watch([subject, search], () => { if (search.value.trim()) expandVisible(true) })
async function reloadProgress(): Promise<void> {
  try { await store.reload(); recordsLoaded.value = true } catch { /* store.error 是同一套学习记录的错误提示 */ }
}
onMounted(async () => {
  try { await store.initialize(); recordsLoaded.value = true } catch { /* 可继续阅读章纲与原文入口，不把读取失败当作未学习 */ }
})
</script>

<template>
  <main class="learning-page syllabus-page">
    <header class="learning-hero">
      <span class="section-kicker">EXAM SCOPE · STUDY ROADMAP</span>
      <h1>{{ syllabus.title }}</h1>
      <p>先看本章要解决什么问题，再进入知识点、习题和推演。这里整理的是复习路径，不把“打开过”当作“学会了”。</p>
    </header>

    <section class="content-card learning-panel syllabus-version" aria-labelledby="syllabus-version-title">
      <h2 id="syllabus-version-title">版本与原文，先分清楚</h2>
      <p>{{ syllabus.metadata.versionNote }}</p>
      <p>{{ syllabus.metadata.editorialNote }}</p>
      <p class="muted">核验日期：{{ syllabus.metadata.verifiedAt }} · 章纲参照：{{ syllabus.metadata.scopeYear }} 年公开附件</p>
      <div class="learning-toolbar">
        <a class="secondary-button" :href="sources.get('hep-2027')?.url" target="_blank" rel="noopener noreferrer">2027 官方出版书目 ↗</a>
        <a class="secondary-button" :href="sources.get('uwh-2025')?.url" target="_blank" rel="noopener noreferrer">2025 高校原文入口 ↗</a>
        <a class="secondary-button" :href="sources.get('uwh-2025')?.documentUrl" target="_blank" rel="noopener noreferrer">阅读外部大纲 PDF ↗</a>
      </div>
    </section>

    <section class="content-card learning-panel" aria-labelledby="syllabus-exam-title">
      <h2 id="syllabus-exam-title">408 常见考试结构</h2>
      <div class="learning-stats">
        <div><strong>{{ syllabus.exam.totalScore }} 分</strong><span>试卷满分</span></div>
        <div><strong>{{ syllabus.exam.durationMinutes }} 分钟</strong><span>{{ syllabus.exam.method }}</span></div>
        <div><strong>{{ syllabus.exam.choiceScore }} 分</strong><span>单选 {{ syllabus.exam.choiceQuestions }} 题，每题 2 分</span></div>
        <div><strong>{{ syllabus.exam.analysisScore }} 分</strong><span>综合应用，不固定推断未来各题分值</span></div>
      </div>
      <div class="learning-toolbar"><span v-for="s in syllabus.subjects" :key="s.id">{{ s.name }} {{ syllabus.exam.subjectMarks[s.id] }} 分</span></div>
      <p class="muted">{{ syllabus.exam.note }}</p>
      <p class="muted">依据：<template v-for="id in syllabus.exam.sourceIds" :key="id"><a :href="sources.get(id)?.url" target="_blank" rel="noopener noreferrer">{{ sources.get(id)?.title }} ↗</a> · </template></p>
    </section>

    <section class="content-card learning-panel syllabus-controls" aria-labelledby="syllabus-nav-title">
      <h2 id="syllabus-nav-title">按学习任务查找</h2>
      <div class="learning-toolbar">
        <label>科目 <select v-model="subject" aria-label="大纲科目筛选"><option value="all">全部科目</option><option v-for="s in syllabus.subjects" :key="s.id" :value="s.id">{{ s.name }}</option></select></label>
        <label>搜索 <input v-model="search" type="search" aria-label="搜索大纲学习项目" placeholder="KMP、地址、信号量或节点 ID" /></label>
        <label><input v-model="pendingOnly" type="checkbox" aria-label="只看待学习" :disabled="!trustworthyProgress" /> 只看待学习 / 复习</label>
      </div>
      <p class="muted">“待学习”包含尚未掌握的关联节点、待复习和待补充项目；全部关联节点标记掌握且没有已知缺口，才从清单移出。只读取现有学习记录，不建立第二套打卡。</p>
      <p v-if="store.error" class="error-text" role="alert">{{ store.error }} <button class="secondary-button" @click="reloadProgress">重试读取学习记录</button></p>
      <p v-else-if="!recordsLoaded" class="muted" role="status">正在读取本机学习记录，章纲仍可先阅读…</p>
      <p v-else class="muted">关联项目完成 {{ completedCount }} / {{ allItems.length }}；“完成”只代表本站映射进度，不保证完整达到大纲要求。</p>
      <div class="learning-toolbar"><button class="secondary-button" @click="expandVisible(true)">展开全部章节</button><button class="secondary-button" @click="expandVisible(false)">收起全部章节</button><span role="status">显示 {{ visibleCount }} 项 · {{ chapterCount }} 章 · {{ linkedCount }} 个相关节点 · {{ gapCount }} 项有待补充内容</span></div>
      <p class="muted">{{ syllabus.metadata.coverageNote }}</p>
    </section>

    <p v-if="!visible.length" class="content-card learning-panel" role="status">没有符合条件的学习项目。可以换个关键词，或取消科目/待学习筛选。</p>
    <section v-for="s in visible" :key="s.id" class="syllabus-subject" :data-subject="s.id">
      <header class="learning-hero"><h2>{{ s.name }} <small>{{ syllabus.exam.subjectMarks[s.id] }} 分</small></h2><p>{{ s.aim }}</p></header>
      <details v-for="c in s.chapters" :key="c.id" class="content-card learning-panel syllabus-chapter" :open="expanded.has(c.id)" @toggle="rememberExpansion(c.id, $event)">
        <summary><strong>{{ c.title }}</strong> · {{ c.items.length }} 项学习任务</summary>
        <p class="muted">{{ c.locator }}</p>
        <p class="muted">范围核对：<template v-for="id in c.sourceIds" :key="id"><a :href="sources.get(id)?.url" target="_blank" rel="noopener noreferrer">{{ sources.get(id)?.publisher }} ↗</a> · </template></p>
        <article v-for="item in c.items" :key="item.id" class="syllabus-item" :data-item="item.id">
          <h3>{{ item.title }}</h3>
          <p class="muted syllabus-item-state">{{ itemState(item) }}<template v-if="trustworthyProgress && item.nodeIds.length"> · 已掌握 {{ itemProgress(item, progress).mastered }}/{{ itemProgress(item, progress).total }} 个关联节点</template></p>
          <h4>学会后，你应该能做什么</h4>
          <ul><li v-for="target in item.targets" :key="target">{{ target }}</li></ul>
          <div v-if="item.nodeIds.length" class="syllabus-node-links">
            <RouterLink v-for="id in item.nodeIds" :key="id" class="study-row" :to="`/node/${id}`"><span>{{ syllabusNodeNames.get(id) ?? id }} <small>{{ id }}</small></span><span>{{ nodeState(id) }} →</span></RouterLink>
          </div>
          <p v-else class="muted">暂无独立知识点页面，请先对照原大纲和教材补充。本项不会自动标记为完成。</p>
          <div v-if="itemDemos.get(item.id)?.length" class="learning-toolbar syllabus-demo-links"><RouterLink v-for="demo in itemDemos.get(item.id)" :key="demo.id" class="secondary-button" :to="{ path: '/demos', query: { demo: demo.id } }">推演：{{ demo.title }} →</RouterLink></div>
          <aside v-if="item.missingTopics.length" class="backup-summary syllabus-gap"><strong>暂无独立节点 / 覆盖提示</strong><ul><li v-for="gap in item.missingTopics" :key="gap">{{ gap }}</li></ul></aside>
        </article>
      </details>
    </section>

    <section class="content-card learning-panel" aria-labelledby="syllabus-extension-title">
      <h2 id="syllabus-extension-title">扩展内容，不等于全部必考</h2>
      <p class="muted">以下是已核验章纲未单独列出的背景或延伸主题，不是永久的“不考清单”。新年度要求仍要看原大纲。</p>
      <article v-for="item in syllabus.extensions" :key="item.id" class="syllabus-item"><h3>{{ item.title }}</h3><p>{{ item.note }}</p><div class="learning-toolbar"><RouterLink v-for="id in item.nodeIds" :key="id" :to="`/node/${id}`">{{ syllabusNodeNames.get(id) }} →</RouterLink></div></article>
    </section>

    <section class="content-card learning-panel" aria-labelledby="syllabus-source-title">
      <h2 id="syllabus-source-title">原文与来源核验</h2>
      <p>{{ syllabus.metadata.rightsNote }}</p>
      <p>{{ syllabus.metadata.offlineNote }}</p>
      <article v-for="source in syllabus.sources" :key="source.id" class="syllabus-source"><h3><a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }} ↗</a></h3><p class="muted">{{ source.publisher }} · {{ source.publishedAt ? `发布日期：${source.publishedAt}` : source.publicationNote }} · 核验：{{ source.verifiedAt }}</p><p>{{ source.note }}</p></article>
      <RouterLink to="/tools" class="secondary-button">查看离线准备与学习备份 →</RouterLink>
    </section>
  </main>
</template>

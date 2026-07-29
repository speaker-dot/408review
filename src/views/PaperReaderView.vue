<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import PdfReader from '@/components/PdfReader.vue'
import rawMindMapIndex from '@/content/index.json'
import rawPaperIndex from '@/content/papers/index.json'
import { getPaperProgress, savePaperProgress } from '@/db/db'
import {
  downloadPaperForOffline,
  isPaperAvailableOffline,
  paperAssetUrl,
  removePaperOffline,
} from '@/services/paperCache'
import type {
  ExamPaperIndex,
  KnowledgeCategory,
  MindMapIndex,
  PaperQuestionLink,
} from '@/types'

const props = defineProps<{
  year: string
}>()

type ReaderMode = 'paper' | 'split' | 'solution'

const paperIndex = rawPaperIndex as ExamPaperIndex
const mindMapIndex = rawMindMapIndex as MindMapIndex
const paper = computed(() =>
  paperIndex.papers.find((item) => item.year === Number(props.year)),
)
const nodeNames = new Map(
  mindMapIndex.nodes.map((node) => [node.id, node.name]),
)

const mode = ref<ReaderMode>('paper')
const paperPage = ref(1)
const solutionPage = ref(1)
const selectedSubject = ref<KnowledgeCategory | 'ALL'>('ALL')
const progressReady = ref(false)
const completed = ref(false)
const offline = ref(false)
const downloading = ref(false)
const downloadProgress = ref('')
const cacheError = ref('')

const subjectLabels: Record<KnowledgeCategory, string> = {
  DS: '数据结构',
  CS: '计算机组成原理',
  OS: '操作系统',
  NET: '计算机网络',
}

const filteredQuestions = computed(() => {
  const links = paper.value?.questionLinks ?? []
  if (selectedSubject.value === 'ALL') return links
  return links.filter((item) => item.subject === selectedSubject.value)
})

const completionPercent = computed(() => {
  if (!paper.value) return 0
  return Math.round((paperPage.value / paper.value.paper.pages) * 100)
})

function nodeName(id: string): string {
  return nodeNames.get(id) ?? id
}

function jumpToQuestion(question: PaperQuestionLink): void {
  mode.value = 'paper'
  paperPage.value = question.paperPage
  window.setTimeout(() => {
    document
      .querySelector('.paper-reader-area')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 50)
}

async function persistProgress(): Promise<void> {
  if (!progressReady.value || !paper.value) return

  await savePaperProgress({
    year: paper.value.year,
    paperPage: paperPage.value,
    solutionPage: solutionPage.value,
    completed: completed.value,
    updatedAt: Date.now(),
  })
}

async function toggleOffline(): Promise<void> {
  if (!paper.value) return
  downloading.value = true
  cacheError.value = ''
  downloadProgress.value = ''

  try {
    if (offline.value) {
      await removePaperOffline(paper.value)
    } else {
      await downloadPaperForOffline(paper.value, (done, total) => {
        downloadProgress.value = `${done}/${total}`
      })
    }
    offline.value = await isPaperAvailableOffline(paper.value)
  } catch (error) {
    cacheError.value =
      error instanceof Error ? error.message : '离线资料操作失败'
  } finally {
    downloading.value = false
  }
}

async function loadPaperState(): Promise<void> {
  // Vue Router 在 `/papers/:year` 之间切换时会复用当前组件。
  // 先关闭持久化并重置 UI，避免把上一年份的页码写入新年份。
  progressReady.value = false
  mode.value = 'paper'
  paperPage.value = 1
  solutionPage.value = 1
  selectedSubject.value = 'ALL'
  completed.value = false
  offline.value = false
  downloading.value = false
  downloadProgress.value = ''
  cacheError.value = ''

  const currentPaper = paper.value
  if (!currentPaper) return

  const targetYear = currentPaper.year
  const saved = await getPaperProgress(targetYear)
  if (paper.value?.year !== targetYear) return

  if (saved) {
    paperPage.value = saved.paperPage
    solutionPage.value = saved.solutionPage
    completed.value = saved.completed
  }

  const cached = await isPaperAvailableOffline(currentPaper)
  if (paper.value?.year !== targetYear) return
  offline.value = cached
  progressReady.value = true
}

watch([paperPage, solutionPage, completed], () => void persistProgress())
watch(() => paper.value?.year, () => void loadPaperState(), { immediate: true })
</script>

<template>
  <main v-if="paper" class="reader-page">
    <RouterLink class="back-link" to="/papers">← 返回真题中心</RouterLink>

    <section class="reader-hero">
      <div>
        <span class="reader-eyebrow">
          {{ paper.year }} · NATIONAL EXAM PAPER
        </span>
        <h1>{{ paper.year }} 年 408<br /><em>真题阅读室</em></h1>
        <p>
          默认只显示原卷。需要核对时可切换到解析或左右对照模式，
          当前页码与完成状态会自动保存在本机。
        </p>
      </div>

      <aside class="progress-card">
        <div>
          <span>原卷进度</span>
          <strong>{{ completionPercent }}%</strong>
        </div>
        <div class="progress-track">
          <i :style="{ width: `${completionPercent}%` }" />
        </div>
        <button
          type="button"
          :class="{ active: completed }"
          @click="completed = !completed"
        >
          {{ completed ? '✓ 已完成本套真题' : '标记为已完成' }}
        </button>
      </aside>
    </section>

    <section class="reader-command">
      <div class="mode-switch" aria-label="阅读模式">
        <button
          type="button"
          :class="{ active: mode === 'paper' }"
          @click="mode = 'paper'"
        >
          只看原卷
        </button>
        <button
          type="button"
          :class="{ active: mode === 'split' }"
          @click="mode = 'split'"
        >
          原卷 / 解析对照
        </button>
        <button
          type="button"
          :class="{ active: mode === 'solution' }"
          @click="mode = 'solution'"
        >
          只看解析
        </button>
      </div>

      <div class="offline-command">
        <span :class="{ active: offline }">
          {{ offline ? '当前年份可离线阅读' : '尚未下载离线资料' }}
        </span>
        <button
          type="button"
          :disabled="downloading"
          @click="toggleOffline"
        >
          <template v-if="downloading">
            正在处理 {{ downloadProgress }}
          </template>
          <template v-else>
            {{ offline ? '删除离线副本' : '下载原卷与解析' }}
          </template>
        </button>
      </div>
    </section>

    <p v-if="cacheError" class="cache-error" role="alert">
      {{ cacheError }}
    </p>

    <section class="paper-reader-area">
      <div class="reader-grid" :class="{ split: mode === 'split' }">
        <PdfReader
          v-if="mode !== 'solution'"
          v-model="paperPage"
          :title="`${paper.year} 真题原卷`"
          :src="paperAssetUrl(paper.paper.url)"
        />
        <PdfReader
          v-if="mode !== 'paper'"
          v-model="solutionPage"
          :title="`${paper.year} 参考答案与解析`"
          :src="paperAssetUrl(paper.solution.url)"
        />
      </div>
    </section>

    <section class="question-map">
      <header>
        <div>
          <span class="section-kicker">KNOWLEDGE LINKS</span>
          <h2>题号与知识图谱关联</h2>
          <p>
            当前展示本套试卷的精选映射；点击题号跳到原卷页，点击知识点进入对应讲解。
          </p>
        </div>

        <div class="subject-filter">
          <button
            v-for="item in [
              ['ALL', '全部'],
              ['DS', '数据结构'],
              ['CS', '计组'],
              ['OS', '操作系统'],
              ['NET', '计网'],
            ]"
            :key="item[0]"
            type="button"
            :class="{ active: selectedSubject === item[0] }"
            @click="selectedSubject = item[0] as KnowledgeCategory | 'ALL'"
          >
            {{ item[1] }}
          </button>
        </div>
      </header>

      <div class="question-list">
        <article
          v-for="question in filteredQuestions"
          :key="question.questionNo"
          class="question-row"
        >
          <button
            type="button"
            class="question-number"
            @click="jumpToQuestion(question)"
          >
            Q{{ String(question.questionNo).padStart(2, '0') }}
            <small>原卷 P{{ question.paperPage }}</small>
          </button>

          <div class="question-meta">
            <span :data-subject="question.subject">
              {{ subjectLabels[question.subject] }}
            </span>
            <span>
              {{ question.type === 'analysis' ? '综合应用题' : '单项选择题' }}
            </span>
            <span>难度 {{ question.difficulty }}/5</span>
          </div>

          <div class="linked-nodes">
            <RouterLink
              v-for="nodeId in question.nodeIds"
              :key="nodeId"
              :to="`/node/${nodeId}`"
            >
              <span>{{ nodeId }}</span>
              {{ nodeName(nodeId) }}
            </RouterLink>
          </div>
        </article>
      </div>
    </section>

    <aside class="source-notice">
      <strong>资料说明</strong>
      <p>
        {{ paper.source.paperLabel }}；{{ paper.source.solutionLabel }}。
        {{ paper.source.note }}
      </p>
      <a :href="paper.source.pageUrl" target="_blank" rel="noopener">
        查看来源页面：{{ paper.source.publisher }} ↗
      </a>
    </aside>
  </main>

  <main v-else class="reader-page missing-paper">
    <span>404</span>
    <h1>暂未收录该年份</h1>
    <RouterLink to="/papers">返回真题中心</RouterLink>
  </main>
</template>

<style scoped>
.reader-page {
  width: min(100% - 3rem, 96rem);
  margin: 0 auto;
  padding: 2rem 0 5rem;
}

.back-link {
  display: inline-flex;
  margin-bottom: 2rem;
  color: #647087;
  font-size: 0.78rem;
  font-weight: 700;
  text-decoration: none;
}

.reader-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 20rem;
  gap: 4rem;
  align-items: end;
  padding: 2.5rem 0 3rem;
}

.reader-eyebrow {
  color: #e7562c;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.17em;
}

.reader-hero h1 {
  margin: 1rem 0 1.2rem;
  color: #111827;
  font-family: Georgia, "Songti SC", serif;
  font-size: clamp(3rem, 6.5vw, 5.5rem);
  font-weight: 500;
  letter-spacing: -0.07em;
  line-height: 0.98;
}

.reader-hero h1 em {
  color: #3157d5;
  font-style: normal;
}

.reader-hero p {
  max-width: 44rem;
  margin: 0;
  color: #606c7f;
  line-height: 1.9;
}

.progress-card {
  padding: 1.3rem;
  border: 1px solid #e0e5ec;
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 1rem 3rem rgba(30, 41, 59, 0.06);
}

.progress-card > div:first-child {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  color: #6d798c;
  font-size: 0.72rem;
}

.progress-card strong {
  color: #172033;
  font-family: Georgia, serif;
  font-size: 2rem;
  font-weight: 500;
}

.progress-track {
  height: 0.45rem;
  margin: 0.8rem 0 1rem;
  overflow: hidden;
  border-radius: 999px;
  background: #e8ecf2;
}

.progress-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #3157d5, #7590e3);
  transition: width 180ms ease;
}

.progress-card button {
  width: 100%;
  padding: 0.65rem;
  border: 1px solid #dfe4eb;
  border-radius: 0.65rem;
  background: #fff;
  color: #5e6b80;
  font-size: 0.72rem;
  font-weight: 750;
  cursor: pointer;
}

.progress-card button.active {
  border-color: #9bd3c2;
  background: #eaf8f3;
  color: #14775f;
}

.reader-command {
  position: sticky;
  z-index: 10;
  top: 5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 0.7rem;
  border: 1px solid rgba(203, 213, 225, 0.86);
  border-radius: 1rem;
  background: rgba(248, 250, 252, 0.94);
  box-shadow: 0 0.8rem 2rem rgba(30, 41, 59, 0.08);
  backdrop-filter: blur(16px);
}

.mode-switch {
  display: flex;
  gap: 0.35rem;
}

.mode-switch button,
.offline-command button {
  padding: 0.62rem 0.8rem;
  border: 1px solid #dfe4eb;
  border-radius: 0.65rem;
  background: #fff;
  color: #526178;
  font-size: 0.72rem;
  font-weight: 750;
  cursor: pointer;
}

.mode-switch button.active {
  border-color: #3157d5;
  background: #3157d5;
  color: #fff;
}

.offline-command {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.offline-command span {
  color: #7b8799;
  font-size: 0.7rem;
}

.offline-command span.active {
  color: #158064;
  font-weight: 700;
}

.offline-command button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.cache-error {
  padding: 0.75rem 1rem;
  border: 1px solid #f0c8bc;
  border-radius: 0.8rem;
  background: #fff3ef;
  color: #a9432d;
}

.reader-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
}

.reader-grid.split {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.question-map {
  margin-top: 4rem;
}

.question-map > header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 2rem;
  margin-bottom: 1.2rem;
}

.question-map h2 {
  margin: 0.7rem 0 0.5rem;
  color: #172033;
  font-family: Georgia, "Songti SC", serif;
  font-size: clamp(2rem, 4vw, 3.5rem);
  font-weight: 500;
  letter-spacing: -0.05em;
}

.question-map p {
  margin: 0;
  color: #727e90;
  font-size: 0.8rem;
}

.subject-filter {
  display: flex;
  gap: 0.35rem;
}

.subject-filter button {
  padding: 0.5rem 0.65rem;
  border: 1px solid #dfe4eb;
  border-radius: 0.6rem;
  background: #fff;
  color: #647187;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
}

.subject-filter button.active {
  border-color: #172033;
  background: #172033;
  color: #fff;
}

.question-list {
  overflow: hidden;
  border: 1px solid #dfe4eb;
  border-radius: 1.2rem;
  background: rgba(255, 255, 255, 0.84);
}

.question-row {
  display: grid;
  grid-template-columns: 6rem 13rem minmax(0, 1fr);
  gap: 1rem;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #e5e9ef;
}

.question-row:last-child {
  border-bottom: 0;
}

.question-number {
  display: grid;
  justify-items: start;
  padding: 0.55rem 0.7rem;
  border: 0;
  border-radius: 0.65rem;
  background: #edf2ff;
  color: #3157d5;
  font-family: Georgia, serif;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
}

.question-number small {
  margin-top: 0.15rem;
  color: #7185bd;
  font-family: inherit;
  font-size: 0.62rem;
  font-weight: 500;
}

.question-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.question-meta span {
  padding: 0.3rem 0.45rem;
  border-radius: 999px;
  background: #f0f3f7;
  color: #6b778a;
  font-size: 0.62rem;
}

.question-meta span:first-child {
  color: #3157d5;
  font-weight: 750;
}

.linked-nodes {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.4rem;
}

.linked-nodes a {
  display: inline-flex;
  gap: 0.45rem;
  padding: 0.5rem 0.65rem;
  border: 1px solid #e1e6ed;
  border-radius: 0.6rem;
  background: #fff;
  color: #3d4b62;
  font-size: 0.68rem;
  text-decoration: none;
}

.linked-nodes a:hover {
  border-color: #9eb1e8;
  color: #2948aa;
}

.linked-nodes a span {
  color: #8792a3;
  font-family: ui-monospace, monospace;
}

.source-notice {
  margin-top: 1.2rem;
  padding: 1.2rem;
  border: 1px solid #e0e5ec;
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.65);
}

.source-notice strong {
  color: #27334a;
}

.source-notice p {
  margin: 0.5rem 0;
  color: #6b778a;
  font-size: 0.75rem;
  line-height: 1.75;
}

.source-notice a {
  color: #3157d5;
  font-size: 0.72rem;
  font-weight: 700;
}

.missing-paper {
  display: grid;
  min-height: 70vh;
  place-content: center;
  justify-items: center;
}

.missing-paper > span {
  color: #d8dee8;
  font-family: Georgia, serif;
  font-size: 6rem;
}

.missing-paper h1 {
  color: #28364c;
}

.missing-paper a {
  color: #3157d5;
}

@media (max-width: 980px) {
  .reader-grid.split {
    grid-template-columns: 1fr;
  }

  .question-row {
    grid-template-columns: 5rem minmax(0, 1fr);
  }

  .linked-nodes {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }
}

@media (max-width: 800px) {
  .reader-page {
    width: min(100% - 1.25rem, 96rem);
  }

  .reader-hero {
    grid-template-columns: 1fr;
    gap: 2rem;
  }

  .reader-command,
  .question-map > header {
    align-items: stretch;
    flex-direction: column;
  }

  .mode-switch,
  .subject-filter {
    overflow-x: auto;
  }

  .offline-command {
    justify-content: space-between;
  }
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import rawPaperIndex from '@/content/papers/index.json'
import {
  downloadPaperForOffline,
  isPaperAvailableOffline,
  removePaperOffline,
} from '@/services/paperCache'
import type { ExamPaper, ExamPaperIndex } from '@/types'

const paperIndex = rawPaperIndex as ExamPaperIndex
const papers = [...paperIndex.papers].sort((a, b) => b.year - a.year)
const offlineYears = ref(new Set<number>())
const activeDownload = ref<number>()
const downloadProgress = ref('')
const errorMessage = ref('')
const totalPaperPages = computed(() =>
  papers.reduce((total, paper) => total + paper.paper.pages, 0),
)
const totalSolutionPages = computed(() =>
  papers.reduce((total, paper) => total + paper.solution.pages, 0),
)
const totalLinks = computed(() =>
  papers.reduce((total, paper) => total + paper.questionLinks.length, 0),
)

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function refreshOfflineState(): Promise<void> {
  const available = await Promise.all(
    papers.map(async (paper) => ({
      year: paper.year,
      cached: await isPaperAvailableOffline(paper),
    })),
  )
  offlineYears.value = new Set(
    available.filter((item) => item.cached).map((item) => item.year),
  )
}

async function toggleOffline(paper: ExamPaper): Promise<void> {
  errorMessage.value = ''
  activeDownload.value = paper.year
  downloadProgress.value = ''

  try {
    if (offlineYears.value.has(paper.year)) {
      await removePaperOffline(paper)
    } else {
      await downloadPaperForOffline(paper, (completed, total) => {
        downloadProgress.value = `${completed}/${total}`
      })
    }
    await refreshOfflineState()
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '离线资料操作失败'
  } finally {
    activeDownload.value = undefined
    downloadProgress.value = ''
  }
}

onMounted(() => void refreshOfflineState())
</script>

<template>
  <main class="papers-view">
    <section class="papers-hero">
      <div>
        <span class="section-kicker">PAST PAPERS · VERIFIED SOURCES</span>
        <h1>考研真题<br /><em>与解析</em></h1>
        <p>
          原卷与参考答案分开阅读，避免提前剧透；支持按年份离线保存，
          并把真题题号连接回对应知识点。
        </p>
      </div>

      <aside class="paper-principles">
        <span>近六年题库已就绪</span>
        <strong>完整原卷 · 来源可查 · 答案不冒充官方</strong>
        <small>
          2020—2025 共 {{ papers.length }} 套原卷、{{ totalPaperPages }} 页试题、
          {{ totalSolutionPages }} 页解析和 {{ totalLinks }} 个题目关联。
        </small>
      </aside>
    </section>

    <p v-if="errorMessage" class="paper-error" role="alert">
      {{ errorMessage }}
    </p>

    <section class="paper-list" aria-label="真题年份">
      <article
        v-for="paper in papers"
        :key="paper.year"
        class="paper-card"
      >
        <div class="year-column">
          <small>全国统考</small>
          <strong>{{ paper.year }}</strong>
          <span v-if="paper.status === 'verified'">已核验</span>
        </div>

        <div class="paper-main">
          <div class="paper-heading">
            <div>
              <span class="sample-chip">
                {{ paper.featured ? '最新年份' : '历年真题' }}
              </span>
              <h2>{{ paper.title }}</h2>
            </div>
            <span
              class="offline-state"
              :class="{ active: offlineYears.has(paper.year) }"
            >
              {{ offlineYears.has(paper.year) ? '已离线保存' : '在线资料' }}
            </span>
          </div>

          <div class="paper-stats">
            <span><strong>{{ paper.totalScore }}</strong> 分</span>
            <span><strong>{{ paper.durationMinutes }}</strong> 分钟</span>
            <span><strong>{{ paper.paper.pages }}</strong> 页原卷</span>
            <span><strong>{{ paper.solution.pages }}</strong> 页解析</span>
            <span>
              <strong>{{ paper.questionLinks.length }}</strong> 个知识关联
            </span>
          </div>

          <div class="paper-source">
            <span>来源</span>
            <a :href="paper.source.pageUrl" target="_blank" rel="noopener">
              {{ paper.source.publisher }}公开备考资料页 ↗
            </a>
            <small>
              原卷 {{ formatBytes(paper.paper.bytes) }} · 解析
              {{ formatBytes(paper.solution.bytes) }}
            </small>
          </div>

          <div class="paper-actions">
            <RouterLink
              class="primary-action"
              :to="`/papers/${paper.year}`"
            >
              在线阅读与对照
              <span>→</span>
            </RouterLink>
            <button
              type="button"
              class="secondary-action"
              :disabled="activeDownload === paper.year"
              @click="toggleOffline(paper)"
            >
              <template v-if="activeDownload === paper.year">
                正在处理 {{ downloadProgress }}
              </template>
              <template v-else-if="offlineYears.has(paper.year)">
                删除离线资料
              </template>
              <template v-else>
                下载原卷与解析
              </template>
            </button>
          </div>
        </div>
      </article>
    </section>

    <section class="papers-roadmap">
      <div>
        <span class="section-kicker">LIBRARY READY</span>
        <h2>2020—2025 近六年真题已经按统一标准整理完成</h2>
      </div>
      <ol>
        <li><strong>01</strong><span>六套完整原卷与对应参考解析</span></li>
        <li><strong>02</strong><span>90 道代表性真题连接到知识图谱</span></li>
        <li><strong>03</strong><span>逐年进度保存与独立离线下载</span></li>
      </ol>
    </section>
  </main>
</template>

<style scoped>
.papers-view {
  width: min(100% - 3rem, 90rem);
  margin: 0 auto;
  padding-bottom: 5rem;
}

.papers-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 25rem;
  gap: 4rem;
  align-items: end;
  padding: 5.5rem 0 4rem;
}

.papers-hero h1 {
  margin: 1rem 0 1.2rem;
  color: #111827;
  font-family: Georgia, "Songti SC", serif;
  font-size: clamp(3rem, 7vw, 6rem);
  font-weight: 500;
  letter-spacing: -0.07em;
  line-height: 0.96;
}

.papers-hero h1 em {
  color: #e7562c;
  font-style: normal;
}

.papers-hero p {
  max-width: 42rem;
  margin: 0;
  color: #5f6b7e;
  font-size: 1.05rem;
  line-height: 1.9;
}

.paper-principles {
  display: grid;
  gap: 0.7rem;
  padding: 1.5rem;
  border: 1px solid rgba(231, 86, 44, 0.16);
  border-radius: 1.4rem;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 1.2rem 3rem rgba(30, 41, 59, 0.06);
}

.paper-principles > span {
  color: #e7562c;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.paper-principles strong {
  color: #202b3d;
  font-size: 1.08rem;
  line-height: 1.55;
}

.paper-principles small {
  color: #788397;
  line-height: 1.7;
}

.paper-error {
  padding: 0.8rem 1rem;
  border: 1px solid #f1c9bd;
  border-radius: 0.8rem;
  background: #fff5f2;
  color: #a5412d;
}

.paper-list {
  display: grid;
  gap: 1.2rem;
}

.paper-card {
  display: grid;
  grid-template-columns: 12rem minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid #e0e5ec;
  border-radius: 1.65rem;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 1.4rem 4rem rgba(30, 41, 59, 0.07);
}

.year-column {
  display: grid;
  min-height: 25rem;
  align-content: center;
  justify-items: center;
  padding: 2rem 1rem;
  background:
    radial-gradient(circle at 50% 20%, rgba(255, 255, 255, 0.12), transparent 30%),
    #121a2a;
  color: #fff;
}

.year-column small {
  color: #9fabbd;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.year-column strong {
  margin: 0.7rem 0;
  font-family: Georgia, serif;
  font-size: 3.5rem;
  font-weight: 500;
  letter-spacing: -0.07em;
}

.year-column span {
  padding: 0.36rem 0.65rem;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  color: #b8f1da;
  font-size: 0.66rem;
}

.paper-main {
  padding: 2rem;
}

.paper-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 2rem;
}

.sample-chip {
  display: inline-flex;
  padding: 0.35rem 0.55rem;
  border-radius: 999px;
  background: #fff0eb;
  color: #c94927;
  font-size: 0.65rem;
  font-weight: 800;
}

.paper-heading h2 {
  max-width: 42rem;
  margin: 0.8rem 0 0;
  color: #172033;
  font-size: clamp(1.35rem, 2.6vw, 2rem);
  line-height: 1.35;
}

.offline-state {
  flex: 0 0 auto;
  padding: 0.45rem 0.65rem;
  border-radius: 999px;
  background: #f0f3f7;
  color: #7a8697;
  font-size: 0.68rem;
  font-weight: 750;
}

.offline-state.active {
  background: #e7f7f1;
  color: #14785f;
}

.paper-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin: 1.7rem 0;
}

.paper-stats span {
  padding: 0.55rem 0.75rem;
  border: 1px solid #e4e8ee;
  border-radius: 0.7rem;
  background: #f8fafc;
  color: #6b778a;
  font-size: 0.72rem;
}

.paper-stats strong {
  color: #26334a;
}

.paper-source {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.65rem;
  align-items: center;
  padding: 1rem;
  border: 1px solid #e4e8ee;
  border-radius: 0.85rem;
  background: #fbfcfd;
  font-size: 0.73rem;
}

.paper-source > span {
  color: #8993a3;
}

.paper-source a {
  overflow: hidden;
  color: #3157d5;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.paper-source small {
  color: #7d8899;
}

.paper-actions {
  display: flex;
  gap: 0.7rem;
  margin-top: 1.6rem;
}

.primary-action,
.secondary-action {
  min-height: 3rem;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  font-size: 0.78rem;
  font-weight: 750;
}

.primary-action {
  display: inline-flex;
  align-items: center;
  gap: 2rem;
  border: 1px solid #3157d5;
  background: #3157d5;
  color: #fff;
  text-decoration: none;
}

.secondary-action {
  border: 1px solid #dce2ea;
  background: #fff;
  color: #48576e;
  cursor: pointer;
}

.secondary-action:disabled {
  cursor: wait;
  opacity: 0.65;
}

.papers-roadmap {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 1.4fr;
  gap: 3rem;
  margin-top: 2rem;
  padding: 2rem;
  border: 1px solid #e0e5ec;
  border-radius: 1.4rem;
  background: rgba(255, 255, 255, 0.68);
}

.papers-roadmap h2 {
  margin: 0.8rem 0 0;
  color: #1e293b;
  font-size: 1.5rem;
  line-height: 1.45;
}

.papers-roadmap ol {
  display: grid;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.papers-roadmap li {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.7rem 0;
  border-bottom: 1px solid #e3e7ed;
  color: #596579;
  font-size: 0.8rem;
}

.papers-roadmap li strong {
  color: #e7562c;
  font-family: Georgia, serif;
}

@media (max-width: 860px) {
  .papers-hero,
  .papers-roadmap {
    grid-template-columns: 1fr;
    gap: 2rem;
  }

  .paper-card {
    grid-template-columns: 1fr;
  }

  .year-column {
    min-height: auto;
    grid-template-columns: auto auto 1fr;
    justify-items: start;
    gap: 0.8rem;
  }

  .year-column strong {
    margin: 0;
    font-size: 2rem;
  }
}

@media (max-width: 620px) {
  .papers-view {
    width: min(100% - 1.25rem, 90rem);
  }

  .papers-hero {
    padding-top: 3.5rem;
  }

  .paper-main {
    padding: 1.2rem;
  }

  .paper-heading,
  .paper-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .paper-source {
    grid-template-columns: 1fr;
  }
}
</style>

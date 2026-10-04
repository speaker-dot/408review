<script setup lang="ts">
import type { KnowledgeNode } from '@/types'
import MarkdownContent from './MarkdownContent.vue'
import QuizBox from './QuizBox.vue'
import LearningPanel from './LearningPanel.vue'
import RecallCheck from './RecallCheck.vue'
import CorrectionForm from './CorrectionForm.vue'
import { demosForNode } from '@/learning/demoIndex'

const props = defineProps<{
  node: KnowledgeNode
}>()

const categoryNames = {
  DS: '数据结构',
  CS: '计算机组成原理',
  OS: '操作系统',
  NET: '计算机网络',
}
</script>

<template>
  <article class="knowledge-page">
    <nav class="breadcrumb" aria-label="面包屑导航">
      <RouterLink to="/">知识图谱</RouterLink>
      <span>/</span>
      <span>{{ categoryNames[node.category] }}</span>
      <template v-if="node.parentId && node.parentId !== node.category">
        <span>/</span>
        <RouterLink :to="`/node/${node.parentId}`">{{ node.parentId }}</RouterLink>
      </template>
    </nav>

    <header class="knowledge-hero" :data-category="node.category">
      <div class="knowledge-meta">
        <span class="node-code">{{ node.id }}</span>
        <span class="difficulty" :aria-label="`难度 ${node.difficulty} 星`">
          <i v-for="level in 5" :key="level" :class="{ active: level <= node.difficulty }" />
          <span>难度 {{ node.difficulty }}</span>
        </span>
      </div>
      <h1>{{ node.name }}</h1>
      <p>{{ node.summary }}</p>
    </header>

    <LearningPanel :key="node.id" :node-id="node.id" />
    <div v-if="demosForNode(node.id).length" class="node-lab-links">
      <span>让知识动起来</span>
      <RouterLink v-for="demo in demosForNode(node.id)" :key="demo.id" :to="`/demos?demo=${demo.id}`">{{ demo.title }} · 逐步推演 ↗</RouterLink>
    </div>

    <section class="content-card details-card">
      <MarkdownContent :content="node.details" />
    </section>

    <section v-if="node.study" :key="`${node.id}-recall`" class="content-card recall-card">
      <div class="study-heading">
        <h2>合上讲解，试着回忆</h2>
        <p>先用自己的话回答，再展开对照；答不上来的部分值得回读。</p>
      </div>
      <RecallCheck v-for="(item, index) in node.study.recall" :key="`${node.id}-${index}`" :node-id="node.id" :index="index" :question="item.question" :answer="item.answer" />
    </section>

    <section v-if="node.study" class="content-card reading-card">
      <div class="study-heading">
        <h2>教材与资料对照</h2>
        <p>讲解和推导例题已保存在本站，离线也能阅读。下方原始资料链接需要联网。</p>
      </div>
      <article v-for="source in node.study.sources" :key="`${source.url}-${source.title}`" class="reading-source">
        <a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }} ↗</a>
        <p v-if="source.locator" class="source-locator">{{ source.locator }}</p>
        <template v-if="source.quote">
          <p class="excerpt-label">原文短摘</p>
          <blockquote>{{ source.quote }}</blockquote>
          <p v-if="source.translation">对照理解：{{ source.translation }}</p>
        </template>
        <p class="reading-note">{{ source.note }}</p>
      </article>
    </section>

    <section class="content-card traps-card">
      <div class="section-heading">
        <span class="section-kicker">EXAM TRAPS</span>
        <h2>易错点清单</h2>
      </div>
      <ol class="trap-list">
        <li v-for="(trap, index) in node.traps" :key="`${trap.title}-${index}`" class="trap-item">
          <div class="trap-title">
            <span>{{ String(index + 1).padStart(2, '0') }}</span>
            <h3>{{ trap.title }}</h3>
          </div>
          <dl>
            <div>
              <dt>常见错法</dt>
              <dd><MarkdownContent :content="trap.mistake" /></dd>
            </div>
            <div>
              <dt>为什么错</dt>
              <dd><MarkdownContent :content="trap.why" /></dd>
            </div>
            <div>
              <dt>纠正方法</dt>
              <dd><MarkdownContent :content="trap.correction" /></dd>
            </div>
            <div>
              <dt>例题支撑</dt>
              <dd><MarkdownContent :content="trap.example" /></dd>
            </div>
          </dl>
          <a
            v-if="trap.source?.url"
            class="source-link"
            :href="trap.source.url"
            target="_blank"
            rel="noopener noreferrer"
          >
            延伸参考资料（旧版外链，未核对原题对应关系）↗
          </a>
          <span v-else-if="trap.source" class="source-link source-text">
            {{ trap.source.label }}（{{ trap.source.adapted ? '改编' : '原创' }}）
          </span>
        </li>
      </ol>
    </section>

    <section class="quiz-section">
      <div class="section-heading">
        <span class="section-kicker">PRACTICE</span>
        <h2>习题与讲解</h2>
        <p>先独立作答，再展开解析核对思路。</p>
      </div>

      <QuizBox
        v-for="(quiz, index) in node.quizzes"
        :key="quiz.id"
        :quiz="quiz"
        :index="index + 1"
        :node-id="node.id"
      />
      <p v-if="!node.quizzes.length" class="content-card learning-panel">此页用于章节梳理；请进入具体知识点进行针对性练习。整卷原题见“考研真题与解析”。</p>
    </section>
    <CorrectionForm :key="`${node.id}-feedback`" :node-id="node.id" />
  </article>
</template>

<style scoped>
.recall-card, .reading-card { padding: clamp(1.5rem, 4vw, 3rem); }
.study-heading h2 {
  margin: 0 0 0.6rem;
  color: var(--ink);
  font-size: 1.25rem;
}
.study-heading > p, .reading-note, .source-locator {
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1.8;
}
.recall-question {
  margin-top: 1rem;
  border-top: 1px solid var(--line);
  padding-top: 1rem;
}
.recall-question summary {
  cursor: pointer;
  color: var(--blue);
}
.recall-question summary :deep(.markdown-content) {
  display: inline;
}
.recall-question summary :deep(p) {
  display: inline;
}
.recall-answer { padding: 0.9rem 0 0.2rem; }
.reading-source + .reading-source {
  border-top: 1px solid var(--line);
  margin-top: 1rem;
  padding-top: 1rem;
}
.reading-source > a { color: var(--blue); font-weight: 600; line-height: 1.7; }
.reading-source blockquote {
  margin: 0.5rem 0;
  border-left: 3px solid var(--blue);
  padding: 0.6rem 1rem;
  background: #f5f7fc;
  color: var(--ink);
  line-height: 1.8;
}
.excerpt-label { margin-bottom: 0.25rem; color: var(--muted); font-size: 0.8rem; }
</style>

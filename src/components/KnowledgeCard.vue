<script setup lang="ts">
import type { KnowledgeNode } from '@/types'
import MarkdownContent from './MarkdownContent.vue'
import QuizBox from './QuizBox.vue'

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

    <section class="content-card details-card">
      <MarkdownContent :content="node.details" />
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
            {{ trap.source.label }}{{ trap.source.questionNo ? ` · ${trap.source.questionNo}` : '' }}
            （{{ trap.source.adapted ? '改编' : '原题' }}）
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
      />
    </section>
  </article>
</template>

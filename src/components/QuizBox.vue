<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { Quiz } from '@/types'
import MarkdownContent from './MarkdownContent.vue'

const props = defineProps<{
  quiz: Quiz
  index: number
}>()

const selectedOption = ref('')
const submitted = ref(false)
const answerVisible = ref(false)

const isCorrect = computed(
  () => selectedOption.value.slice(0, 1) === props.quiz.answer.slice(0, 1),
)

function submitChoice(): void {
  if (!selectedOption.value) return
  submitted.value = true
}

function optionState(option: string): Record<string, boolean> {
  const key = option.slice(0, 1)
  return {
    selected: selectedOption.value === option,
    correct: submitted.value && key === props.quiz.answer.slice(0, 1),
    incorrect:
      submitted.value && selectedOption.value === option && !isCorrect.value,
  }
}

watch(
  () => props.quiz.id,
  () => {
    selectedOption.value = ''
    submitted.value = false
    answerVisible.value = false
  },
)
</script>

<template>
  <article class="quiz-box">
    <div class="quiz-heading">
      <span class="quiz-number">Q{{ String(index).padStart(2, '0') }}</span>
      <span class="quiz-type">
        {{ quiz.type === 'choice' ? '单项选择' : quiz.type === 'fill' ? '填空题' : '综合分析' }}
      </span>
      <a
        v-if="quiz.source.url"
        class="quiz-source"
        :href="quiz.source.url"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ quiz.source.label }}{{ quiz.source.questionNo ? ` · ${quiz.source.questionNo}` : '' }}
        · {{ quiz.source.adapted ? '改编' : '原题' }}
      </a>
      <span v-else class="quiz-source">
        {{ quiz.source.label }} · {{ quiz.source.adapted ? '改编' : '原创' }}
      </span>
    </div>

    <MarkdownContent class="quiz-question" :content="quiz.question" />

    <template v-if="quiz.type === 'choice' && quiz.options">
      <div class="quiz-options" role="radiogroup" :aria-label="`习题 ${index} 选项`">
        <button
          v-for="option in quiz.options"
          :key="option"
          type="button"
          class="quiz-option"
          :class="optionState(option)"
          :disabled="submitted"
          @click="selectedOption = option"
        >
          {{ option }}
        </button>
      </div>

      <button
        v-if="!submitted"
        type="button"
        class="primary-button"
        :disabled="!selectedOption"
        @click="submitChoice"
      >
        提交答案
      </button>

      <div v-else class="answer-panel" :class="isCorrect ? 'success' : 'warning'">
        <strong>{{ isCorrect ? '回答正确' : `正确答案：${quiz.answer}` }}</strong>
        <MarkdownContent :content="quiz.explanation" />
      </div>
    </template>

    <template v-else>
      <button
        type="button"
        class="primary-button"
        @click="answerVisible = !answerVisible"
      >
        {{ answerVisible ? '收起参考答案' : '查看参考答案' }}
      </button>

      <div v-if="answerVisible" class="analysis-answer">
        <section>
          <span class="answer-label">参考答案</span>
          <MarkdownContent :content="quiz.answer" />
        </section>
        <section>
          <span class="answer-label">解题复盘</span>
          <MarkdownContent :content="quiz.explanation" />
        </section>
      </div>
    </template>
  </article>
</template>

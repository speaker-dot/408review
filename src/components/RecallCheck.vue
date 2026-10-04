<script setup lang="ts">
import { ref } from 'vue'
import MarkdownContent from './MarkdownContent.vue'
import { useLearningStore } from '@/stores/learning'
import type { ReviewRating } from '@/types'
const props = defineProps<{ nodeId: string; index: number; question: string; answer: string }>()
const store = useLearningStore(), saved = ref(false), busy = ref(false), error = ref('')
const id = ref(crypto.randomUUID())
async function rate(rating: ReviewRating): Promise<void> {
  if (busy.value || saved.value) return
  busy.value = true; error.value = ''
  const now = Date.now()
  try {
    await store.recordAttempt({ id: id.value, nodeId: props.nodeId, quizId: `${props.nodeId}-recall-${props.index}`,
      type: 'recall', selectedAnswer: rating, correct: rating !== 'again', selfAssessed: true, note: '', createdAt: now, updatedAt: now }, rating)
    saved.value = true
  } catch { error.value = '回忆结果未保存，请重试。' }
  finally { busy.value = false }
}
</script>
<template>
  <details class="recall-question">
    <summary><MarkdownContent :content="question" /></summary>
    <div class="recall-answer"><MarkdownContent :content="answer" /></div>
    <p class="muted">对照后自评（不计入选择题正确率）</p>
    <div class="learning-toolbar">
      <button v-for="rating in ([['again','没想起来'],['hard','有提示才会'],['good','独立想起'],['easy','能解释给别人']] as const)" :key="rating[0]" class="secondary-button" :disabled="saved || busy" @click="rate(rating[0])">{{ rating[1] }}</button>
    </div>
    <p v-if="saved" role="status">已记录到复习计划。</p><p v-if="error" role="alert">{{ error }}</p>
  </details>
</template>

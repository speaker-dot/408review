<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import type { Quiz } from '@/types'
import MarkdownContent from './MarkdownContent.vue'
import { useLearningStore } from '@/stores/learning'
import type { StudyAttempt, ErrorKind } from '@/types'

const props = defineProps<{
  quiz: Quiz
  index: number
  nodeId: string
}>()

const learning = useLearningStore()
const saving = ref(false), saveError = ref(''), attempt = ref<StudyAttempt | null>(null)
const cause = ref<ErrorKind>('concept'), wrongNote = ref('')
let attemptId = crypto.randomUUID()
let generation = 0

const selectedOption = ref('')
const submitted = ref(false)
const answerVisible = ref(false)

const isCorrect = computed(
  () => selectedOption.value.slice(0, 1) === props.quiz.answer.slice(0, 1),
)

async function record(correct: boolean, selfAssessed: boolean): Promise<void> {
  if (saving.value) return
  saving.value = true; saveError.value = ''
  const token = generation
  const now = Date.now()
  const item: StudyAttempt = { id: attemptId, nodeId: props.nodeId, quizId: props.quiz.id, type: props.quiz.type,
    quiz: props.quiz, selectedAnswer: selectedOption.value.slice(0, 1), correct, selfAssessed, note: '',
    ...(correct ? {} : { errorKind: cause.value }), createdAt: now, updatedAt: now }
  try { await learning.recordAttempt(item, correct ? 'good' : 'again'); if(token===generation){attempt.value = item; submitted.value = true} }
  catch { if(token===generation)saveError.value = '作答结果未保存，请重试提交。' }
  finally { saving.value = false }
}
async function submitChoice(): Promise<void> {
  if (!selectedOption.value || submitted.value) return
  await record(isCorrect.value, false)
}
async function saveCause(): Promise<void> {
  if (!attempt.value) return
  saving.value = true; saveError.value = ''
  const token=generation
  try { await learning.updateAttempt({ ...attempt.value, errorKind: cause.value, note: wrongNote.value }); if(token===generation)saveError.value = '错因已保存' }
  catch { if(token===generation)saveError.value = '错因未保存，请重试。' }
  finally { saving.value = false }
}
function reset(): void {
  generation++
  selectedOption.value = ''; submitted.value = false; answerVisible.value = false
  attempt.value = null; attemptId = crypto.randomUUID(); saveError.value = ''; wrongNote.value = ''; cause.value = 'concept'
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
  reset,
)
onBeforeUnmount(()=>{generation++})
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
          :disabled="submitted || saving"
          @click="selectedOption = option"
        >
          <!--
            选项也可能包含 Markdown 与 LaTeX（例如 $j=next[j]$）。
            必须与题干、解析使用同一个渲染入口，否则公式会以源码形式显示。
          -->
          <MarkdownContent :content="option" />
        </button>
      </div>

      <button
        v-if="!submitted"
        type="button"
        class="primary-button"
        :disabled="!selectedOption || saving"
        @click="submitChoice"
      >
        {{ saving ? '保存中…' : '提交答案' }}
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
        <div v-if="!submitted" class="learning-toolbar">
          <span>请按完整推导自行评价（不会自动评分）：</span>
          <button class="secondary-button" :disabled="saving" @click="record(false, true)">还不会，加入复习</button>
          <button class="secondary-button" :disabled="saving" @click="record(true, true)">独立完成并核对</button>
        </div>
      </div>
    </template>
    <div v-if="attempt && !attempt.correct" class="wrong-cause">
      <label>这次错在哪里 <select v-model="cause"><option value="concept">概念不清</option><option value="condition">漏看条件 / 边界</option><option value="calculation">计算出错</option><option value="procedure">推导或步骤错误</option><option value="other">其他</option></select></label>
      <textarea v-model="wrongNote" rows="2" maxlength="3000" aria-label="错因笔记" placeholder="写下下次应怎样检查" />
      <button class="secondary-button" :disabled="saving" @click="saveCause">保存错因</button>
    </div>
    <p v-if="saveError" role="status" class="error-text">{{ saveError }}</p>
    <button v-if="submitted" class="secondary-button retry-button" :disabled="saving" @click="reset">重新作答（保留历史）</button>
  </article>
</template>

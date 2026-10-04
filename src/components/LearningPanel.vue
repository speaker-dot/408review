<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLearningStore } from '@/stores/learning'
import { initialProgress } from '@/learning/scheduler'
import type { StudyStatus } from '@/types'
const props = defineProps<{ nodeId: string }>()
const store = useLearningStore()
const p = computed(() => store.progress.find(item => item.nodeId === props.nodeId) ?? initialProgress(props.nodeId, Date.now()))
const note = ref(''), error = ref(''), busy = ref(false)
watch([() => props.nodeId, () => p.value.note], ([id,saved], previous) => {
  if(!previous?.length || id!==previous[0] || note.value===previous[1] || note.value===saved)note.value=saved
  else error.value='本机记录已有较新笔记，保留了你未保存的草稿；保存将采用当前草稿。'
}, { immediate: true })
async function save(change: Partial<Pick<typeof p.value,'note'|'bookmarked'|'status'|'manualMastery'>>): Promise<void> {
  busy.value = true; error.value = ''
  try { await store.saveProgress(props.nodeId, change); if(change.note!==undefined){note.value=change.note;error.value=''} }
  catch { error.value = '未能保存，请检查浏览器存储权限后重试。' }
  finally { busy.value = false }
}
function changeStatus(event: Event): void {
  const status = (event.target as HTMLSelectElement).value as StudyStatus
  void save({ status, manualMastery: status === 'mastered' })
}
</script>
<template>
  <section class="content-card learning-panel">
    <div class="learning-toolbar">
      <label>学习状态 <select :value="p.status" :disabled="busy" @change="changeStatus">
        <option value="learning">正在学习</option><option value="review">需要复习</option><option value="mastered">自行标记已掌握</option>
      </select></label>
      <button class="secondary-button" :disabled="busy" @click="save({ bookmarked: !p.bookmarked })">{{ p.bookmarked ? '★ 已收藏' : '☆ 收藏知识点' }}</button>
      <RouterLink to="/study">查看复习计划与错题 →</RouterLink>
    </div>
    <p class="muted">阅读不计为掌握。{{ p.manualMastery ? '当前为自行标记，可随时调整。' : `下次复习：${new Date(p.nextReviewAt).toLocaleString('zh-CN')}` }}</p>
    <label class="field-label">我的理解 / 待确认的问题<textarea v-model="note" rows="3" maxlength="5000" placeholder="用自己的话记下结论，或写下还不理解的地方。" /></label>
    <button class="secondary-button" :disabled="busy || note === p.note" @click="save({ note })">保存笔记</button>
    <p v-if="error" role="alert" class="error-text">{{ error }}</p>
  </section>
</template>

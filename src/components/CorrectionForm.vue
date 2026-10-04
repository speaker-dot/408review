<script setup lang="ts">
import { ref } from 'vue'
import { db } from '@/db/db'
const props = defineProps<{ nodeId: string }>()
const message = ref(''), section = ref('讲解'), status = ref(''), busy = ref(false)
async function save(): Promise<void> {
  if (!message.value.trim() || busy.value) return
  busy.value = true
  try { const now = Date.now(); await db.feedback.add({ id: crypto.randomUUID(), nodeId: props.nodeId, section: section.value,
    message: message.value.trim(), createdAt: now, updatedAt: now }); status.value = '已保存在本机；没有自动发送到 GitHub。'; message.value = '' }
  catch { status.value = '保存失败，请重试。' }
  finally { busy.value = false }
}
</script>
<template>
  <details class="content-card learning-panel"><summary>发现内容或答案有问题？记一条纠错</summary>
    <p class="muted">纠错先存本机，可在“离线与备份”查看、复制，再由你决定是否公开提交。</p>
    <label>位置 <select v-model="section"><option>讲解</option><option>例题</option><option>习题与答案</option><option>其他</option></select></label>
    <label class="field-label">问题说明<textarea v-model="message" rows="3" maxlength="3000" placeholder="具体题号、疑问、推导或参考来源" /></label>
    <button class="secondary-button" :disabled="!message.trim() || busy" @click="save">保存纠错</button><p role="status">{{ status }}</p>
  </details>
</template>

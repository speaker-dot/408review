<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useLearningStore } from '@/stores/learning'
import { latestAttempts, reviewQueue, newLearningQueue } from '@/learning/scheduler'
import index from '@/content/index.json'
import QuizBox from '@/components/QuizBox.vue'
import type { StudyAttempt } from '@/types'
const store = useLearningStore(), tab = ref('today'), subject = ref('all'), now = ref(Date.now()), status = ref('')
const reviewLimit = ref(10), newLimit = ref(3)
const names = new Map(index.nodes.map(node => [node.id, node.name]))
const filteredProgress = computed(() => store.progress.filter(p => subject.value === 'all' || p.nodeId.startsWith(subject.value)))
const due = computed(() => reviewQueue(filteredProgress.value, now.value, store.settings.dailyReviewLimit))
const fresh = computed(() => newLearningQueue(index.nodes.filter(n => subject.value === 'all' || n.id.startsWith(subject.value)), store.progress, store.settings.dailyNewLimit))
const wrong = computed(() => latestAttempts(store.attempts).filter(a => !a.correct && a.quiz && (subject.value === 'all' || a.nodeId.startsWith(subject.value))))
// 作答后保留当前卡片，便于读完解析；主动刷新后再移出已纠正题。
const visibleWrong = ref<StudyAttempt[]>([])
function refreshWrong():void{visibleWrong.value=[...wrong.value]}
watch([tab,subject],async()=>{if(tab.value==='wrong'){try{await store.initialize();if(tab.value==='wrong')refreshWrong()}catch{/* store.error 已显示 */}}})
const corrected = computed(()=>new Set(latestAttempts(store.attempts).filter(a=>a.correct).map(a=>a.quizId)))
const objectivelyGraded = computed(() => store.attempts.filter(a => !a.selfAssessed))
const accuracy = computed(() => objectivelyGraded.value.length ? Math.round(100 * objectivelyGraded.value.filter(a => a.correct).length / objectivelyGraded.value.length) + '%' : '暂无')
const completedToday = computed(() => new Set(store.attempts.filter(a => new Date(a.createdAt).toDateString() === new Date(now.value).toDateString()).map(a => a.nodeId)).size)
onMounted(async () => { try { await store.initialize(); reviewLimit.value = store.settings.dailyReviewLimit; newLimit.value = store.settings.dailyNewLimit } catch { /* store.error 已展示 */ } })
async function saveSettings(): Promise<void> {
  try { await store.saveSettings({ ...store.settings, dailyReviewLimit: reviewLimit.value, dailyNewLimit: newLimit.value }); status.value = '计划已保存' }
  catch (e) { status.value = e instanceof Error ? e.message : '保存失败' }
}
const causeNames: Record<string,string> = { concept:'概念不清', condition:'条件 / 边界', calculation:'计算', procedure:'步骤', other:'其他' }
</script>
<template>
  <main class="learning-page">
    <header class="learning-hero"><span class="section-kicker">MY LEARNING</span><h1>把学过的，真正记住</h1><p>记录留在这台设备。先回忆、再核对，错题用新的理解重新作答。</p></header>
    <p v-if="store.error" class="error-text" role="alert">{{ store.error }}</p>
    <div class="learning-stats"><div><strong>{{ store.progress.length }}</strong><span>访问过的知识点</span></div><div><strong>{{ wrong.length }}</strong><span>待纠正习题</span></div><div><strong>{{ accuracy }}</strong><span>客观选择题正确率</span></div><div><strong>{{ completedToday }}</strong><span>今天主动复习的节点</span></div></div>
    <div class="learning-toolbar"><button v-for="item in [['today','今日复习'],['wrong','错题本'],['progress','笔记与进度']]" :key="item[0]" :class="tab === item[0] ? 'primary-button' : 'secondary-button'" @click="tab = item[0]">{{ item[1] }}</button>
      <select v-model="subject" aria-label="科目筛选"><option value="all">全部科目</option><option value="DS">数据结构</option><option value="CS">计算机组成</option><option value="OS">操作系统</option><option value="NET">计算机网络</option></select>
      <button class="secondary-button" @click="now = Date.now()">刷新到期状态</button></div>
    <template v-if="tab === 'today'">
      <section class="content-card learning-panel"><h2>到期复习 · {{ due.length }} 个</h2><p class="muted">错题 1 小时后提醒；成功回忆按 1、2、4…天延长间隔。同一天连续刷题不会累加掌握证据。最多显示每日设定数量，不强制清空。</p>
        <p v-if="!due.length">当前没有到期项，可以学习下面的新考点或重新做错题。</p>
        <RouterLink v-for="item in due" :key="item.nodeId" class="study-row" :to="`/node/${item.nodeId}`"><span>{{ names.get(item.nodeId) }} <small>{{ item.nodeId }}</small></span><span>{{ new Date(item.nextReviewAt).toLocaleDateString() }} →</span></RouterLink>
      </section>
      <section class="content-card learning-panel"><h2>新学建议</h2><p class="muted">按章节顺序选取尚未打开的具体知识点；这是建议，不是强制任务。</p><p v-if="!fresh.length">当前科目没有新的推荐项，或新学数量设为 0。</p>
        <RouterLink v-for="item in fresh" :key="item.id" class="study-row" :to="`/node/${item.id}`">{{ item.name }} <small>{{ item.id }} →</small></RouterLink>
      </section>
      <section class="content-card learning-panel"><h2>调整每日计划</h2><div class="learning-toolbar"><label>复习上限 <input v-model.number="reviewLimit" type="number" min="1" max="50" /></label><label>新学建议 <input v-model.number="newLimit" type="number" min="0" max="20" /></label><button class="secondary-button" @click="saveSettings">保存计划</button></div><p role="status">{{ status }}</p></section>
    </template>
    <section v-else-if="tab === 'wrong'">
      <button class="secondary-button" @click="refreshWrong">读完解析后，刷新错题清单</button>
      <p class="content-card learning-panel" v-if="!visibleWrong.length">目前没有待纠正的题目。重新答对后可刷新移出这里，历史记录仍保留。</p>
      <article v-for="(item,i) in visibleWrong" :key="item.id" class="wrong-item"><div class="learning-toolbar"><RouterLink :to="`/node/${item.nodeId}`">{{ names.get(item.nodeId) }}</RouterLink><span>{{ corrected.has(item.quizId) ? '本次已纠正 · 可先读完解析' : item.selfAssessed ? '自评未掌握' : `上次选 ${item.selectedAnswer}` }} · {{ causeNames[item.errorKind ?? 'other'] }} · {{ new Date(item.createdAt).toLocaleString() }}</span></div><p v-if="item.note">我的错因：{{ item.note }}</p><QuizBox v-if="item.quiz" :quiz="item.quiz" :index="i+1" :node-id="item.nodeId" /></article>
    </section>
    <section v-else class="content-card learning-panel"><h2>学习足迹与笔记</h2><p v-if="!filteredProgress.length">打开一个知识点，学习足迹就会出现在这里。</p>
      <article v-for="item in [...filteredProgress].sort((a,b) => b.updatedAt-a.updatedAt)" :key="item.nodeId" class="progress-row"><RouterLink :to="`/node/${item.nodeId}`">{{ item.bookmarked ? '★ ' : '' }}{{ names.get(item.nodeId) }}</RouterLink><span>{{ { learning:'正在学习', review:'需要复习', mastered:'已掌握' }[item.status] }}{{ item.manualMastery ? '（自行标记）' : '' }} · 阅读 {{ item.visits }} 次 · {{ item.streak }} 次间隔成功</span><p v-if="item.note" class="saved-note">{{ item.note }}</p></article>
    </section>
  </main>
</template>

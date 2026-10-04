<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { buildDemoSteps } from '@/learning/demoCatalog'
import { demoIndex, demoSubjects, demosForNode, type DemoMetadata } from '@/learning/demoIndex'
import type { DemoStep } from '@/learning/demos'
import type { KnowledgeCategory } from '@/types'

const route = useRoute(), router = useRouter()
const activeId = ref('kmp'), category = ref<KnowledgeCategory | 'ALL'>('ALL'), search = ref('')
const inputs = ref<Record<string, string>>({}), executedInputs = ref('')
const steps = ref<DemoStep[]>([]), cursor = ref(0), error = ref(''), prediction = ref(''), showAll = ref(false), linkWarning = ref('')
const selected = computed(() => demoIndex.find(demo => demo.id === activeId.value)!)
const current = computed(() => steps.value[cursor.value])
const dirty = computed(() => executedInputs.value !== JSON.stringify(inputs.value))
const progress = computed(() => steps.value.length <= 1 ? 0 : Math.round(cursor.value / (steps.value.length - 1) * 100))
const filtered = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return demoIndex.filter(demo => (category.value === 'ALL' || demo.category === category.value) &&
    (!keyword || [demo.title, demo.focus, demo.summary, demo.id, ...demo.nodeIds].join(' ').toLowerCase().includes(keyword)))
})
function run(): void {
  try {
    steps.value = buildDemoSteps(activeId.value, inputs.value)
    cursor.value = 0; error.value = ''; prediction.value = ''; showAll.value = false
    executedInputs.value = JSON.stringify(inputs.value)
  } catch (e) {
    steps.value = []; cursor.value = 0; showAll.value = false
    error.value = e instanceof Error ? e.message : '输入不合法。'
  }
}
function load(demo: DemoMetadata): void {
  activeId.value = demo.id
  inputs.value = { ...demo.defaults }
  run()
}
function choose(demo: DemoMetadata): void {
  if (activeId.value !== demo.id) load(demo)
  linkWarning.value = ''
  // 只记录实验 ID，不把个人预测或复杂输入放进 URL。
  void router.replace({ path: '/demos', query: { demo: demo.id } })
}
watch(() => [route.query.demo, route.query.node], ([demoId, nodeId]) => {
  const requested = typeof demoId === 'string' ? demoIndex.find(demo => demo.id === demoId) :
    typeof nodeId === 'string' ? demosForNode(nodeId)[0] : undefined
  const target = requested ?? demoIndex.find(demo => demo.id === 'kmp')!
  if (activeId.value !== target.id || !steps.value.length) load(target)
  linkWarning.value = (demoId || nodeId) && !requested ? '该链接没有对应实验，先展示 KMP；可以从左侧目录选择。' : ''
}, { immediate: true })
function move(delta: number): void {
  if (dirty.value || !steps.value.length) return
  cursor.value = Math.max(0, Math.min(steps.value.length - 1, cursor.value + delta))
  prediction.value = ''
}
function resetStep(): void { cursor.value = 0; prediction.value = '' }
</script>

<template>
  <main class="learning-page lab-page">
    <header class="lab-hero">
      <div>
        <span class="section-kicker">THE 408 LEARNING LAB</span>
        <h1>理解，发生在<span>亲手推演</span>的那一刻。</h1>
        <p>不急着看答案。先预测，再走一步，让指针、队列、页框和窗口的变化变得清楚。</p>
        <div class="lab-hero-tags"><span><i /> 全部可离线</span><span>四科重点过程</span><span>输入可改 · 状态可回看</span></div>
      </div>
      <div class="lab-count"><strong>{{ demoIndex.length.toString().padStart(2, '0') }}</strong><span>个交互实验</span><small>每一步，都有依据。</small></div>
    </header>
    <p v-if="linkWarning" class="backup-summary" role="status">{{ linkWarning }}</p>
    <div class="lab-layout">
      <aside class="lab-library" aria-label="实验目录">
        <div class="lab-library-heading"><strong>选择一个过程</strong><span>{{ filtered.length }} / {{ demoIndex.length }}</span></div>
        <label class="lab-search"><span aria-hidden="true">⌕</span><input v-model="search" type="search" aria-label="搜索实验" placeholder="搜索算法、协议或考点" /></label>
        <div class="lab-subjects" aria-label="实验科目筛选">
          <button type="button" :class="{ active: category === 'ALL' }" :aria-pressed="category === 'ALL'" @click="category = 'ALL'">全部</button>
          <button v-for="subject in demoSubjects" :key="subject.id" type="button" :class="{ active: category === subject.id }" :aria-pressed="category === subject.id" @click="category = subject.id">{{ subject.short }}</button>
        </div>
        <nav class="lab-list" aria-label="可用实验">
          <button v-for="demo in filtered" :key="demo.id" type="button" class="lab-item" :data-category="demo.category" :class="{ active: activeId === demo.id }" :aria-pressed="activeId === demo.id" @click="choose(demo)">
            <span class="lab-item-top"><span class="subject-dot" />{{ demoSubjects.find(subject => subject.id === demo.category)?.name }}<span aria-hidden="true">↗</span></span>
            <strong>{{ demo.title }}</strong><small>{{ demo.focus }}</small>
          </button>
          <p v-if="!filtered.length" class="muted lab-empty">没有匹配实验。试试“调度”“地址”或“CRC”。</p>
        </nav>
        <RouterLink class="lab-syllabus-link" to="/syllabus">对照 408 大纲规划复习 <span>→</span></RouterLink>
      </aside>
      <div class="lab-workspace" :data-category="selected.category">
        <section class="lab-introduction">
          <span class="lab-eyebrow"><span class="subject-dot" />{{ demoSubjects.find(subject => subject.id === selected.category)?.name }} / {{ selected.focus }}</span>
          <h2>{{ selected.title }}</h2><p>{{ selected.summary }}</p>
          <div class="lab-related"><RouterLink v-for="nodeId in selected.nodeIds" :key="nodeId" :to="'/node/' + nodeId">{{ nodeId }} 知识讲解 ↗</RouterLink></div>
        </section>
        <form class="content-card lab-input-card" @submit.prevent="run">
          <div class="lab-section-heading"><span class="lab-section-no">01</span><div><h3>设定这一轮输入</h3><p>改一个条件，观察哪些结论会变。</p></div><button type="button" class="lab-text-button" @click="load(selected)">恢复示例</button></div>
          <div class="lab-fields">
            <label v-for="field in selected.fields" :key="selected.id + '-' + field.key" class="lab-field" :class="{ wide: field.kind === 'textarea' }">
              <span>{{ field.label }}</span>
              <textarea v-if="field.kind === 'textarea'" v-model="inputs[field.key]" rows="3" maxlength="6000" :aria-describedby="selected.id + '-' + field.key + '-help'" spellcheck="false" />
              <select v-else-if="field.kind === 'select'" v-model="inputs[field.key]" :aria-describedby="selected.id + '-' + field.key + '-help'"><option v-for="option in field.options" :key="option" :value="option">{{ option }}</option></select>
              <!-- 数字也保留原始字符串，由模型统一校验，避免 v-model 自动转数值后丢失输入或跳过错误提示。 -->
              <input v-else v-model="inputs[field.key]" type="text" :inputmode="field.kind === 'number' ? 'numeric' : undefined" maxlength="6000" :aria-describedby="selected.id + '-' + field.key + '-help'" spellcheck="false" />
              <small :id="selected.id + '-' + field.key + '-help'">{{ field.help || '选择后点击重新推演。' }}</small>
            </label>
          </div>
          <div class="lab-assumptions"><span>模型边界</span><p>{{ selected.assumptions }}</p></div>
          <div class="learning-toolbar"><button type="submit" class="primary-button">用当前输入重新推演 <span aria-hidden="true">→</span></button><span v-if="dirty && steps.length" class="muted">输入已改变，请重新推演后继续；当前状态属于上一轮。</span></div>
          <p v-if="error" class="error-text" role="alert">{{ error }}</p>
        </form>
        <section v-if="current" class="content-card lab-stage-card">
          <div class="lab-section-heading"><span class="lab-section-no">02</span><div><h3>先预测，再核对</h3><p>暂停、回看、重置，不用追赶动画。</p></div><span class="lab-step-count">{{ cursor }} / {{ steps.length - 1 }}</span></div>
          <div class="lab-progress" role="progressbar" aria-label="实验进度" :aria-valuenow="progress" :aria-valuemin="0" :aria-valuemax="100"><span :style="{ width: progress + '%' }" /></div>
          <div class="lab-step-controls">
            <button type="button" class="secondary-button" :disabled="cursor === 0 || dirty" @click="move(-1)">← 上一步</button>
            <button type="button" class="primary-button" :disabled="cursor === steps.length - 1 || dirty" @click="move(1)">揭晓下一步 →</button>
            <button type="button" class="lab-text-button" @click="resetStep">回到初始状态</button>
          </div>
          <div class="lab-action" aria-live="polite"><span>{{ cursor === 0 ? '初始状态' : cursor === steps.length - 1 ? '这一轮的结论' : '第 ' + cursor + ' 步' }}</span><strong>{{ current.action }}</strong></div>
          <div v-if="current.frames?.length" class="lab-frames" aria-label="当前结构状态"><span v-for="(frame, i) in current.frames" :key="i"><small>{{ i.toString().padStart(2, '0') }}</small>{{ frame }}</span></div>
          <dl class="lab-state-grid"><div v-for="(value, key) in current.state" :key="key"><dt>{{ key }}</dt><dd>{{ value }}</dd></div></dl>
          <label v-if="cursor < steps.length - 1" class="lab-prediction"><span>你的下一步预测 <small>不判分，先把想法写下来。</small></span><input v-model="prediction" maxlength="500" placeholder="谁会被选中？哪个状态会变化？为什么？" /></label>
          <div v-else class="lab-finish"><strong>这一轮走完了。</strong><p>换一个输入，或换一种策略。能解释差异，才算真正理解。</p><RouterLink :to="'/node/' + selected.nodeIds[0]">回知识点检验理解 →</RouterLink></div>
          <button type="button" class="lab-text-button lab-trace-toggle" :aria-expanded="showAll" @click="showAll = !showAll">{{ showAll ? '收起完整轨迹' : '查看完整轨迹（会揭示后续步骤）' }}</button>
          <ol v-if="showAll" class="lab-trace"><li v-for="(step, i) in steps" :key="i"><span>{{ i.toString().padStart(2, '0') }}</span>{{ step.action }}</li></ol>
        </section>
      </div>
    </div>
  </main>
</template>

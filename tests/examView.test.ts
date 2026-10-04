import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { db, type Cs408Database } from '@/db/db'
import * as repository from '@/services/examRepository'
import ExamView from '@/views/ExamView.vue'
import type { ExamSession } from '@/types'

const { analysisPlan } = vi.hoisted(() => ({ analysisPlan: [12, 8, 13, 10, 10, 9, 8] }))

vi.mock('@/components/PdfReader.vue', () => ({
  default: {
    name: 'PdfReader',
    props: ['src', 'title', 'modelValue'],
    template: '<section data-testid="pdf-reader">{{ title }}</section>',
  },
}))
vi.mock('@/services/paperCache', () => ({ paperAssetUrl: (url: string) => url }))
vi.mock('@/db/db', async importOriginal => {
  const original = await importOriginal<typeof import('@/db/db')>()
  return { ...original, db: new original.Cs408Database('408-exam-view-test-' + crypto.randomUUID()) }
})
vi.mock('@/content/papers/index.json', () => ({
  default: { papers: [2024, 2025].map(year => ({
    year, durationMinutes: 1, totalScore: 150,
    paper: { url: '/fixture/' + year + '-paper.pdf' },
    solution: { url: '/fixture/' + year + '-solution.pdf' },
    questionLinks: [],
  })) },
}))
vi.mock('@/content/papers/answer-keys.json', () => ({
  default: { keys: [
    { year: 2024, choices: Array(40).fill('A'), analysis: analysisPlan.map((maxScore, i) => ({ questionNo: 41 + i, maxScore })), solutionSha256: 'fixture-only', note: '合成测试参考，不代表真实考研答案或题目分值。' },
    { year: 2025, choices: [], analysis: [], solutionSha256: 'fixture-only', note: '测试无完整核验答案表。' },
  ] },
}))

const DATABASE = db as Cs408Database
const NOW = 1_720_000_000_000
let clock = NOW
const mounted: VueWrapper[] = []

async function settle() {
  // IndexedDB使用真实任务队列；仅冻结Date/interval，不冻结IDB需要的timeout或immediate。
  for (let round = 0; round < 8; round++) {
    await flushPromises()
    await nextTick()
  }
}
async function openExam(year = 2024, attach = false) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/papers/:year/exam', component: ExamView },
      { path: '/papers', component: { template: '<main>真题中心</main>' } },
    ],
  })
  await router.push('/papers/' + year + '/exam')
  await router.isReady()
  const wrapper = mount({ template: '<RouterView />' }, { ...(attach ? { attachTo: document.body } : {}), global: { plugins: [router] } })
  mounted.push(wrapper)
  await settle()
  return { wrapper, router }
}
function button(wrapper: VueWrapper, text: string) {
  const found = wrapper.findAll('button').find(item => item.text() === text)
  if (!found) throw new Error('未找到按钮：' + text + '\n' + wrapper.text())
  return found
}
function answerSelect(wrapper: VueWrapper, no: number) {
  return wrapper.get('select[aria-label="第 ' + no + ' 题答案"]')
}
function analysisInput(wrapper: VueWrapper, no: number) {
  return wrapper.get('input[aria-label="第 ' + no + ' 题自评分"]')
}
function totalText(wrapper: VueWrapper) {
  return wrapper.get('.learning-stats > div:nth-child(3) strong').text()
}
async function fullScoredExam() {
  const exam = await repository.startExam(2024, 1, DATABASE, NOW)
  await repository.saveExamAnswers(exam.id, Object.fromEntries(Array.from({ length: 40 }, (_, i) => [i + 1, 'A'])), DATABASE, NOW + 100)
  await repository.submitExam(exam.id, DATABASE, NOW + 1_000)
  clock = NOW + 2_000
  await repository.saveExamScoring(exam.id, { analysisScores: Object.fromEntries(analysisPlan.map((max, i) => [i + 41, max])) }, DATABASE)
  return exam
}
async function begin(wrapper: VueWrapper) {
  await button(wrapper, '开始并保存计时').trigger('click')
  await settle()
  const rows = await DATABASE.examSessions.toArray()
  const session = rows.find(item => item.status === 'running')
  if (!session) throw new Error('开始操作未持久化running会话')
  return session
}
async function rows(year: number) {
  return DATABASE.examSessions.where('year').equals(year).toArray()
}
async function stored(id: string) {
  const session = await DATABASE.examSessions.get(id)
  if (!session) throw new Error('持久化会话不存在')
  return session
}
async function handIn(wrapper: VueWrapper) {
  await button(wrapper, '交卷并查看解析').trigger('click')
  await settle()
  expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
  await button(wrapper, '确认交卷').trigger('click')
  await settle()
}

beforeEach(async () => {
  clock = NOW
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  await DATABASE.examSessions.clear()
})
afterEach(async () => {
  for (const wrapper of mounted) wrapper.unmount()
  mounted.length = 0
  vi.useRealTimers()
  vi.restoreAllMocks()
  await DATABASE.examSessions.clear()
})
afterAll(async () => { await DATABASE.delete() })

describe('整卷自测组件：真实本地持久化', () => {
  it('开始时立即保存绝对期限，答题实际写入IndexedDB', async () => {
    const { wrapper } = await openExam()
    expect(wrapper.text()).toContain('2024 年 · 整卷自测')
    const session = await begin(wrapper)
    expect(session.startedAt).toBe(NOW)
    expect(session.deadlineAt).toBe(NOW + 60_000)
    expect(wrapper.get('.exam-timer').text()).toBe('00:01:00')
    expect(wrapper.find('[data-testid="pdf-reader"]').text()).toBe('2024 年原卷')
    await answerSelect(wrapper, 1).setValue('B')
    await answerSelect(wrapper, 40).setValue('D')
    await settle()
    expect((await stored(session.id)).answers).toEqual({ 1: 'B', 40: 'D' })
    expect(wrapper.text()).toContain('2 / 40 已答')
  })

  it('卸载后刷新恢复原会话/选项，计时不重新开始', async () => {
    const first = await openExam()
    const session = await begin(first.wrapper)
    await answerSelect(first.wrapper, 3).setValue('C')
    await settle()
    first.wrapper.unmount()
    mounted.splice(mounted.indexOf(first.wrapper), 1)
    clock = NOW + 15_000
    const second = await openExam()
    expect((answerSelect(second.wrapper, 3).element as HTMLSelectElement).value).toBe('C')
    expect(second.wrapper.get('.exam-timer').text()).toBe('00:00:45')
    expect((await rows(2024))).toHaveLength(1)
    expect((await stored(session.id)).startedAt).toBe(NOW)
  })

  it('提前交卷显示解析并锁定原作答，直接触发change也不能修改', async () => {
    const { wrapper } = await openExam()
    const session = await begin(wrapper)
    await answerSelect(wrapper, 1).setValue('B')
    await settle()
    clock = NOW + 12_000
    await handIn(wrapper)
    expect((await stored(session.id)).status).toBe('submitted')
    expect((await stored(session.id)).submittedAt).toBe(clock)
    expect(wrapper.find('[data-testid="pdf-reader"]').text()).toBe('2024 年参考解析')
    expect(answerSelect(wrapper, 1).attributes('disabled')).toBeDefined()
    await answerSelect(wrapper, 1).setValue('D')
    await settle()
    expect((await stored(session.id)).answers[1]).toBe('B')
    expect(wrapper.text()).toContain('本轮复盘')
    expect(wrapper.text()).toContain('待评完')
  })

  it('新一轮保留历史，进行中不切会话，两轮交卷后可分别回看', async () => {
    const { wrapper } = await openExam()
    const previous = await begin(wrapper)
    await answerSelect(wrapper, 2).setValue('C')
    await settle()
    clock = NOW + 5_000
    await handIn(wrapper)
    clock = NOW + 6_000
    await button(wrapper, '开始新一轮（历史保留）').trigger('click')
    await settle()
    const history = await rows(2024)
    expect(history).toHaveLength(2)
    const current = history.find(item => item.status === 'running')!
    expect(current.id).not.toBe(previous.id)
    expect(current.answers).toEqual({})
    expect(wrapper.find('select[aria-label="查看历史考试"]').exists()).toBe(false)
    await answerSelect(wrapper, 3).setValue('D')
    await settle()
    clock = NOW + 10_000
    await handIn(wrapper)
    const selector = wrapper.get('select[aria-label="查看历史考试"]')
    expect(selector.findAll('option')).toHaveLength(2)
    await selector.setValue(previous.id)
    await settle()
    expect((answerSelect(wrapper, 2).element as HTMLSelectElement).value).toBe('C')
    expect(answerSelect(wrapper, 2).attributes('disabled')).toBeDefined()
    await selector.setValue(current.id)
    await settle()
    expect((answerSelect(wrapper, 2).element as HTMLSelectElement).value).toBe('')
    expect((answerSelect(wrapper, 3).element as HTMLSelectElement).value).toBe('D')
    expect(answerSelect(wrapper, 2).attributes('disabled')).toBeDefined()
    expect((await stored(previous.id)).answers[2]).toBe('C')
    expect((await stored(current.id)).answers).toEqual({ 3: 'D' })
  })

  it('保存失败明确显示未保存，重试后才真正落库', async () => {
    const { wrapper } = await openExam()
    const session = await begin(wrapper)
    vi.spyOn(repository, 'saveExamAnswers').mockRejectedValueOnce(new Error('测试：配额暂不可用'))
    await answerSelect(wrapper, 4).setValue('D')
    await settle()
    expect(wrapper.get('[role="alert"]').text()).toContain('保存失败')
    expect((await stored(session.id)).answers).toEqual({})
    expect(wrapper.get('[role="status"]').text()).not.toContain('已保存')
    await button(wrapper, '重试保存').trigger('click')
    await settle()
    expect((await stored(session.id)).answers).toEqual({ 4: 'D' })
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('已到deadline但interval尚未tick时也不能接受越时选项', async () => {
    const { wrapper } = await openExam()
    const session = await begin(wrapper)
    clock = session.deadlineAt
    await answerSelect(wrapper, 5).setValue('C')
    await settle()
    const saved = await stored(session.id)
    expect(saved.status).toBe('submitted')
    expect(saved.answers).toEqual({})
    expect((answerSelect(wrapper, 5).element as HTMLSelectElement).value).toBe('')
    expect(answerSelect(wrapper, 5).attributes('disabled')).toBeDefined()
  })

  it('后台时钟越过deadline后恢复，下次tick自动交卷而非重置计时', async () => {
    const { wrapper } = await openExam()
    const session = await begin(wrapper)
    await answerSelect(wrapper, 7).setValue('A')
    await settle()
    clock = session.deadlineAt + 3_600_000
    await vi.advanceTimersByTimeAsync(1_000)
    await settle()
    const saved = await stored(session.id)
    expect(saved.status).toBe('submitted')
    expect(saved.submittedAt).toBe(session.deadlineAt)
    expect(saved.answers).toEqual({ 7: 'A' })
    expect(answerSelect(wrapper, 7).attributes('disabled')).toBeDefined()
    expect(wrapper.find('.exam-timer').exists()).toBe(false)
  })

  it('参数切换年份先确认未保存内容，取消留在原年份，确认后pending不串入新轮', async () => {
    const { wrapper, router } = await openExam()
    const previous = await begin(wrapper)
    vi.spyOn(repository, 'saveExamAnswers').mockRejectedValueOnce(new Error('测试：保存失败'))
    await answerSelect(wrapper, 1).setValue('B')
    await settle()
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await router.push('/papers/2025/exam')
    await settle()
    expect(router.currentRoute.value.params.year).toBe('2024')
    expect(wrapper.text()).toContain('2024 年 · 整卷自测')
    await router.push('/papers/2025/exam')
    await settle()
    expect(router.currentRoute.value.params.year).toBe('2025')
    await button(wrapper, '开始并保存计时').trigger('click')
    await settle()
    const current = (await rows(2025)).find(item => item.status === 'running')!
    expect(current).toBeDefined()
    await answerSelect(wrapper, 2).setValue('C')
    await settle()
    expect((await stored(current.id)).answers).toEqual({ 2: 'C' })
    expect((await stored(previous.id)).answers).toEqual({})
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('跨年份导航等待正在写入的旧轮，不丢题也不把旧题保存到新年份', async () => {
    const { wrapper, router } = await openExam()
    const previous = await begin(wrapper)
    const save = repository.saveExamAnswers
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(repository, 'saveExamAnswers').mockImplementationOnce(async (...args) => {
      await gate
      return save(...args)
    })
    await answerSelect(wrapper, 9).setValue('D')
    await flushPromises()
    const navigation = router.push('/papers/2025/exam')
    await flushPromises()
    release()
    await navigation
    await settle()
    expect((await stored(previous.id)).answers).toEqual({ 9: 'D' })
    expect(router.currentRoute.value.params.year).toBe('2025')
    await button(wrapper, '开始并保存计时').trigger('click')
    await settle()
    const current = (await rows(2025)).find(item => item.status === 'running')!
    expect(current.answers).toEqual({})
    expect((answerSelect(wrapper, 9).element as HTMLSelectElement).value).toBe('')
  })
})

describe('手动交卷页面内确认', () => {
  it('只打开可访问的确认框，取消不交卷且可以继续答题', async () => {
    const { wrapper } = await openExam()
    const session = await begin(wrapper)
    const submit = vi.spyOn(repository, 'submitExam')
    await button(wrapper, '交卷并查看解析').trigger('click')
    await settle()
    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-labelledby')).toBe('exam-submit-title')
    expect(dialog.attributes('aria-describedby')).toBe('exam-submit-description')
    expect(wrapper.get('#exam-submit-description').text()).toContain('交卷后不能修改原作答')
    expect(wrapper.get('main > div').attributes('inert')).toBeDefined()
    expect(submit).not.toHaveBeenCalled()
    expect((await stored(session.id)).status).toBe('running')
    expect(window.confirm).not.toHaveBeenCalled()
    await button(wrapper, '取消，继续作答').trigger('click')
    await settle()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.get('main > div').attributes('inert')).toBeUndefined()
    expect(submit).not.toHaveBeenCalled()
    await answerSelect(wrapper, 3).setValue('D')
    await settle()
    expect((await stored(session.id)).answers).toEqual({ 3: 'D' })
    expect((await stored(session.id)).status).toBe('running')
  })

  it('默认聚焦取消，Tab 不出框，Escape 取消后焦点回到交卷按钮', async () => {
    const { wrapper } = await openExam(2024, true)
    const session = await begin(wrapper)
    await button(wrapper, '交卷并查看解析').trigger('click')
    await settle()
    const cancel = button(wrapper, '取消，继续作答'), confirm = button(wrapper, '确认交卷')
    expect(document.activeElement).toBe(cancel.element)
    await cancel.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(confirm.element)
    await confirm.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(cancel.element)
    await cancel.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(confirm.element)
    await confirm.trigger('keydown', { key: 'Escape' })
    await settle()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(button(wrapper, '交卷并查看解析').element)
    expect((await stored(session.id)).status).toBe('running')
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('确认交卷等待已排入的保存完成，再保存答案和提交', async () => {
    const { wrapper } = await openExam()
    const session = await begin(wrapper)
    const save = repository.saveExamAnswers
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(repository, 'saveExamAnswers').mockImplementationOnce(async (...args) => { await gate; return save(...args) })
    const submit = vi.spyOn(repository, 'submitExam')
    // 同一事件批次中先排入答题写入、再打开确认；Vue尚未更新按钮的disabled。
    const select = answerSelect(wrapper, 8).element as HTMLSelectElement
    select.value = 'C'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    const handInButton = button(wrapper, '交卷并查看解析').element as HTMLButtonElement
    handInButton.click()
    await flushPromises()
    await nextTick()
    await button(wrapper, '确认交卷').trigger('click')
    await flushPromises()
    expect(submit).not.toHaveBeenCalled()
    expect((await stored(session.id)).status).toBe('running')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    release()
    await settle()
    expect(submit).toHaveBeenCalledOnce()
    expect((await stored(session.id)).status).toBe('submitted')
    expect((await stored(session.id)).answers).toEqual({ 8: 'C' })
    expect(wrapper.find('[data-testid="pdf-reader"]').text()).toBe('2024 年参考解析')
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('确认框打开时到点仍自动交卷，不等待确认也不会弹原生窗口', async () => {
    const { wrapper } = await openExam()
    const session = await begin(wrapper)
    await answerSelect(wrapper, 4).setValue('B')
    await settle()
    await button(wrapper, '交卷并查看解析').trigger('click')
    await settle()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    clock = session.deadlineAt + 2_000
    await vi.advanceTimersByTimeAsync(1_000)
    await settle()
    const record = await stored(session.id)
    expect(record.status).toBe('submitted')
    expect(record.submittedAt).toBe(session.deadlineAt)
    expect(record.answers).toEqual({ 4: 'B' })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pdf-reader"]').text()).toBe('2024 年参考解析')
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('切换年份清除旧卷确认，不会把旧确认交到新卷', async () => {
    const { wrapper, router } = await openExam()
    const previous = await begin(wrapper)
    await button(wrapper, '交卷并查看解析').trigger('click')
    await settle()
    await router.push('/papers/2025/exam')
    await settle()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect((await stored(previous.id)).status).toBe('running')
    await button(wrapper, '开始并保存计时').trigger('click')
    await settle()
    const current = (await rows(2025)).find(item => item.status === 'running')!
    expect(current).toBeDefined()
    expect((await stored(previous.id)).status).toBe('running')
    expect(window.confirm).not.toHaveBeenCalled()
  })
})

describe('综合题评分输入清空：界面与持久化保持一致', () => {
  it('清空删除单题评分，总分回待评，并且刷新后仍为空', async () => {
    const exam = await fullScoredExam()
    const first = await openExam()
    expect(totalText(first.wrapper)).toBe('150 / 150')
    await analysisInput(first.wrapper, 41).setValue('')
    await settle()
    const record = await stored(exam.id)
    expect(record.analysisScores).not.toHaveProperty('41')
    expect(record.analysisScores[42]).toBe(8)
    expect(Object.keys(record.answers)).toHaveLength(40)
    expect(totalText(first.wrapper)).toBe('待评完')
    expect((analysisInput(first.wrapper, 41).element as HTMLInputElement).value).toBe('')
    expect(first.wrapper.text()).toContain('清空输入并离开输入框')
    first.wrapper.unmount()
    mounted.splice(mounted.indexOf(first.wrapper), 1)
    const refreshed = await openExam()
    expect((analysisInput(refreshed.wrapper, 41).element as HTMLInputElement).value).toBe('')
    expect((analysisInput(refreshed.wrapper, 42).element as HTMLInputElement).value).toBe('8')
    expect(totalText(refreshed.wrapper)).toBe('待评完')
  })

  it('填入0仍为已评分，随后清空才回到未评分', async () => {
    const exam = await fullScoredExam(), { wrapper } = await openExam()
    await analysisInput(wrapper, 41).setValue('0')
    await settle()
    expect((await stored(exam.id)).analysisScores[41]).toBe(0)
    expect(totalText(wrapper)).toBe('138 / 150')
    await analysisInput(wrapper, 41).setValue('')
    await settle()
    expect((await stored(exam.id)).analysisScores).not.toHaveProperty('41')
    expect(totalText(wrapper)).toBe('待评完')
  })

  it('清除失败恢复旧值并明确未保存，重新清空后才能成功', async () => {
    const exam = await fullScoredExam(), { wrapper } = await openExam()
    vi.spyOn(repository, 'clearExamAnalysisScore').mockRejectedValueOnce(new Error('测试：清除失败'))
    await analysisInput(wrapper, 41).setValue('')
    await settle()
    expect((await stored(exam.id)).analysisScores[41]).toBe(12)
    expect((analysisInput(wrapper, 41).element as HTMLInputElement).value).toBe('12')
    expect(wrapper.get('[role="alert"]').text()).toContain('清除评分未保存')
    expect(totalText(wrapper)).toBe('150 / 150')
    expect(wrapper.findAll('button').some(b => b.text() === '重试保存')).toBe(false)
    await analysisInput(wrapper, 41).setValue('')
    await settle()
    expect((await stored(exam.id)).analysisScores).not.toHaveProperty('41')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(totalText(wrapper)).toBe('待评完')
  })

  it('越界数字与浏览器badInput不误删旧分数', async () => {
    const exam = await fullScoredExam(), { wrapper } = await openExam()
    const clear = vi.spyOn(repository, 'clearExamAnalysisScore')
    await analysisInput(wrapper, 41).setValue('-1')
    await settle()
    expect((await stored(exam.id)).analysisScores[41]).toBe(12)
    expect((analysisInput(wrapper, 41).element as HTMLInputElement).value).toBe('12')
    const input = analysisInput(wrapper, 41).element as HTMLInputElement
    // 部分浏览器未写完的指数会同时给出 value='' 与 badInput=true；
    // 该合成状态不是主动清空，不能调用删除服务。
    vi.spyOn(input, 'validity', 'get').mockReturnValue({ badInput: true } as ValidityState)
    input.value = ''
    await analysisInput(wrapper, 41).trigger('change')
    await settle()
    expect(clear).not.toHaveBeenCalled()
    expect((await stored(exam.id)).analysisScores[41]).toBe(12)
    expect(input.value).toBe('12')
  })

  it('快速改分后立即清空按操作顺序持久化，不被迟到改分恢复旧值', async () => {
    const exam = await fullScoredExam(), { wrapper } = await openExam()
    const save = repository.saveExamScoring
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(repository, 'saveExamScoring').mockImplementationOnce(async (...args) => { await gate; return save(...args) })
    const clear = vi.spyOn(repository, 'clearExamAnalysisScore')
    await analysisInput(wrapper, 41).setValue('7')
    await flushPromises()
    await analysisInput(wrapper, 41).setValue('')
    await flushPromises()
    expect(clear).not.toHaveBeenCalled()
    release()
    await settle()
    expect(clear).toHaveBeenCalledOnce()
    expect((await stored(exam.id)).analysisScores).not.toHaveProperty('41')
    expect((await stored(exam.id)).analysisScores[42]).toBe(8)
    expect((analysisInput(wrapper, 41).element as HTMLInputElement).value).toBe('')
    expect(totalText(wrapper)).toBe('待评完')
  })

  it('换年份等待清除完成，旧卷清除结果不覆盖新卷界面', async () => {
    const exam = await fullScoredExam(), { wrapper, router } = await openExam()
    const clear = repository.clearExamAnalysisScore
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(repository, 'clearExamAnalysisScore').mockImplementationOnce(async (...args) => { await gate; return clear(...args) })
    await analysisInput(wrapper, 41).setValue('')
    await flushPromises()
    const navigation = router.push('/papers/2025/exam')
    await flushPromises()
    expect(router.currentRoute.value.params.year).toBe('2024')
    release()
    await navigation
    await settle()
    expect((await stored(exam.id)).analysisScores).not.toHaveProperty('41')
    expect(router.currentRoute.value.params.year).toBe('2025')
    expect(wrapper.text()).toContain('2025 年 · 整卷自测')
    expect(wrapper.find('input[aria-label="第 41 题自评分"]').exists()).toBe(false)
    expect(await rows(2025)).toEqual([])
  })
})

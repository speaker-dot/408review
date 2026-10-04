import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { db, type Cs408Database } from '@/db/db'
import { initialProgress } from '@/learning/scheduler'
import { demoIndex } from '@/learning/demoIndex'
import { filterSyllabus, itemProgress, syllabus, type SyllabusFilter, type SyllabusItem } from '@/learning/syllabus'
import { useLearningStore } from '@/stores/learning'
import SyllabusView from '@/views/SyllabusView.vue'
import index from '@/content/index.json'
import type { StudyProgress } from '@/types'

vi.mock('@/db/db', async importOriginal => {
  const original = await importOriginal<typeof import('@/db/db')>()
  return { ...original, db: new original.Cs408Database('408-syllabus-test-' + crypto.randomUUID()) }
})
const DATABASE = db as Cs408Database
const items = syllabus.subjects.flatMap(s => s.chapters.flatMap(c => c.items))
const chapters = syllabus.subjects.flatMap(s => s.chapters)
const emptyProgress = new Map<string, StudyProgress>()
const defaultFilter: SyllabusFilter = { subject: 'all', search: '', pendingOnly: false }
const mounted: VueWrapper[] = []
function count(result = syllabus.subjects) { return result.reduce((sum, s) => sum + s.chapters.reduce((n, c) => n + c.items.length, 0), 0) }
function getItem(id: string) { const item = items.find(i => i.id === id); if (!item) throw new Error('Missing syllabus item ' + id); return item }
function mastered(ids: string[]) { return new Map(ids.map(id => [id, { ...initialProgress(id, 100), status: 'mastered' as const, manualMastery: true }])) }
async function settle() { for (let i = 0; i < 5; i++) { await flushPromises(); await nextTick() } }
function button(wrapper: VueWrapper, label: string) { const button = wrapper.findAll('button').find(b => b.text() === label); if (!button) throw new Error('Missing button ' + label); return button }
async function openSyllabus() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/syllabus', component: SyllabusView },
    { path: '/node/:id', component: { template: '<main>Knowledge node</main>' } },
    { path: '/demos', component: { template: '<main>Demo</main>' } },
    { path: '/tools', component: { template: '<main>Tools</main>' } },
  ] })
  await router.push('/syllabus')
  await router.isReady()
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  mounted.push(wrapper)
  await settle()
  return { wrapper, router, store: useLearningStore(pinia) }
}
beforeEach(async () => { await DATABASE.studyProgress.clear(); await DATABASE.attempts.clear(); await DATABASE.settings.clear() })
afterEach(() => { for (const wrapper of mounted) wrapper.unmount(); mounted.length = 0; vi.restoreAllMocks() })
afterAll(async () => { await DATABASE.delete() })

describe('大纲资料数据：可核验范围与完整链接', () => {
  it('四科24章全部有本站学习任务，而不是大纲全文复制', () => {
    expect(syllabus.subjects.map(s => s.id)).toEqual(['DS', 'CS', 'OS', 'NET'])
    expect(syllabus.subjects.map(s => s.chapters.length)).toEqual([7, 6, 5, 6])
    expect(chapters).toHaveLength(24)
    expect(items).toHaveLength(71)
    for (const item of items) {
      expect(item.targets).toHaveLength(2)
      expect(item.targets.every(t => t.length >= 20)).toBe(true)
      expect(item.nodeIds.length > 0 || item.missingTopics.length > 0).toBe(true)
    }
    expect(syllabus.metadata.editorialNote).toContain('不是大纲原文')
    expect(syllabus.metadata.rightsNote).toContain('不托管未经授权')
  })

  it('章节/项目/来源键唯一，节点及推演ID均真实存在', () => {
    for (const list of [chapters, items, syllabus.sources, syllabus.extensions]) expect(new Set(list.map(i => i.id)).size).toBe(list.length)
    const nodeIds = new Set(index.nodes.map(n => n.id))
    const parents = new Set(index.nodes.map(n => n.parentId))
    for (const item of items) {
      expect(new Set(item.nodeIds).size).toBe(item.nodeIds.length)
      for (const id of [...item.nodeIds, ...item.demoNodeIds]) expect(nodeIds.has(id), id).toBe(true)
      for (const id of item.nodeIds) expect(parents.has(id), 'must map specific learning node: ' + id).toBe(false)
      for (const id of item.demoNodeIds) expect(item.nodeIds).toContain(id)
    }
    for (const ext of syllabus.extensions) for (const id of ext.nodeIds) expect(nodeIds.has(id), id).toBe(true)
    expect(new Set(items.flatMap(i => i.nodeIds)).size).toBe(219)
  })

  it('范围/考试数据使用可追溯一手页面，未伪造发布日期或托管原文', () => {
    const sourceIds = new Set(syllabus.sources.map(s => s.id))
    const allowed = new Set(['www.uwh.edu.cn', 'xuanshu.hep.com.cn', 'www.neea.edu.cn', 'www.tup.tsinghua.edu.cn'])
    for (const source of syllabus.sources) {
      expect(allowed.has(new URL(source.url).hostname)).toBe(true)
      expect(source.verifiedAt).toBe('2026-10-04')
      if (source.publishedAt) expect(new Date(source.publishedAt).valueOf()).toBeLessThanOrEqual(new Date(source.verifiedAt).valueOf())
      else expect(source.publicationNote).toContain('页面未标')
      if (source.documentUrl) expect(new URL(source.documentUrl).hostname).toBe('www.uwh.edu.cn')
      expect(source.note.length).toBeGreaterThan(30)
    }
    for (const group of [...chapters, ...syllabus.extensions, syllabus.exam]) for (const id of group.sourceIds) expect(sourceIds.has(id), id).toBe(true)
    expect(syllabus.sources.find(s => s.id === 'uwh-2025')?.publishedAt).toBe('2025-05-14')
    expect(syllabus.sources.find(s => s.id === 'hep-2027')?.publishedAt).toBe('2026-09-29')
  })

  it('2027仅核验书目，2025章纲不假冒2027原文或官方最新版', () => {
    expect(syllabus.metadata).toMatchObject({ scopeYear: 2025, catalogYear: 2027, catalogVerified: true, catalogContentVerified: false, verifiedAt: '2026-10-04' })
    expect(syllabus.metadata.versionNote).toContain('未核验 2027 年章节变化')
    expect(syllabus.metadata.versionNote).toContain('不宣称是最新年度原文')
    expect(syllabus.sources.find(s => s.id === 'hep-analysis-2025')?.note).toContain('而非年度大纲')
    expect(syllabus.sources.find(s => s.id === 'neea-2022')?.note).toContain('历史年份')
  })

  it('考试结构算术一致，分值带来源和当年试卷限制', () => {
    const e = syllabus.exam
    expect(e).toMatchObject({ code: '408', totalScore: 150, durationMinutes: 180, choiceQuestions: 40, choiceScore: 80, analysisScore: 70 })
    expect(e.choiceScore + e.analysisScore).toBe(e.totalScore)
    expect(e.subjectMarks).toEqual({ DS: 45, CS: 45, OS: 35, NET: 25 })
    expect(Object.values(e.subjectMarks).reduce((a, b) => a + b)).toBe(e.totalScore)
    expect(e.sourceIds).toEqual(['tup-exam-structure', 'tup-exam-duration'])
    expect(e.note).toContain('当年试卷')
  })

  it('已知缺口及延伸话题明确区分，不伪装全覆盖或永久不考', () => {
    const gaps = items.flatMap(i => i.missingTopics).join(' ')
    for (const topic of ['并查集', '红黑树', '外部排序', '机器级', 'SSD', '系统调用', 'NAT', 'IP 组播', '移动 IP']) expect(gaps).toContain(topic)
    expect(items.filter(i => i.missingTopics.length)).toHaveLength(24)
    expect(syllabus.extensions.some(e => e.nodeIds.includes('CS-03-03-004'))).toBe(true)
    expect(syllabus.extensions.some(e => e.nodeIds.includes('OS-04-03-002'))).toBe(true)
    expect(syllabus.extensions.every(e => e.note.includes('2025'))).toBe(true)
    expect(syllabus.metadata.coverageNote).toContain('不等于完全覆盖')
  })
})

describe('大纲搜索和掌握进度规则', () => {
  it('空筛选展示全部，原始数据不被改写', () => {
    const before = JSON.stringify(syllabus.subjects)
    expect(count(filterSyllabus(syllabus.subjects, defaultFilter, emptyProgress))).toBe(71)
    filterSyllabus(syllabus.subjects, { subject: 'CS', search: 'Cache', pendingOnly: true }, emptyProgress)
    expect(JSON.stringify(syllabus.subjects)).toBe(before)
  })
  it.each(['DS', 'CS', 'OS', 'NET'] as const)('科目%s仅保留自身项目', category => {
    const result = filterSyllabus(syllabus.subjects, { ...defaultFilter, subject: category }, emptyProgress)
    expect(result.map(s => s.id)).toEqual([category])
    expect(result[0].chapters.length).toBe(syllabus.subjects.find(s => s.id === category)?.chapters.length)
  })
  it.each(['KMP', 'kmp', ' DS-04-01-002 ', 'next lps'])('搜索%s可找到模式匹配，含节点名/ID/学习任务', search => {
    const result = filterSyllabus(syllabus.subjects, { ...defaultFilter, search }, emptyProgress)
    expect(result.flatMap(s => s.chapters.flatMap(c => c.items.map(i => i.id)))).toEqual(['sy-DS-06-d'])
  })
  it('搜索缺失内容可找到缺口，任意无匹配返回空数组', () => {
    expect(filterSyllabus(syllabus.subjects, { ...defaultFilter, search: '红黑树' }, emptyProgress).flatMap(s => s.chapters.flatMap(c => c.items)).map(i => i.id)).toEqual(['sy-DS-06-b'])
    expect(filterSyllabus(syllabus.subjects, { ...defaultFilter, search: 'absolutely-nonexistent-outline-topic' }, emptyProgress)).toEqual([])
  })
  it('阅读、收藏或笔记不等于掌握；只有全部关联节点掌握才完成', () => {
    const item = getItem('sy-DS-01-a')
    const p = new Map(item.nodeIds.map(id => [id, { ...initialProgress(id, 100), visits: 12, bookmarked: true, note: 'read a lot' }]))
    expect(itemProgress(item, p)).toMatchObject({ state: 'learning', complete: false, mastered: 0, read: 2 })
    p.set(item.nodeIds[0], { ...p.get(item.nodeIds[0])!, status: 'mastered' })
    expect(itemProgress(item, p).complete).toBe(false)
    expect(itemProgress(item, mastered(item.nodeIds))).toMatchObject({ state: 'mastered', complete: true, mastered: 2 })
  })
  it('有缺口或完全无节点项目永不由前置知识自动完成', () => {
    const gap = getItem('sy-DS-06-b'), unmapped = getItem('sy-CS-05-d')
    expect(itemProgress(gap, mastered(gap.nodeIds))).toMatchObject({ state: 'needs-supplement', complete: false })
    expect(itemProgress(unmapped, emptyProgress)).toMatchObject({ state: 'unmapped', complete: false, total: 0 })
  })
  it('待学习筛选保留待复习与缺失项，不保留真正完成项', () => {
    const complete = getItem('sy-DS-01-a'), gap = getItem('sy-DS-06-b'), review = getItem('sy-DS-01-b')
    const p = mastered([...complete.nodeIds, ...gap.nodeIds])
    p.set(review.nodeIds[0], { ...initialProgress(review.nodeIds[0], 100), status: 'review', manualMastery: false })
    const result = filterSyllabus(syllabus.subjects, { ...defaultFilter, pendingOnly: true }, p)
    const ids = result.flatMap(s => s.chapters.flatMap(c => c.items.map(i => i.id)))
    expect(ids).not.toContain(complete.id)
    expect(ids).toContain(gap.id)
    expect(ids).toContain(review.id)
    expect(ids).toContain('sy-CS-05-d')
    expect(itemProgress(review, p).state).toBe('review')
  })
  it('重复关联ID不重复计进度', () => {
    const item: SyllabusItem = { ...getItem('sy-DS-01-a'), nodeIds: ['DS-01-01-001', 'DS-01-01-001'] }
    expect(itemProgress(item, mastered(item.nodeIds))).toMatchObject({ total: 1, mastered: 1, complete: true })
  })
})

describe('大纲页面：已有学习存储与筛选交互', () => {
  it('展示四科章纲和来源提示，所有原文链接是外部来源', async () => {
    const { wrapper } = await openSyllabus()
    expect(wrapper.get('h1').text()).toBe('408 考研大纲 · 复习导航')
    expect(wrapper.findAll('.syllabus-subject').map(s => s.attributes('data-subject'))).toEqual(['DS', 'CS', 'OS', 'NET'])
    expect(wrapper.findAll('details.syllabus-chapter')).toHaveLength(24)
    expect(wrapper.text()).toContain('未核验 2027 年章节变化')
    expect(wrapper.text()).toContain('不宣称是最新年度原文')
    expect(wrapper.text()).toContain('外部原文和出版社页面需联网')
    const sources = wrapper.findAll('a[target="_blank"]')
    expect(sources.length).toBeGreaterThan(6)
    for (const link of sources) { expect(link.attributes('href')).toMatch(/^https:\/\//); expect(link.attributes('rel')).toContain('noopener') }
    expect(await DATABASE.studyProgress.count()).toBe(0)
    expect(await DATABASE.attempts.count()).toBe(0)
  })
  it('筛选科目、搜索并自动展开结果；清空及无结果状态可靠', async () => {
    const { wrapper } = await openSyllabus()
    await wrapper.get('select[aria-label="大纲科目筛选"]').setValue('DS')
    expect(wrapper.findAll('.syllabus-subject')).toHaveLength(1)
    await wrapper.get('input[aria-label="搜索大纲学习项目"]').setValue('KMP')
    await settle()
    expect(wrapper.findAll('[data-item]')).toHaveLength(1)
    expect(wrapper.get('[data-item]').attributes('data-item')).toBe('sy-DS-06-d')
    expect(wrapper.get('details.syllabus-chapter').attributes('open')).toBeDefined()
    expect(wrapper.get('[data-item]').text()).toContain('next 或 lps')
    await wrapper.get('input[aria-label="搜索大纲学习项目"]').setValue('不存在的主题abcdef')
    expect(wrapper.findAll('[data-item]')).toHaveLength(0)
    expect(wrapper.text()).toContain('没有符合条件的学习项目')
    await wrapper.get('input[aria-label="搜索大纲学习项目"]').setValue('')
    await wrapper.get('select[aria-label="大纲科目筛选"]').setValue('all')
    expect(wrapper.findAll('[data-item]')).toHaveLength(71)
  })
  it('读取同一Pinia/Dexie学习记录，待学习随现有进度变化而更新', async () => {
    const complete = getItem('sy-DS-01-a'), gap = getItem('sy-DS-06-b')
    await DATABASE.studyProgress.bulkPut([...mastered([...complete.nodeIds, ...gap.nodeIds]).values()])
    const { wrapper, store } = await openSyllabus()
    expect(wrapper.get('[data-item="sy-DS-01-a"]').text()).toContain('关联节点已掌握')
    await wrapper.get('input[aria-label="只看待学习"]').setValue(true)
    expect(wrapper.find('[data-item="sy-DS-01-a"]').exists()).toBe(false)
    expect(wrapper.get('[data-item="sy-DS-06-b"]').text()).toContain('仍需补充')
    expect(wrapper.find('[data-item="sy-CS-05-d"]').exists()).toBe(true)
    await store.saveProgress(complete.nodeIds[0], { status: 'review', manualMastery: false })
    await settle()
    expect(wrapper.get('[data-item="sy-DS-01-a"]').text()).toContain('待复习')
    expect(await DATABASE.studyProgress.count()).toBe(5)
    expect(await DATABASE.attempts.count()).toBe(0)
  })
  it('展开/收起按钮操作当前筛选章节，知识点与推演链接有效', async () => {
    const { wrapper } = await openSyllabus()
    await button(wrapper, '展开全部章节').trigger('click')
    await settle()
    expect(wrapper.findAll('details[open]')).toHaveLength(24)
    await button(wrapper, '收起全部章节').trigger('click')
    await settle()
    expect(wrapper.findAll('details[open]')).toHaveLength(0)
    const item = wrapper.get('[data-item="sy-DS-06-d"]')
    expect(item.findAll('a').map(a => a.attributes('href'))).toContain('/node/DS-04-01-002')
    expect(item.findAll('a').map(a => a.attributes('href'))).toContain('/demos?demo=kmp')
  })
  it('存储读取失败仍可查看静态章纲，不误报未学习，重试可恢复', async () => {
    const table = DATABASE.studyProgress
    vi.spyOn(table, 'toArray').mockRejectedValueOnce(new Error('测试数据库暂不可用'))
    const { wrapper } = await openSyllabus()
    expect(wrapper.get('[role="alert"]').text()).toContain('本地记录不可用')
    expect(wrapper.get('[data-item="sy-DS-01-a"]').text()).toContain('学习记录不可用')
    expect(wrapper.get('input[aria-label="只看待学习"]').attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('.syllabus-subject')).toHaveLength(4)
    await button(wrapper, '重试读取学习记录').trigger('click')
    await settle()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('input[aria-label="只看待学习"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-item="sy-DS-01-a"]').text()).toContain('待学习')
  })
})

describe('大纲与18实验轻量目录的关联', () => {
  it.each([
    ['sy-DS-06-a', 'binary', '折半查找'],
    ['sy-DS-07-a', 'quick', '快速排序'],
    ['sy-DS-07-b', 'heap', '堆排序'],
    ['sy-OS-02-d', 'banker', '银行家安全性检查'],
    ['sy-NET-04-b', 'subnet', 'IPv4 子网划分'],
    ['sy-NET-03-a', 'crc', 'CRC 模 2 除法'],
  ])('%s自动显示新增%s推演入口和准确标题', async (itemId, demoId, title) => {
    const { wrapper } = await openSyllabus()
    const item = wrapper.get('[data-item="' + itemId + '"]')
    const link = item.get('a[href="/demos?demo=' + demoId + '"]')
    expect(link.text()).toBe('推演：' + title + ' →')
    // 验证新增入口确实来自知识点，而非修改旧JSON的推演白名单。
    expect(getItem(itemId).demoNodeIds).toEqual([])
  })

  it('全部18实验都能在相关学习项目找到，每个入口有真实交集且按实验去重', async () => {
    const { wrapper } = await openSyllabus()
    expect(demoIndex).toHaveLength(18)
    const actualIds = new Set<string>()
    for (const item of items) {
      const nodes = new Set([...item.nodeIds, ...item.demoNodeIds])
      const expected = demoIndex.filter(demo => demo.nodeIds.some(id => nodes.has(id)))
      const links = wrapper.get('[data-item="' + item.id + '"]').findAll('.syllabus-demo-links a')
      const hrefs = links.map(link => link.attributes('href'))
      expect(hrefs).toEqual(expected.map(demo => '/demos?demo=' + demo.id))
      expect(new Set(hrefs).size).toBe(hrefs.length)
      for (const link of links) {
        const url = new URL(link.attributes('href')!, 'https://example.test')
        expect(url.searchParams.get('node')).toBeNull()
        const id = url.searchParams.get('demo')!
        const demo = demoIndex.find(demo => demo.id === id)!
        expect(demo).toBeDefined()
        expect(demo.nodeIds.some(node => nodes.has(node)), item.id + ' -> ' + id).toBe(true)
        expect(link.text()).toBe('推演：' + demo.title + ' →')
        actualIds.add(id)
      }
    }
    expect([...actualIds].sort()).toEqual(demoIndex.map(demo => demo.id).sort())
  })

  it('同一实验命中多个关联或旧demo节点时仍只出现一次', async () => {
    const { wrapper } = await openSyllabus()
    const cache = getItem('sy-CS-03-b')
    expect(cache.nodeIds).toContain('CS-03-03-001')
    expect(cache.nodeIds).toContain('CS-03-03-002')
    expect(cache.demoNodeIds).toEqual(['CS-03-03-001', 'CS-03-03-002'])
    expect(wrapper.get('[data-item="sy-CS-03-b"]').findAll('a[href="/demos?demo=cache"]')).toHaveLength(1)
    const bfs = getItem('sy-DS-05-a')
    expect(bfs.nodeIds).toContain('DS-06-03-002')
    expect(bfs.nodeIds).toContain('DS-06-03-003')
    expect(wrapper.get('[data-item="sy-DS-05-a"]').findAll('a[href="/demos?demo=bfs"]')).toHaveLength(1)
    expect(wrapper.get('[data-item="sy-DS-06-d"]').findAll('a[href="/demos?demo=kmp"]')).toHaveLength(1)
  })

  it('分页实验通过跨科关联出现，准确demo深链可直接导航', async () => {
    const { wrapper, router } = await openSyllabus()
    for (const item of ['sy-CS-03-c', 'sy-OS-03-b']) expect(wrapper.get('[data-item="' + item + '"]').findAll('a[href="/demos?demo=address"]')).toHaveLength(1)
    await wrapper.get('[data-item="sy-NET-04-b"] a[href="/demos?demo=subnet"]').trigger('click')
    await settle()
    expect(router.currentRoute.value.path).toBe('/demos')
    expect(router.currentRoute.value.query).toEqual({ demo: 'subnet' })
  })
})

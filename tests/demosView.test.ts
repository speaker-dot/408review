import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import DemosView from '@/views/DemosView.vue'
import { demoIndex } from '@/learning/demoIndex'

const mounted: VueWrapper[] = []
async function settle() {
  await flushPromises()
  await nextTick()
  await flushPromises()
}
async function open(url = '/demos') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/demos', component: DemosView },
      { path: '/node/:id', component: { template: '<main>知识点</main>' } },
      { path: '/syllabus', component: { template: '<main>大纲</main>' } },
    ],
  })
  await router.push(url)
  await router.isReady()
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
  mounted.push(wrapper)
  await settle()
  return { wrapper, router }
}
function button(wrapper: VueWrapper, text: string) {
  const result = wrapper.findAll('button').find(candidate => candidate.text().includes(text))
  if (!result) throw new Error('按钮不存在：' + text)
  return result
}
function field(wrapper: VueWrapper, id: string, key: string) {
  return wrapper.get('[aria-describedby="' + id + '-' + key + '-help"]')
}
async function choose(wrapper: VueWrapper, id: string) {
  const title = demoIndex.find(item => item.id === id)!.title
  const entry = wrapper.findAll('.lab-item').find(item => item.get('strong').text() === title)
  if (!entry) throw new Error('目录实验不存在：' + title)
  await entry.trigger('click')
  await settle()
}
function title(wrapper: VueWrapper) { return wrapper.get('.lab-introduction h2').text() }
function cursor(wrapper: VueWrapper) { return Number(wrapper.get('.lab-step-count').text().split('/')[0].trim()) }
function stateValue(wrapper: VueWrapper, key: string) {
  const item = wrapper.findAll('.lab-state-grid > div').find(entry => entry.get('dt').text() === key)
  if (!item) throw new Error('状态字段不存在：' + key)
  return item.get('dd').text()
}
afterEach(() => {
  mounted.forEach(wrapper => wrapper.unmount())
  mounted.length = 0
})

describe('实验目录真实路由与筛选', () => {
  it('无查询参数默认KMP立即建立轨迹，不出现空输入/空工作区', async () => {
    const { wrapper } = await open()
    expect(title(wrapper)).toBe('KMP 匹配')
    expect(wrapper.findAll('.lab-item')).toHaveLength(18)
    expect((field(wrapper, 'kmp', 'text').element as HTMLInputElement).value).toBe('ABABABACABA')
    expect((field(wrapper, 'kmp', 'pattern').element as HTMLInputElement).value).toBe('ABABACA')
    expect(wrapper.get('.lab-action').text()).toContain('建立 lps')
    expect(cursor(wrapper)).toBe(0)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('OS筛选恰4项，搜索CRC恰1项，空搜索结果有明确提示', async () => {
    const { wrapper } = await open()
    const os = wrapper.get('.lab-subjects').findAll('button').find(item => item.text() === 'OS')!
    await os.trigger('click')
    expect(wrapper.findAll('.lab-item')).toHaveLength(4)
    expect(wrapper.findAll('.lab-item').every(item => item.attributes('data-category') === 'OS')).toBe(true)
    expect(os.attributes('aria-pressed')).toBe('true')
    const all = wrapper.get('.lab-subjects').findAll('button').find(item => item.text() === '全部')!
    await all.trigger('click')
    await wrapper.get('input[aria-label="搜索实验"]').setValue('CRC')
    expect(wrapper.findAll('.lab-item')).toHaveLength(1)
    expect(wrapper.find('.lab-item strong').text()).toBe('CRC 模 2 除法')
    await wrapper.get('input[aria-label="搜索实验"]').setValue('__没有这样的实验__')
    expect(wrapper.findAll('.lab-item')).toHaveLength(0)
    expect(wrapper.get('.lab-empty').text()).toContain('没有匹配实验')
    expect(wrapper.get('.lab-library-heading').text()).toContain('0 / 18')
    await wrapper.get('input[aria-label="搜索实验"]').setValue('   ')
    expect(wrapper.findAll('.lab-item')).toHaveLength(18)
  })

  it('搜索真实知识点ID也可找到跨科关联实验', async () => {
    const { wrapper } = await open()
    await wrapper.get('input[aria-label="搜索实验"]').setValue('OS-03-03-001')
    expect(wrapper.findAll('.lab-item')).toHaveLength(1)
    expect(wrapper.get('.lab-item strong').text()).toBe('分页地址变换')
  })

  it('选择目录写入?demo=且知识点/大纲链接使用真实路由', async () => {
    const { wrapper, router } = await open()
    await choose(wrapper, 'crc')
    expect(router.currentRoute.value.query).toEqual({ demo: 'crc' })
    expect(title(wrapper)).toBe('CRC 模 2 除法')
    const related = wrapper.findAll('.lab-related a').map(link => link.attributes('href'))
    expect(related).toEqual(['/node/NET-03-03-001', '/node/CS-02-01-003'])
    expect(wrapper.get('.lab-syllabus-link').attributes('href')).toBe('/syllabus')
  })

  it('直接?demo=载入指定模型，旧?node=链接映射仍可用', async () => {
    const direct = await open('/demos?demo=page')
    expect(title(direct.wrapper)).toBe('页面置换')
    expect((field(direct.wrapper, 'page', 'policy').element as HTMLSelectElement).value).toBe('LRU')
    expect(direct.wrapper.get('.lab-action').text()).toContain('内存初始为空')
    const legacy = await open('/demos?node=CS-03-03-001')
    expect(title(legacy.wrapper)).toBe('Cache 替换')
    expect((field(legacy.wrapper, 'cache', 'addresses').element as HTMLInputElement).value).toBe('0 32 0 64 32 0')
  })

  it('未知初始实验显示KMP与链接提示，不保留空状态', async () => {
    const { wrapper } = await open('/demos?demo=unknown')
    expect(title(wrapper)).toBe('KMP 匹配')
    expect(wrapper.get('[role="status"]').text()).toContain('没有对应实验')
    expect(wrapper.find('.lab-stage-card').exists()).toBe(true)
  })

  it('同组件导航到未知实验也实际回退KMP，与提示一致', async () => {
    const { wrapper, router } = await open('/demos?demo=cache')
    await button(wrapper, '揭晓下一步').trigger('click')
    await router.push('/demos?demo=unknown')
    await settle()
    expect(title(wrapper)).toBe('KMP 匹配')
    expect(cursor(wrapper)).toBe(0)
    expect(wrapper.get('[role="status"]').text()).toContain('先展示 KMP')
  })
})

describe('推演工作区：回看、dirty与错误隔离', () => {
  it.each([
    ['binary', 'target', '8', '目标', '8'],
    ['page', 'capacity', '4', '页框数', '4'],
    ['subnet', 'prefix', '24', '前缀长度', '24'],
    ['pipeline', 'instructions', '3', '指令数 n', '3'],
  ])('%s数值字段修改后仍满足目录字符串契约并成功运行', async (id, key, input, stateKey, expected) => {
    const { wrapper } = await open('/demos?demo=' + id)
    await field(wrapper, id, key).setValue(input)
    expect(wrapper.text()).toContain('输入已改变')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('.lab-stage-card').exists()).toBe(true)
    expect(stateValue(wrapper, stateKey)).toBe(expected)
    expect(cursor(wrapper)).toBe(0)
  })

  it('数值文本不是表达式，非法值运行后清除旧状态并显示alert', async () => {
    const { wrapper } = await open('/demos?demo=page')
    await field(wrapper, 'page', 'capacity').setValue('1+2')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('.lab-stage-card').exists()).toBe(false)
    await button(wrapper, '恢复示例').trigger('click')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(stateValue(wrapper, '页框数')).toBe('3')
  })

  it('单步/上一步/回到初始状态有界，并清空预测', async () => {
    const { wrapper } = await open('/demos?demo=kmp')
    const initialAction = wrapper.get('.lab-action').text()
    expect(button(wrapper, '上一步').attributes('disabled')).toBeDefined()
    await wrapper.get('.lab-prediction input').setValue('i向前一步')
    await button(wrapper, '揭晓下一步').trigger('click')
    expect(cursor(wrapper)).toBe(1)
    expect((wrapper.get('.lab-prediction input').element as HTMLInputElement).value).toBe('')
    expect(Number(wrapper.get('[role="progressbar"]').attributes('aria-valuenow'))).toBeGreaterThan(0)
    await button(wrapper, '上一步').trigger('click')
    expect(cursor(wrapper)).toBe(0)
    expect(wrapper.get('.lab-action').text()).toBe(initialAction)
    await button(wrapper, '揭晓下一步').trigger('click')
    await button(wrapper, '揭晓下一步').trigger('click')
    await button(wrapper, '回到初始状态').trigger('click')
    expect(cursor(wrapper)).toBe(0)
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('0')
  })

  it('输入改变后提示旧轨迹且禁前后步，重新运行才清dirty', async () => {
    const { wrapper } = await open('/demos?demo=kmp')
    await button(wrapper, '揭晓下一步').trigger('click')
    const action = wrapper.get('.lab-action').text()
    await field(wrapper, 'kmp', 'text').setValue('AAAAA')
    expect(wrapper.text()).toContain('输入已改变，请重新推演')
    expect(button(wrapper, '揭晓下一步').attributes('disabled')).toBeDefined()
    expect(button(wrapper, '上一步').attributes('disabled')).toBeDefined()
    await button(wrapper, '揭晓下一步').trigger('click')
    expect(cursor(wrapper)).toBe(1)
    expect(wrapper.get('.lab-action').text()).toBe(action)
    await wrapper.get('form').trigger('submit')
    expect(cursor(wrapper)).toBe(0)
    expect(wrapper.text()).not.toContain('输入已改变，请重新推演')
    expect(button(wrapper, '揭晓下一步').attributes('disabled')).toBeUndefined()
  })

  it('非法输入显示alert且移除全部旧阶段/轨迹，恢复示例重新运行', async () => {
    const { wrapper } = await open('/demos?demo=kmp')
    await button(wrapper, '查看完整轨迹').trigger('click')
    expect(wrapper.find('.lab-trace').exists()).toBe(true)
    await field(wrapper, 'kmp', 'text').setValue('你好')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('ASCII')
    expect(wrapper.find('.lab-stage-card').exists()).toBe(false)
    expect(wrapper.find('.lab-trace').exists()).toBe(false)
    await button(wrapper, '恢复示例').trigger('click')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('.lab-stage-card').exists()).toBe(true)
    expect((field(wrapper, 'kmp', 'text').element as HTMLInputElement).value).toBe('ABABABACABA')
    expect(cursor(wrapper)).toBe(0)
    expect(wrapper.find('.lab-trace').exists()).toBe(false)
  })

  it('完整轨迹默认折叠、展开全部步骤，再折叠不影响单步位置', async () => {
    const { wrapper } = await open('/demos?demo=crc')
    expect(wrapper.find('.lab-trace').exists()).toBe(false)
    expect(wrapper.get('.lab-trace-toggle').attributes('aria-expanded')).toBe('false')
    await button(wrapper, '揭晓下一步').trigger('click')
    await button(wrapper, '查看完整轨迹').trigger('click')
    const stepCount = Number(wrapper.get('.lab-step-count').text().split('/')[1].trim()) + 1
    expect(wrapper.findAll('.lab-trace li')).toHaveLength(stepCount)
    expect(wrapper.get('.lab-trace-toggle').attributes('aria-expanded')).toBe('true')
    await button(wrapper, '收起完整轨迹').trigger('click')
    expect(wrapper.find('.lab-trace').exists()).toBe(false)
    expect(cursor(wrapper)).toBe(1)
  })

  it('切换目录与同组件查询参数导航都reset输入、游标和完整轨迹', async () => {
    const { wrapper, router } = await open('/demos?demo=kmp')
    await field(wrapper, 'kmp', 'text').setValue('AAAAA')
    await wrapper.get('form').trigger('submit')
    await button(wrapper, '揭晓下一步').trigger('click')
    await button(wrapper, '查看完整轨迹').trigger('click')
    await choose(wrapper, 'banker')
    expect(title(wrapper)).toBe('银行家安全性检查')
    expect((field(wrapper, 'banker', 'available').element as HTMLInputElement).value).toBe('1 1')
    expect(cursor(wrapper)).toBe(0)
    expect(wrapper.find('.lab-trace').exists()).toBe(false)
    await button(wrapper, '揭晓下一步').trigger('click')
    await router.push('/demos?demo=crc')
    await settle()
    expect(title(wrapper)).toBe('CRC 模 2 除法')
    expect(cursor(wrapper)).toBe(0)
    expect((field(wrapper, 'crc', 'data').element as HTMLInputElement).value).toBe('1010')
    expect(wrapper.get('.lab-action').text()).toContain('生成式最高次数')
  })
})

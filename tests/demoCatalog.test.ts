import { describe, expect, it } from 'vitest'
import contentIndex from '@/content/index.json'
import catalogSource from '@/learning/demoCatalog.ts?raw'
import { buildDemoSteps, parseGraphEdges, parseInteger, parseProcesses } from '@/learning/demoCatalog'
import { demoIndex, demosForNode } from '@/learning/demoIndex'

function inputs(id: string, changes: Record<string, string> = {}) {
  return { ...demoIndex.find(item => item.id === id)!.defaults, ...changes }
}

describe('18实验目录元数据与模型接线', () => {
  it('18个唯一ID、四科分布、真实知识点链接以及字段默认值一致', () => {
    expect(demoIndex).toHaveLength(18)
    expect(new Set(demoIndex.map(item => item.id)).size).toBe(18)
    const counts = { DS: 0, CS: 0, OS: 0, NET: 0 }
    const nodeIds = new Set(contentIndex.nodes.map(node => node.id))
    for (const demo of demoIndex) {
      counts[demo.category]++
      expect(demo.id).toMatch(/^[a-z]+$/)
      expect(demo.title).not.toBe('')
      expect(demo.assumptions).not.toBe('')
      expect(demo.nodeIds.length).toBeGreaterThan(0)
      demo.nodeIds.forEach(id => expect(nodeIds.has(id), demo.id + ' -> ' + id).toBe(true))
      expect(new Set(demo.fields.map(field => field.key)).size).toBe(demo.fields.length)
      expect(Object.keys(demo.defaults).sort()).toEqual(demo.fields.map(field => field.key).sort())
      for (const field of demo.fields) {
        expect(typeof demo.defaults[field.key]).toBe('string')
        if (field.kind === 'select') expect(field.options).toContain(demo.defaults[field.key])
      }
    }
    expect(counts).toEqual({ DS: 7, CS: 3, OS: 4, NET: 4 })
  })

  it.each(demoIndex.map(demo => [demo.id] as const))('%s默认输入可运行、状态有界、快照独立且不污染目录', id => {
    const metadataBefore = JSON.stringify(demoIndex)
    const frozenInputs = Object.freeze(inputs(id))
    const first = buildDemoSteps(id, frozenInputs)
    const second = buildDemoSteps(id, frozenInputs)
    expect(first.length).toBeGreaterThanOrEqual(2)
    expect(first.length).toBeLessThan(500)
    expect(first).toEqual(second)
    for (const step of first) {
      expect(typeof step.action).toBe('string')
      expect(step.action.length).toBeGreaterThan(0)
      expect(Object.keys(step.state).length).toBeGreaterThan(0)
      Object.values(step.state).forEach(value => expect(typeof value).toBe('string'))
      if (step.frames) step.frames.forEach(frame => expect(typeof frame).toBe('string'))
    }
    const key = Object.keys(first[0].state)[0]
    first[0].state[key] = '__test_changed_snapshot__'
    expect(second[0].state[key]).not.toBe('__test_changed_snapshot__')
    expect(buildDemoSteps(id, frozenInputs)).toEqual(second)
    expect(JSON.stringify(demoIndex)).toBe(metadataBefore)
  })

  it('旧node参数可以映射单科与跨科实验，未知节点为空', () => {
    expect(demosForNode('DS-04-01-002').map(demo => demo.id)).toEqual(['kmp'])
    expect(demosForNode('CS-03-03-001').map(demo => demo.id)).toEqual(['cache'])
    expect(demosForNode('OS-03-03-001').map(demo => demo.id)).toEqual(['address'])
    expect(demosForNode('NET-03-03-001').map(demo => demo.id)).toEqual(['crc'])
    expect(demosForNode('__missing__')).toEqual([])
  })
})

describe('目录解析器：不隐式算表达式、不悄悄丢字段', () => {
  it('整数只接受完整十进制，支持符号和首尾空白', () => {
    expect(parseInteger(' 42 ')).toBe(42)
    expect(parseInteger('-1')).toBe(-1)
    expect(parseInteger('0')).toBe(0)
  })

  it.each(['', ' ', '1.5', '1e3', '0x10', '1+2', 'Infinity', 'NaN', '1xyz', '9007199254740993'])(
    '拒绝不是完整安全整数的%s', value => expect(() => parseInteger(value)).toThrow(),
  )

  it('边支持行/分号与逗号，不把空图当非法输入', () => {
    expect(parseGraphEdges('0 1 2;1，2，3\n2,3,4')).toEqual([
      { from: 0, to: 1, weight: 2 }, { from: 1, to: 2, weight: 3 }, { from: 2, to: 3, weight: 4 },
    ])
    expect(parseGraphEdges('')).toEqual([])
  })

  it.each(['0 1', '0 1 2 3', '0 1 x', '0 1 0xFF', Array(17).fill('0 1 1').join('\n')])(
    '拒绝畸形或过多图边%s', value => expect(() => parseGraphEdges(value)).toThrow(),
  )

  it('进程支持确定名称与整数，不提前执行脚本', () => {
    expect(parseProcesses('P1 0 5; task-2,2,3')).toEqual([
      { id: 'P1', arrival: 0, burst: 5 }, { id: 'task-2', arrival: 2, burst: 3 },
    ])
    expect(parseProcesses('')).toEqual([])
  })

  it.each(['P1 0', 'P1 0 5 extra', '1P 0 5', '进程 0 5', 'P1 0.5 5', 'P1 0 Infinity', Array(9).fill('P1 0 1').join('\n')])(
    '拒绝畸形进程行%s', value => expect(() => parseProcesses(value)).toThrow(),
  )

  it('所有下拉策略严格来自元数据，不允许缺失或任意策略', () => {
    for (const demo of demoIndex) {
      for (const field of demo.fields.filter(item => item.kind === 'select')) {
        expect(() => buildDemoSteps(demo.id, inputs(demo.id, { [field.key]: '__bad_policy__' }))).toThrow()
        const missing = inputs(demo.id)
        delete missing[field.key]
        expect(() => buildDemoSteps(demo.id, missing)).toThrow()
      }
    }
  })

  it('任何缺失/非字符串/超长字段都在模型执行前拒绝', () => {
    expect(() => buildDemoSteps('kmp', {})).toThrow()
    expect(() => buildDemoSteps('kmp', { text: 123, pattern: 'A' } as unknown as Record<string, string>)).toThrow()
    expect(() => buildDemoSteps('kmp', inputs('kmp', { text: 'A'.repeat(6001) }))).toThrow()
    expect(() => buildDemoSteps('unknown', {})).toThrow('未知')
  })

  it.each(['FCFS', 'SJF'])('%s不使用RR量子，空值/非整数不影响调度', scheduling => {
    expect(buildDemoSteps('scheduling', inputs('scheduling', { policy: scheduling, quantum: '' })).length).toBeGreaterThan(1)
    expect(buildDemoSteps('scheduling', inputs('scheduling', { policy: scheduling, quantum: 'not-a-number' })).length).toBeGreaterThan(1)
  })

  it('RR仍必须验证当前时间片，不因非RR特例跳过', () => {
    expect(() => buildDemoSteps('scheduling', inputs('scheduling', { policy: 'RR', quantum: '' }))).toThrow()
    expect(() => buildDemoSteps('scheduling', inputs('scheduling', { policy: 'RR', quantum: '0' }))).toThrow()
  })

  it.each([
    ['banker', { allocation: '1 0\n0', max: '2 1\n1 2', available: '1 1' }],
    ['banker', { allocation: '2', max: '1', available: '0' }],
    ['banker', { allocation: '', max: '0', available: '0' }],
    ['scheduling', { processes: 'P1 0 1\nP1 1 2' }],
    ['scheduling', { processes: '' }],
    ['bfs', { vertices: '2', edges: '0 2 1' }],
    ['dijkstra', { vertices: '2', edges: '0 1 -1' }],
    ['kruskal', { vertices: '2', edges: '0 0 1' }],
    ['binary', { values: '3 2 1' }],
    ['address', { pageSize: '3' }],
    ['subnet', { prefix: '33' }],
    ['crc', { generator: '1100' }],
    ['arq', { lost: '6' }],
  ] as [string, Record<string, string>][])('%s模型仍校验解析后的维度与语义', (id, changes) => {
    expect(() => buildDemoSteps(id, inputs(id, changes))).toThrow()
  })

  it('输入按纯文本处理，不使用eval或动态Function执行', () => {
    expect(catalogSource).not.toMatch(/\beval\s*\(/)
    expect(catalogSource).not.toMatch(/\bnew\s+Function\s*\(/)
    const global = globalThis as typeof globalThis & { __demoCatalogExecuted?: boolean }
    delete global.__demoCatalogExecuted
    const expression = 'globalThis.__demoCatalogExecuted = true'
    expect(() => buildDemoSteps('binary', inputs('binary', { target: expression }))).toThrow()
    expect(buildDemoSteps('kmp', { text: expression, pattern: 'globalThis' }).length).toBeGreaterThan(1)
    expect(global.__demoCatalogExecuted).toBeUndefined()
  })
})

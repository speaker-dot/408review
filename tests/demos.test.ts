import { describe, expect, it } from 'vitest'
import { cacheSteps, kmpSteps, lpsArray, pageSteps, parseNumbers, tcpSteps } from '@/learning/demos'

describe('推演输入约束', () => {
  it('接受中英文逗号、空格和十六进制，结果保持输入顺序', () => {
    expect(parseNumbers('0，16, 0xFF\n65535')).toEqual([0, 16, 255, 65535])
  })

  it.each(['', '  ', '-1', '1.5', '1e2', '0x', '0xZZ', '65536', 'Infinity', 'NaN', '9007199254740993'])(
    '拒绝无效数列 %s',
    text => expect(() => parseNumbers(text)).toThrow(),
  )

  it('拒绝超出调用方限制的数量', () => {
    expect(() => parseNumbers('1 2 3', 2)).toThrow()
    expect(parseNumbers('1 2', 2)).toEqual([1, 2])
  })
})

describe('KMP 可追溯推演', () => {
  it('lps采用0基真前后缀长度，周期前缀与失配均正确', () => {
    expect(lpsArray('ABABAC')).toEqual([0, 0, 1, 2, 3, 0])
    expect(lpsArray('AAAA')).toEqual([0, 1, 2, 3])
    expect(lpsArray('AABAACAABAA')).toEqual([0, 1, 0, 1, 2, 0, 1, 2, 3, 4, 5])
    expect(lpsArray('')).toEqual([])
  })

  it('完整匹配后仍能找到重叠出现', () => {
    const steps = kmpSteps('AAAAA', 'AAA')
    expect(steps.at(-1)?.state['匹配起点（0 基）']).toBe('0, 1, 2')
    expect(steps.filter(step => step.action.includes('得到完整匹配'))).toHaveLength(3)
    expect(steps.at(-1)?.state['比较次数']).toBe('5')
  })

  it('部分失配时只回退j，不回退主串i', () => {
    const steps = kmpSteps('ABABABAC', 'ABABAC')
    const mismatch = steps.findIndex(step => step.action.includes('i 不动'))
    expect(mismatch).toBeGreaterThan(0)
    expect(steps[mismatch].state['i（下个待比较主串下标）'])
      .toBe(steps[mismatch - 1].state['i（下个待比较主串下标）'])
    expect(Number(steps[mismatch].state['j（已匹配长度）']))
      .toBeLessThan(Number(steps[mismatch - 1].state['j（已匹配长度）']))
    expect(steps.at(-1)?.state['匹配起点（0 基）']).toBe('2')
  })

  it('主串短于模式时扫描结束但没有误报', () => {
    expect(kmpSteps('AB', 'ABCD').at(-1)?.state['匹配起点（0 基）']).toBe('尚无')
  })

  it.each([
    ['', 'A'], ['A', ''], ['A'.repeat(81), 'A'], ['A', 'A'.repeat(31)],
    ['你好', '好'], ['A😀', 'A'], ['A\nB', 'B'],
  ])('拒绝越界或非ASCII主串/模式 %s / %s', (text, pattern) => {
    expect(() => kmpSteps(text, pattern)).toThrow()
  })
})

describe('Cache组相联策略', () => {
  it('命中是否更新替换顺序区分LRU与FIFO', () => {
    const addresses = [0, 32, 0, 64, 32]
    const lru = cacheSteps(addresses, 'LRU')
    const fifo = cacheSteps(addresses, 'FIFO')
    expect(lru.at(-1)?.state['累计命中']).toBe('1')
    expect(fifo.at(-1)?.state['累计命中']).toBe('2')
    expect(lru[4].action).toContain('标记 1')
    expect(fifo[4].action).toContain('标记 0')
    expect(lru.at(-1)?.frames).toEqual(['组0：2 → 1', '组1：空'])
    expect(fifo.at(-1)?.frames).toEqual(['组0：1 → 2', '组1：空'])
    expect(lru.at(-1)?.state['累计访问']).toBe('5')
  })

  it('相同块不同字节命中，映射位数与组号正确', () => {
    const steps = cacheSteps([16, 31, 65535])
    expect(steps[1].state['标记 | 组号 | 偏移']).toBe('0 | 1 | 0')
    expect(steps[2].state['累计命中']).toBe('1')
    expect(steps[3].state['标记 | 组号 | 偏移']).toBe('2047 | 1 | 15')
    expect(steps[3].state['地址（16 位二进制）']).toBe('1111111111111111')
  })

  it.each([-1, 65536, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('拒绝地址 %s', address => {
    expect(() => cacheSteps([address])).toThrow()
  })
})

describe('页面置换轨迹', () => {
  const refs = [1, 2, 3, 2, 4, 1, 2, 5]

  it.each([
    ['FIFO', 7, ['5', '1', '2']],
    ['LRU', 6, ['5', '2', '1']],
    ['OPT', 5, ['5', '2', '4']],
  ] as const)('%s逐次缺页与固定页框位置正确', (policy, faults, frames) => {
    const steps = pageSteps(refs, 3, policy)
    expect(steps.at(-1)?.state['累计缺页']).toBe(String(faults))
    expect(steps.at(-1)?.frames).toEqual(frames)
    expect(steps).toHaveLength(refs.length + 1)
    expect(steps[4].action).toContain('命中')
  })

  it('容量1时同页反复访问只有首次缺页', () => {
    const steps = pageSteps([0, 0, 0], 1, 'LRU')
    expect(steps.at(-1)?.state['累计缺页']).toBe('1')
    expect(steps.at(-1)?.frames).toEqual(['0'])
  })

  it.each([0, 7, 1.5, Number.NaN])('拒绝非法页框数量 %s', capacity => {
    expect(() => pageSteps([1], capacity, 'FIFO')).toThrow()
  })

  it.each([-1, 1.5, Number.NaN])('拒绝非法页号 %s', page => {
    expect(() => pageSteps([page], 3, 'LRU')).toThrow()
  })
})

describe('TCP累计ACK与单段丢失恢复', () => {
  it.each([1, 2, 3, 4, 5, 6, 7])('丢第%d段后不越过缺口，最终交付全部7段', lost => {
    const steps = tcpSteps(lost)
    const acks = steps.map(step => Number(step.state['累计 ACK（下个期望段）']))
    expect(acks.every((ack, index) => index === 0 || ack >= acks[index - 1])).toBe(true)
    const lossAt = steps.findIndex(step => step.action.includes('首次发送丢失'))
    const repairAt = steps.findIndex(step => step.action.startsWith('重传段 '))
    expect(lossAt).toBeGreaterThanOrEqual(0)
    expect(repairAt).toBeGreaterThan(lossAt)
    expect(steps.slice(lossAt, repairAt).every(step =>
      step.state['累计 ACK（下个期望段）'] === String(lost),
    )).toBe(true)
    expect(steps.filter(step => step.action.startsWith('重传段 '))).toHaveLength(1)
    expect(steps.at(-1)?.state['累计 ACK（下个期望段）']).toBe('8')
    expect(steps.at(-1)?.state['接收乱序缓冲']).toBe('空')
    expect(steps.at(-1)?.frames).toEqual(['1 ✓', '2 ✓', '3 ✓', '4 ✓', '5 ✓', '6 ✓', '7 ✓'])
  })

  it.each([1, 2, 3, 4])('丢第%d段时后继足够，三重复ACK触发快重传', lost => {
    const steps = tcpSteps(lost)
    const trigger = steps.find(step => step.action.includes('触发快重传'))
    expect(trigger?.state['重复 ACK 数']).toBe('3')
    expect(steps.some(step => step.action.includes('重传超时'))).toBe(false)
  })

  it.each([5, 6, 7])('尾部第%d段缺失且重复ACK不足，依靠超时', lost => {
    const steps = tcpSteps(lost)
    const trigger = steps.find(step => step.action.includes('等待重传超时'))
    expect(trigger).toBeDefined()
    expect(trigger?.state['重复 ACK 数']).toBe(String(7 - lost))
    expect(steps.some(step => step.action.includes('触发快重传'))).toBe(false)
  })

  it.each([0, 8, 1.5, Number.NaN])('拒绝不在1..7的丢失段 %s', lost => {
    expect(() => tcpSteps(lost)).toThrow()
  })
})

import { describe, expect, it } from 'vitest'
import type { DemoStep } from '@/learning/demos'
import {
  bankerSteps, crcSteps, diskSchedulingSteps, schedulingSteps, slidingWindowSteps, subnetSteps,
  type SchedulingProcess,
} from '@/learning/demos-os-net'

function last(steps: DemoStep[]) { return steps.at(-1)!.state }

describe('CPU调度：非抢占FCFS/SJF与边界明确的RR', () => {
  it('FCFS按到达时间，完整计算周转与等待', () => {
    const processes = [
      { id: 'A', arrival: 0, burst: 6 },
      { id: 'B', arrival: 1, burst: 3 },
      { id: 'C', arrival: 2, burst: 1 },
    ]
    const before = structuredClone(processes)
    const result = last(schedulingSteps(processes, 'FCFS'))
    expect(result['完成时刻']).toBe('A=6, B=9, C=10')
    expect(result['周转时间']).toBe('A=6, B=8, C=8')
    expect(result['等待时间']).toBe('A=0, B=5, C=7')
    expect(result['平均周转']).toBe('22/3 = 7.333')
    expect(result['平均等待']).toBe('12/3 = 4.000')
    expect(processes).toEqual(before)
  })

  it('SJF只比较已就绪进程，不抢占正在运行者', () => {
    const result = last(schedulingSteps([
      { id: 'A', arrival: 0, burst: 7 },
      { id: 'B', arrival: 1, burst: 3 },
      { id: 'C', arrival: 2, burst: 1 },
    ], 'SJF'))
    expect(result['执行时间线']).toBe('A[0,7)，C[7,8)，B[8,11)')
    expect(result['完成时刻']).toBe('A=7, B=11, C=8')
  })

  it('SJF服务时间相同时先到达、再按输入顺序', () => {
    const result = last(schedulingSteps([
      { id: 'first', arrival: 0, burst: 2 },
      { id: 'second', arrival: 0, burst: 2 },
      { id: 'later', arrival: 1, burst: 2 },
    ], 'SJF'))
    expect(result['执行时间线']).toBe('first[0,2)，second[2,4)，later[4,6)')
  })

  it('RR量子末恰到达的任务先入队，不被旧任务插队', () => {
    const steps = schedulingSteps([
      { id: 'A', arrival: 0, burst: 4 },
      { id: 'B', arrival: 2, burst: 1 },
    ], 'RR', 2)
    const firstSlice = steps.find(s => s.action.startsWith('A执行'))!
    expect(firstSlice.state['就绪队列']).toBe('B(剩余1) → A(剩余2)')
    expect(last(steps)['执行时间线']).toBe('A[0,2)，B[2,3)，A[3,5)')
    expect(last(steps)['完成时刻']).toBe('A=5, B=3')
  })

  it('RR不足一个量子立即完成，不凭空补足空转时间', () => {
    const result = last(schedulingSteps([
      { id: 'A', arrival: 0, burst: 5 },
      { id: 'B', arrival: 0, burst: 3 },
    ], 'RR', 2))
    expect(result['完成时刻']).toBe('A=8, B=7')
    expect(result['执行时间线']).toBe('A[0,2)，B[2,4)，A[4,6)，B[6,7)，A[7,8)')
  })

  it('没有到达任务时记录CPU空闲，最后一个完成即停止', () => {
    const result = last(schedulingSteps([
      { id: 'A', arrival: 5, burst: 2 },
      { id: 'B', arrival: 7, burst: 1 },
    ], 'FCFS'))
    expect(result['执行时间线']).toBe('空闲[0,5)，A[5,7)，B[7,8)')
    expect(result['等待时间']).toBe('A=0, B=0')
  })

  it.each([
    { id: '', arrival: 0, burst: 1 },
    { id: 'A', arrival: -1, burst: 1 },
    { id: 'A', arrival: Number.NaN, burst: 1 },
    { id: 'A', arrival: Number.MAX_SAFE_INTEGER + 1, burst: 1 },
    { id: 'A', arrival: 0, burst: 0 },
    { id: 'A', arrival: 0, burst: 1.5 },
    { id: 'A', arrival: 0, burst: 51 },
  ])('拒绝无效进程%j', process => expect(() => schedulingSteps([process], 'FCFS')).toThrow())

  it.each([0, -1, 1.5, Number.NaN, 51])('拒绝量子%s', quantum => {
    expect(() => schedulingSteps([{ id: 'A', arrival: 0, burst: 1 }], 'RR', quantum)).toThrow()
  })

  it('限制数量、重复ID与非法策略', () => {
    expect(() => schedulingSteps([], 'FCFS')).toThrow()
    expect(() => schedulingSteps(Array.from({ length: 9 }, (_, i) => ({ id: String(i), arrival: 0, burst: 1 })), 'FCFS')).toThrow()
    expect(() => schedulingSteps([{ id: 'A', arrival: 0, burst: 1 }, { id: 'A', arrival: 1, burst: 1 }], 'FCFS')).toThrow()
    expect(() => schedulingSteps([{ id: 'A', arrival: 0, burst: 1 }], 'OTHER' as 'FCFS')).toThrow()
    expect(() => schedulingSteps([null] as unknown as SchedulingProcess[], 'FCFS')).toThrow()
  })
})

describe('银行家安全性：逐向量Work回收', () => {
  it('经典多类资源例题，中间Work和稳定安全序列正确', () => {
    const allocation = [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]]
    const max = [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]]
    const available = [3, 3, 2]
    const originals = structuredClone({ allocation, max, available })
    const steps = bankerSteps(allocation, max, available)
    expect(steps[0].state.Work).toBe('(3, 3, 2)')
    expect(steps[0].state.Finish).toBe('P0=false, P1=false, P2=false, P3=false, P4=false')
    const p1 = steps.find(s => s.action.startsWith('模拟P1完成'))!
    expect(p1.state.Work).toBe('(5, 3, 2)')
    expect(last(steps)['安全序列']).toBe('P1 → P3 → P4 → P0 → P2')
    expect(last(steps).Work).toBe('(10, 5, 7)')
    expect(last(steps)['结论']).toBe('安全')
    expect({ allocation, max, available }).toEqual(originals)
  })

  it('没有可先完成者则停止，并注明不安全不等于当前死锁', () => {
    const result = last(bankerSteps([[1], [1]], [[2], [2]], [0]))
    expect(result['安全序列']).toBe('尚无')
    expect(result.Work).toBe('(0)')
    expect(result['结论']).toBe('不安全（不等同已发生死锁）')
  })

  it('仅部分进程能完成时保留该前缀，而非误报全安全', () => {
    const result = last(bankerSteps([[1], [1], [1]], [[1], [3], [3]], [0]))
    expect(result['安全序列']).toBe('P0')
    expect(result.Work).toBe('(1)')
    expect(result.Finish).toBe('P0=true, P1=false, P2=false')
    expect(result['结论']).toContain('不安全')
  })

  it('Need零、资源量零是合法边界，不会无限循环', () => {
    const result = last(bankerSteps([[0], [0]], [[0], [0]], [0]))
    expect(result['安全序列']).toBe('P0 → P1')
    expect(result.Work).toBe('(0)')
    expect(result['结论']).toBe('安全')
  })

  it.each([
    { allocation: [], max: [], available: [1] },
    { allocation: [[0]], max: [[0]], available: [] },
    { allocation: [[0]], max: [[0], [0]], available: [1] },
    { allocation: [[0, 0]], max: [[0, 0]], available: [1] },
    { allocation: [[0]], max: [[0, 0]], available: [1] },
    { allocation: [[2]], max: [[1]], available: [0] },
    { allocation: [[-1]], max: [[1]], available: [0] },
    { allocation: [[0]], max: [[Number.NaN]], available: [0] },
    { allocation: [[0]], max: [[1]], available: [0.5] },
    { allocation: [[0]], max: [[1]], available: [Number.MAX_SAFE_INTEGER + 1] },
    { allocation: [[0, 0, 0, 0, 0]], max: [[0, 0, 0, 0, 0]], available: [1, 1, 1, 1, 1] },
  ])('拒绝非法矩阵/向量 %j', ({ allocation, max, available }) => {
    expect(() => bankerSteps(allocation, max, available)).toThrow()
  })
})

describe('磁盘：SCAN真触边、SSTF稳定同距', () => {
  it.each([
    ['FCFS', 'up', 290, '50 → 60 → 180 → 20'],
    ['SSTF', 'up', 210, '50 → 60 → 20 → 180'],
    ['SCAN', 'up', 328, '50 → 60 → 180 → 199 → 20'],
    ['SCAN', 'down', 230, '50 → 20 → 0 → 60 → 180'],
  ] as const)('%s方向%s累计移动正确', (strategy, direction, total, route) => {
    const input = [60, 180, 20]
    const result = last(diskSchedulingSteps(input, 50, strategy, direction))
    expect(result['累计寻道距离']).toBe(String(total))
    expect(result['路线']).toBe(route)
    expect(result['待处理请求']).toBe('空')
    expect(input).toEqual([60, 180, 20])
  })

  it('反向无请求时，最后一次服务后不追加到端点', () => {
    const result = last(diskSchedulingSteps([60, 180], 50, 'SCAN', 'up'))
    expect(result['路线']).toBe('50 → 60 → 180')
    expect(result['累计寻道距离']).toBe('130')
  })

  it('当前方向暂无请求但反向还有，仍须先触边才转向', () => {
    const result = last(diskSchedulingSteps([20, 10], 50, 'SCAN', 'up'))
    expect(result['路线']).toBe('50 → 199 → 20 → 10')
    expect(result['累计寻道距离']).toBe('338')
  })

  it('SSTF距离平局选较小柱面，重复柱面请求保留', () => {
    expect(last(diskSchedulingSteps([60, 40], 50, 'SSTF', 'up'))['已服务请求']).toBe('40, 60')
    const result = last(diskSchedulingSteps([50, 50, 60], 50, 'FCFS', 'up'))
    expect(result['已服务请求']).toBe('50, 50, 60')
    expect(result['累计寻道距离']).toBe('10')
  })

  it.each([-1, 200, Number.NaN, 1.5, Number.MAX_SAFE_INTEGER + 1])('拒绝柱面%s', request => {
    expect(() => diskSchedulingSteps([request], 50, 'FCFS', 'up')).toThrow()
  })

  it('拒绝空/过多请求、不合法磁头、方向及策略', () => {
    expect(() => diskSchedulingSteps([], 50, 'SCAN', 'up')).toThrow()
    expect(() => diskSchedulingSteps(Array(31).fill(1), 50, 'SCAN', 'up')).toThrow()
    expect(() => diskSchedulingSteps([1], Number.NaN, 'SCAN', 'up')).toThrow()
    expect(() => diskSchedulingSteps([1], 50, 'SCAN', 'left' as 'up')).toThrow()
    expect(() => diskSchedulingSteps([1], 50, 'OTHER' as 'SCAN', 'up')).toThrow()
    expect(() => diskSchedulingSteps([1], 0, 'SCAN', 'up', 1000)).toThrow()
  })
})

describe('CIDR按无符号位运算划分，不滥用n减2', () => {
  it('/26普通子网与中间二进制状态', () => {
    const steps = subnetSteps('192.168.10.77', 26), result = last(steps)
    expect(steps[1].state['掩码二进制']).toBe('11111111.11111111.11111111.11000000')
    expect(steps[2].state['AND结果二进制']).toBe('11000000.10101000.00001010.01000000')
    expect(result['掩码']).toBe('255.255.255.192')
    expect(result['网络前缀地址']).toBe('192.168.10.64')
    expect(result['广播地址']).toBe('192.168.10.127')
    expect(result['可用主机数（模型）']).toBe('62')
    expect(result['主机范围（模型）']).toBe('192.168.10.65 – 192.168.10.126')
  })

  it('/0避免移位32回绕，并明确理论区间不是全部可分配地址', () => {
    const result = last(subnetSteps('200.10.20.30', 0))
    expect(result['掩码']).toBe('0.0.0.0')
    expect(result['网络前缀地址']).toBe('0.0.0.0')
    expect(result['地址块末地址']).toBe('255.255.255.255')
    expect(result['地址块总数']).toBe('4294967296')
    expect(result['可用主机数（模型）']).toBe('4294967294')
    expect(result['语义']).toContain('理论范围')
  })

  it('/31仅在点到点语义下两个地址都是端点', () => {
    const result = last(subnetSteps('192.0.2.11', 31))
    expect(result['掩码']).toBe('255.255.255.254')
    expect(result['网络前缀地址']).toBe('192.0.2.10')
    expect(result['地址块末地址']).toBe('192.0.2.11')
    expect(result['可用主机数（模型）']).toBe('2')
    expect(result['广播地址']).toBe('无子网定向广播')
    expect(result['语义']).toContain('点到点')
  })

  it('/32保留唯一地址，不算成负主机数', () => {
    const result = last(subnetSteps('203.0.113.7', 32))
    expect(result['掩码']).toBe('255.255.255.255')
    expect(result['网络前缀地址']).toBe('203.0.113.7')
    expect(result['主机范围（模型）']).toBe('203.0.113.7 – 203.0.113.7')
    expect(result['可用主机数（模型）']).toBe('1')
    expect(result['广播地址']).toBe('无子网定向广播')
  })

  it('高位为1的地址不会输出负数，/30排除两端', () => {
    const result = last(subnetSteps('255.254.253.250', 30))
    expect(result['网络前缀地址']).toBe('255.254.253.248')
    expect(result['地址块末地址']).toBe('255.254.253.251')
    expect(result['主机范围（模型）']).toBe('255.254.253.249 – 255.254.253.250')
    expect(result['可用主机数（模型）']).toBe('2')
  })

  it.each(['', '1.2.3', '1.2.3.4.5', '256.2.3.4', '-1.2.3.4', '01.2.3.4', '0x10.2.3.4', '1.2.3.4/24', 'a.b.c.d'])('拒绝IP%s', ip => {
    expect(() => subnetSteps(ip, 24)).toThrow()
  })

  it.each([-1, 33, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('拒绝前缀%s', prefix => {
    expect(() => subnetSteps('192.0.2.1', prefix)).toThrow()
  })
})

function independentRemainder(data: string, generator: string): string {
  let word = parseInt(data + '0'.repeat(generator.length - 1), 2)
  const polynomial = parseInt(generator, 2)
  for (let bit = data.length + generator.length - 2; bit >= generator.length - 1; bit--) {
    if (word & (1 << bit)) word ^= polynomial << (bit - generator.length + 1)
  }
  return word.toString(2).padStart(generator.length - 1, '0')
}

describe('CRC模2长除：补零、局部异或与码字复验', () => {
  it('1010/1101中间步骤与余数001正确', () => {
    const steps = crcSteps('1010', '1101')
    expect(steps[0].state['补零被除数']).toBe('1010000')
    expect(steps[1].state['异或前局部']).toBe('1010')
    expect(steps[1].state['异或后局部']).toBe('0111')
    expect(steps[1].state['当前余式']).toBe('0111000')
    expect(last(steps)['余数']).toBe('001')
    expect(last(steps)['发送码字']).toBe('1010001')
    expect(last(steps)['码字验证余数']).toBe('000')
  })

  it('零数据保持固定r位零余数', () => {
    const result = last(crcSteps('0000', '10011'))
    expect(result['余数']).toBe('0000')
    expect(result['发送码字']).toBe('00000000')
    expect(result['码字验证余数']).toBe('0000')
  })

  it('与独立整数长除交叉验证全部8位数据，包含前导零', () => {
    for (let data = 0; data < 256; data++) {
      const bits = data.toString(2).padStart(8, '0')
      const result = last(crcSteps(bits, '1101'))
      expect(result['余数']).toBe(independentRemainder(bits, '1101'))
      expect(result['码字验证余数']).toBe('000')
    }
  })

  it('允许最高输入上界，但快照数与输出长度有界', () => {
    const steps = crcSteps('1'.repeat(64), '1' + '0'.repeat(15) + '1')
    expect(steps.length).toBeLessThanOrEqual(66)
    expect(last(steps)['发送码字']).toHaveLength(80)
    expect(last(steps)['码字验证余数']).toHaveLength(16)
  })

  it.each(['', '1020', '1 0', '1'.repeat(65)])('拒绝数据%s', data => {
    expect(() => crcSteps(data, '1101')).toThrow()
  })

  it.each(['', '1', '01', '1100', '1x1', '1' + '0'.repeat(16) + '1'])('拒绝生成式%s', generator => {
    expect(() => crcSteps('1010', generator)).toThrow()
  })
})

describe('滑动窗口教学事件：GBN丢弃后继，SR缓存后继', () => {
  it.each([0, 1, 2, 3, 4, 5])('GBN丢首次帧%d，超时重传已发未确认后缀', lost => {
    const steps = slidingWindowSteps('GBN', lost), result = last(steps)
    expect(result['已上交序列']).toBe('0, 1, 2, 3, 4, 5')
    expect(result['接收方下个期望']).toBe('6')
    expect(result['总发送帧次数']).toBe(String(6 + Math.min(3, 6 - lost)))
    expect(result['重传帧次数']).toBe(String(Math.min(3, 6 - lost)))
    expect(steps.every(s => s.state['接收乱序缓存'] === '空')).toBe(true)
    expect(steps.find(s => s.action.includes('最早未确认帧超时'))).toBeDefined()
    expect(result['发送窗口']).toBe('全部确认')
  })

  it.each([0, 1, 2, 3, 4, 5])('SR丢首次帧%d，只重传一帧且最终按序交付', lost => {
    const steps = slidingWindowSteps('SR', lost), result = last(steps)
    expect(result['已上交序列']).toBe('0, 1, 2, 3, 4, 5')
    expect(result['总发送帧次数']).toBe('7')
    expect(result['重传帧次数']).toBe('1')
    expect(result['接收乱序缓存']).toBe('空')
    expect(steps.find(s => s.action.includes('只选择重传缺失帧' + lost))).toBeDefined()
  })

  it('丢0时GBN后继1/2不能上交，SR缓存但也不提前上交', () => {
    const gbn = slidingWindowSteps('GBN', 0), sr = slidingWindowSteps('SR', 0)
    const discard = gbn.find(s => s.action.includes('帧2乱序到达'))!
    expect(discard.state['接收方下个期望']).toBe('0')
    expect(discard.state['已上交序列']).toBe('尚无')
    const buffered = sr.find(s => s.action.startsWith('首次发送帧2被接收'))!
    expect(buffered.state['接收乱序缓存']).toBe('1, 2')
    expect(buffered.state['已上交序列']).toBe('尚无')
    const fill = sr.find(s => s.action.startsWith('重传帧0被接收'))!
    expect(fill.state['已上交序列']).toBe('0, 1, 2')
    expect(fill.state['接收方下个期望']).toBe('3')
  })

  it.each([-1, 6, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('拒绝非法首次丢失帧号%s', lost => {
    expect(() => slidingWindowSteps('GBN', lost)).toThrow()
  })

  it('拒绝协议未知值，输出明确标注教学模型', () => {
    expect(() => slidingWindowSteps('TCP' as 'SR', 0)).toThrow()
    expect(slidingWindowSteps('SR', 0)[0].state['模型']).toContain('不是完整协议仿真')
  })
})

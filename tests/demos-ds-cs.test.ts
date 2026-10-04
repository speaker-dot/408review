import { describe, expect, it } from 'vitest'
import {
  addressTranslationSteps, binarySearchSteps, graphSteps, heapSortSteps,
  pipelineSteps, quickSortSteps, type Edge, type GraphDemoKind,
} from '@/learning/demos-ds-cs'
import type { DemoStep } from '@/learning/demos'

const numbers = (text: string): number[] => text.split(', ').map(Number)
const last = (steps: DemoStep[]) => steps[steps.length - 1]
const inputCases = [[0], [65535], [2, 2, 2, 2], [0, 3, 0, 3], [9, 7, 5, 3, 1], [1, 2, 3, 4, 5], [7, 2, 9, 0, 7, 5, 1]]

function expectHeap(a: number[], size: number): void {
  for (let i = 1; i < size; i++) expect(a[Math.floor((i - 1) / 2)]).toBeGreaterThanOrEqual(a[i])
}

describe('折半查找：闭区间与重复值约定', () => {
  it.each([
    [[0, 2, 5, 7, 9], 0, 0], [[0, 2, 5, 7, 9], 9, 4],
    [[0], 0, 0], [[65535], 65535, 0], [[0, 0, 5, 5], 0, 1],
  ])('在 %j 中查找 %s，返回 %s', (a, target, result) => {
    expect(last(binarySearchSteps(a as number[], target as number)).state['结果']).toBe(String(result))
  })

  it.each([1, 4, 10])('缺失目标 %s 必须缩成空区间而非越界读取', target => {
    const steps = binarySearchSteps([2, 3, 7, 9], target)
    expect(last(steps).state['结果']).toBe('未找到')
    expect(Number(last(steps).state.low)).toBeGreaterThan(Number(last(steps).state.high))
    expect(last(steps).state['候选区间']).toBe('空')
  })

  it('每次比较取区间下中点，下一步排除中点本身', () => {
    const steps = binarySearchSteps([1, 3, 5, 7, 9, 11, 13, 15], 12)
    steps.forEach((step, index) => {
      if (!step.action.startsWith('比较 a[')) return
      const lo = Number(step.state.low), hi = Number(step.state.high), mid = Number(step.state['本次中点'])
      expect(mid).toBe(Math.floor((lo + hi) / 2))
      const value = numbers(step.state['数组'])[mid], next = steps[index + 1]
      if (value < 12) expect(Number(next.state.low)).toBe(mid + 1)
      else expect(Number(next.state.high)).toBe(mid - 1)
    })
    expect(last(steps).state['比较次数']).toBe('3')
  })

  it('允许非递减重复输入，但拒绝未排序输入和非法目标', () => {
    expect(() => binarySearchSteps([1, 0], 0)).toThrow(/非递减/)
    for (const target of [-1, 65536, 1.5, NaN, Infinity]) expect(() => binarySearchSteps([0], target)).toThrow()
  })
})

describe('排序模型：输入约束与快照隔离', () => {
  it.each([quickSortSteps, heapSortSteps])('%s 返回排序结果且不修改调用方数组', sort => {
    for (const original of inputCases) {
      const a = [...original], steps = sort(a)
      expect(numbers(last(steps).state['数组'])).toEqual([...original].sort((x, y) => x - y))
      expect(a).toEqual(original)
      a[0] = 1234
      expect(steps[0].state['数组']).toBe(original.join(', '))
      expect(new Set(steps.map(s => s.state)).size).toBe(steps.length)
      expect(new Set(steps.map(s => s.frames)).size).toBe(steps.length)
      const second = [...steps[1].frames!]
      steps[0].frames![0] = '改动一张快照'
      expect(steps[1].frames).toEqual(second)
    }
  })

  it.each([binarySearchSteps, quickSortSteps, heapSortSteps])('%s 拒绝空数组、超过16项或非法元素', algorithm => {
    for (const a of [[], Array(17).fill(0), [-1], [65536], [1.5], [NaN], [Infinity], [Number.MAX_SAFE_INTEGER], Array(2)]) {
      expect(() => algorithm(a, 0)).toThrow()
    }
    expect(() => algorithm([0, 65535], 0)).not.toThrow()
  })

  it('16项边界输入可用，所有确定性样本快速排序与堆排序一致', () => {
    let seed = 31
    for (let n = 1; n <= 16; n++) {
      for (let trial = 0; trial < 6; trial++) {
        const a = Array.from({ length: n }, () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % 17 })
        const expected = [...a].sort((x, y) => x - y)
        expect(numbers(last(quickSortSteps(a)).state['数组'])).toEqual(expected)
        expect(numbers(last(heapSortSteps(a)).state['数组'])).toEqual(expected)
      }
    }
  })
})

describe('首元素枢轴双向挖坑快排', () => {
  it('第一轮枢轴固定为输入首元素，归位后左右分别满足 ≤ 和 ≥', () => {
    const steps = quickSortSteps([7, 2, 9, 0, 7, 5, 1])
    expect(steps.find(s => s.action.startsWith('暂存首元素'))?.state['暂存枢轴']).toBe('7')
    const first = steps.find(s => s.action.startsWith('i=j='))!
    expect(first.action).toContain('i=j=5')
    expect(numbers(first.state['数组'])).toEqual([1, 2, 5, 0, 7, 7, 9])
    for (const step of steps.filter(s => s.action.startsWith('i=j='))) {
      const match = step.action.match(/^i=j=(\d+)，枢轴 (\d+)/)!, p = Number(match[1]), pivot = Number(match[2])
      const range = step.state['当前分区'].match(/\d+/g)!.map(Number), a = numbers(step.state['数组'])
      expect(a[p]).toBe(pivot)
      expect(a.slice(range[0], p).every(v => v <= pivot)).toBe(true)
      expect(a.slice(p + 1, range[1] + 1).every(v => v >= pivot)).toBe(true)
    }
  })

  it('坑位与暂存枢轴共同守恒，不把搬移后的临时重复视为多出元素', () => {
    const a = [8, 1, 9, 0, 5, 5], sorted = [...a].sort((x, y) => x - y)
    for (const step of quickSortSteps(a)) {
      const visible = step.state['数组'].split(', ').filter(v => v !== '□').map(Number)
      if (step.state['坑位'] !== '无') {
        expect(step.state['暂存枢轴']).not.toBe('无')
        visible.push(Number(step.state['暂存枢轴']))
      }
      expect(visible.sort((x, y) => x - y)).toEqual(sorted)
    }
  })

  it('全部相等也移动右指针并终止；每次非空分区恰好固定一个枢轴', () => {
    const steps = quickSortSteps(Array(16).fill(0))
    expect(steps.filter(s => s.action.startsWith('i=j='))).toHaveLength(15)
    expect(numbers(last(steps).state['数组'])).toEqual(Array(16).fill(0))
    expect(numbers(last(steps).state['已固定下标'])).toEqual(Array.from({ length: 16 }, (_, i) => i))
    expect(steps.length).toBeLessThan(200)
  })
})

describe('最大堆排序：建堆与下沉', () => {
  it('先建立最大堆，每轮恢复堆关系，堆外后缀有序并逐步固定', () => {
    const steps = heapSortSteps([4, 1, 3, 2, 9, 0])
    const built = steps.find(s => s.action.startsWith('最大堆已建立'))!
    expect(numbers(built.state['数组'])).toEqual([9, 4, 3, 2, 1, 0])
    for (const step of steps) {
      const a = numbers(step.state['数组']), size = Number(step.state['堆大小'])
      if (step.action.startsWith('最大堆已建立') || step.action.startsWith('本轮下沉结束')) expectHeap(a, size)
      const suffix = a.slice(size)
      expect(suffix).toEqual([...suffix].sort((x, y) => x - y))
      if (size > 0 && suffix.length) expect(Math.max(...a.slice(0, size))).toBeLessThanOrEqual(suffix[0])
    }
    expect(last(steps).state['堆大小']).toBe('0')
  })

  it('孩子等大时选左孩子；父结点相等时不继续交换', () => {
    const steps = heapSortSteps([1, 5, 5])
    expect(steps.find(s => s.action.startsWith('比较孩子'))?.state['较大孩子']).toBe('1')
    const equal = heapSortSteps([0, 0, 0])
    expect(equal.filter(s => s.state['阶段'] === '建堆' && s.action.startsWith('交换 a['))).toHaveLength(0)
  })
})

const tiedGraph: Edge[] = [
  { from: 2, to: 0, weight: 2 }, { from: 0, to: 1, weight: 2 },
  { from: 2, to: 1, weight: 0 }, { from: 1, to: 3, weight: 3 },
  { from: 2, to: 3, weight: 3 }, { from: 3, to: 4, weight: 1 },
]

describe('无向图：输入、确定性及快照', () => {
  it.each(['bfs', 'dijkstra', 'kruskal'] as const)('%s 允许空边、孤立点和平行边，不修改输入', kind => {
    const a = tiedGraph.map(e => ({ ...e })), original = structuredClone(a)
    const steps = graphSteps(5, a, kind)
    expect(a).toEqual(original)
    const algorithmTrace = (trace: DemoStep[]) => trace.map(s => ({ ...s, state: { ...s.state, '边': '' } }))
    // 初始边列表按输入顺序展示；真正扫描/选择的算法步骤与输入排列无关。
    expect(algorithmTrace(graphSteps(5, [...a].reverse(), kind))).toEqual(algorithmTrace(steps))
    expect(() => graphSteps(1, [], kind)).not.toThrow()
    expect(() => graphSteps(8, [], kind)).not.toThrow()
    expect(() => graphSteps(2, [{ from: 0, to: 1, weight: 0 }, { from: 1, to: 0, weight: 3 }], kind)).not.toThrow()
    expect(new Set(steps.map(s => s.state)).size).toBe(steps.length)
    expect(new Set(steps.map(s => s.frames)).size).toBe(steps.length)
    a[0].weight = 65535
    expect(last(steps).state['边']).not.toContain('65535')
  })

  it('统一规范边端点，算法相同输入重复推演完全一致', () => {
    for (const kind of ['bfs', 'dijkstra', 'kruskal'] as const) {
      expect(graphSteps(5, tiedGraph, kind)).toEqual(graphSteps(5, tiedGraph, kind))
    }
  })

  it('边权和顶点严格上界；拒绝非法模型、自环、缺字段与过量边', () => {
    for (const count of [0, 9, 1.5, NaN]) expect(() => graphSteps(count, [], 'bfs')).toThrow()
    const invalid: Edge[][] = [
      [{ from: -1, to: 1, weight: 0 }], [{ from: 0, to: 2, weight: 0 }],
      [{ from: 0, to: 1, weight: -1 }], [{ from: 0, to: 1, weight: 65536 }],
      [{ from: 0, to: 1, weight: NaN }], [{ from: 0.5, to: 1, weight: 1 }],
      [{ from: 1, to: 1, weight: 0 }], Array(17).fill({ from: 0, to: 1, weight: 0 }),
      [null as unknown as Edge], [{ from: 0, to: 1 } as Edge], Array(2),
    ]
    for (const a of invalid) for (const kind of ['bfs', 'dijkstra', 'kruskal'] as const) expect(() => graphSteps(2, a, kind)).toThrow()
    expect(() => graphSteps(2, [], 'dfs' as GraphDemoKind)).toThrow()
    expect(() => graphSteps(8, Array(16).fill({ from: 0, to: 7, weight: 65535 }), 'dijkstra')).not.toThrow()
  })
})

describe('BFS 森林：发现即入队，不按权值找最短路', () => {
  it('邻接点升序、同层队列顺序和前驱确定', () => {
    const steps = graphSteps(5, tiedGraph, 'bfs')
    expect(last(steps).state['出队顺序']).toBe('0, 1, 2, 3, 4')
    expect(last(steps).state['前驱（根用 -1）']).toBe('-1, 0, 0, 1, 3')
    expect(last(steps).state['到本分量根的边数（未发现用 -1）']).toBe('0, 1, 1, 2, 3')
    for (const step of steps) {
      const q = step.state['队列（队头在左）']
      if (q !== '空') expect(new Set(q.split(' → ')).size).toBe(q.split(' → ').length)
    }
  })

  it('非连通图从最小未访问顶点续建森林，重复边不会重复出队', () => {
    const steps = graphSteps(5, [{ from: 0, to: 1, weight: 0 }, { from: 1, to: 0, weight: 0 }, { from: 3, to: 4, weight: 1 }], 'bfs')
    expect(last(steps).state['森林根']).toBe('0, 2, 3')
    expect(last(steps).state['出队顺序']).toBe('0, 1, 2, 3, 4')
    expect(last(steps).state['到本分量根的边数（未发现用 -1）']).toBe('0, 1, 0, 0, 1')
    expect(last(graphSteps(3, [], 'bfs')).state['森林根']).toBe('0, 1, 2')
  })

  it('直接重边在 BFS 只算一条边，Dijkstra 才按权值松弛', () => {
    const edges = [{ from: 0, to: 2, weight: 99 }, { from: 0, to: 1, weight: 1 }, { from: 1, to: 2, weight: 1 }]
    expect(last(graphSteps(3, edges, 'bfs')).state['到本分量根的边数（未发现用 -1）']).toBe('0, 1, 1')
    expect(last(graphSteps(3, edges, 'dijkstra')).state['距离（按顶点顺序）']).toBe('0, 1, 2')
  })
})

describe('Dijkstra：非负权、确定与松弛分开', () => {
  it('等距先确定小顶点，相等候选路径不改已记录前驱', () => {
    const steps = graphSteps(5, tiedGraph, 'dijkstra')
    expect(last(steps).state['距离（按顶点顺序）']).toBe('0, 2, 2, 5, 6')
    expect(last(steps).state['确定顺序']).toBe('0, 1, 2, 3, 4')
    expect(last(steps).state['前驱（源点/不可达用 -1）']).toBe('-1, 0, 0, 1, 3')
    const settled = new Map<number, number>()
    for (const step of steps) {
      const d = step.state['距离（按顶点顺序）'].split(', ').map(v => v === '∞' ? Infinity : Number(v))
      for (const [v, distance] of settled) expect(d[v]).toBe(distance)
      if (step.action.startsWith('选中顶点')) settled.set(Number(step.state['当前顶点']), d[Number(step.state['当前顶点'])])
    }
  })

  it('零权边可用；未发现有限距离不能提前宣称不可达', () => {
    const steps = graphSteps(4, [{ from: 0, to: 1, weight: 0 }, { from: 1, to: 2, weight: 0 }], 'dijkstra')
    expect(steps[0].state['不可达顶点']).toBe('尚未判定')
    expect(last(steps).state['距离（按顶点顺序）']).toBe('0, 0, 0, ∞')
    expect(last(steps).state['不可达顶点']).toBe('3')
    expect(last(steps).state['确定顺序']).toBe('0, 1, 2')
    expect(last(graphSteps(3, [], 'dijkstra')).state['距离（按顶点顺序）']).toBe('0, ∞, ∞')
  })

  it('平行边取较短有效路径，距离允许超过单条边上界', () => {
    const edges = [{ from: 0, to: 1, weight: 5 }, { from: 1, to: 0, weight: 1 }, { from: 1, to: 2, weight: 65535 }]
    expect(last(graphSteps(3, edges, 'dijkstra')).state['距离（按顶点顺序）']).toBe('0, 1, 65536')
  })
})

describe('Kruskal：确定性最小生成森林', () => {
  it('按权重/端点处理，零权先选，形成环的边明确舍弃', () => {
    const steps = graphSteps(5, tiedGraph, 'kruskal')
    expect(last(steps).state['已选边']).toBe('1—2(0), 3—4(1), 0—1(2), 1—3(3)')
    expect(last(steps).state['总权值']).toBe('6')
    expect(last(steps).state['连通分量数']).toBe('1')
    expect(steps.some(s => s.action.includes('舍弃边 0—2(2)'))).toBe(true)
  })

  it('非连通和全孤立图不能误称全图生成树，重复边判环', () => {
    const steps = graphSteps(5, [{ from: 0, to: 1, weight: 0 }, { from: 1, to: 0, weight: 0 }, { from: 3, to: 4, weight: 2 }], 'kruskal')
    expect(last(steps).state['已选边']).toBe('0—1(0), 3—4(2)')
    expect(last(steps).state['连通分量数']).toBe('3')
    expect(last(steps).action).toContain('不存在覆盖全部顶点的生成树')
    expect(last(graphSteps(3, [], 'kruskal')).state['总权值']).toBe('0')
    expect(last(graphSteps(1, [], 'kruskal')).state['连通分量数']).toBe('1')
  })

  it('3顶点64种图与独立 Floyd 距离及穷举森林最小权值一致', () => {
    const pairs = [[0, 1], [0, 2], [1, 2]]
    for (let config = 0; config < 64; config++) {
      let c = config
      const edges: Edge[] = []
      for (const [from, to] of pairs) { const option = c % 4; c = Math.floor(c / 4); if (option) edges.push({ from, to, weight: option - 1 }) }
      const dist = Array.from({ length: 3 }, (_, i) => Array.from({ length: 3 }, (_, j) => i === j ? 0 : Infinity))
      for (const e of edges) dist[e.from][e.to] = dist[e.to][e.from] = e.weight
      for (let k = 0; k < 3; k++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) dist[i][j] = Math.min(dist[i][j], dist[i][k] + dist[k][j])
      expect(last(graphSteps(3, edges, 'dijkstra')).state['距离（按顶点顺序）']).toBe(dist[0].map(v => v === Infinity ? '∞' : String(v)).join(', '))
      const roots = [0, 1, 2].filter(v => !Array.from({ length: v }, (_, i) => i).some(i => Number.isFinite(dist[i][v])))
      const requiredEdges = 3 - roots.length
      let optimum = Infinity
      for (let mask = 0; mask < (1 << edges.length); mask++) {
        const selected = edges.filter((_, i) => (mask & (1 << i)) !== 0)
        if (selected.length !== requiredEdges) continue
        const reach = Array.from({ length: 3 }, (_, i) => Array.from({ length: 3 }, (_, j) => i === j))
        for (const e of selected) reach[e.from][e.to] = reach[e.to][e.from] = true
        for (let k = 0; k < 3; k++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) reach[i][j] ||= reach[i][k] && reach[k][j]
        if (reach.every((row, i) => row.every((connected, j) => connected === Number.isFinite(dist[i][j])))) optimum = Math.min(optimum, selected.reduce((sum, e) => sum + e.weight, 0))
      }
      const terminal = last(graphSteps(3, edges, 'kruskal'))
      expect(Number(terminal.state['总权值'])).toBe(optimum)
      expect(Number(terminal.state['连通分量数'])).toBe(roots.length)
    }
  })
})

describe('32位页式地址转换：越界与缺页不能混淆', () => {
  it('先分页号/偏移，再替换页号；物理页框0合法', () => {
    const steps = addressTranslationSteps(2 * 4096 + 37, 4096, [5, -1, 0])
    expect(last(steps).state['页号']).toBe('2')
    expect(last(steps).state['页内偏移']).toBe('37')
    expect(last(steps).state['偏移位数']).toBe('12')
    expect(last(steps).state['页号位数']).toBe('20')
    expect(last(steps).state['页框号']).toBe('0')
    expect(last(steps).state['物理字节地址']).toBe('37')
    expect(last(steps).state['状态']).toBe('转换成功')
    expect(last(addressTranslationSteps(4095, 4096, [7])).state['物理字节地址']).toBe(String(7 * 4096 + 4095))
  })

  it('合法页-1触发缺页，超表长触发非法地址，二者都不生成物理地址', () => {
    const fault = addressTranslationSteps(4096, 4096, [0, -1])
    expect(last(fault).state['状态']).toBe('缺页')
    expect(last(fault).state['页框号']).toBe('-1')
    expect(last(fault).state['物理字节地址']).toBe('未生成')
    const invalid = addressTranslationSteps(8192, 4096, [0, -1])
    expect(last(invalid).state['状态']).toBe('非法地址')
    expect(last(invalid).state['页框号']).toBe('未读取')
    expect(last(invalid).state['物理字节地址']).toBe('未生成')
  })

  it('32位地址不使用有符号移位，最大物理地址可准确表示', () => {
    const table = Array(256).fill(0); table[255] = 65535
    const terminal = last(addressTranslationSteps(256 * 65536 - 1, 65536, table))
    expect(terminal.state['物理字节地址']).toBe('4294967295')
    expect(terminal.state['页内偏移']).toBe('65535')
    const high = last(addressTranslationSteps(0xFFFFFFFF, 65536, [0]))
    expect(high.state['虚拟地址（32 位二进制）']).toBe('1'.repeat(32))
    expect(high.state['页号']).toBe('65535')
    expect(high.state['状态']).toBe('非法地址')
    expect(last(addressTranslationSteps(0, 1, [0xFFFFFFFF])).state['物理字节地址']).toBe('4294967295')
    expect(last(addressTranslationSteps(0, 1, [0])).state['偏移位数']).toBe('0')
  })

  it('拒绝非2幂页大小、地址/表上界、非法页框和稀疏表，不改变源页表', () => {
    for (const address of [-1, 0x100000000, 1.5, NaN, Infinity]) expect(() => addressTranslationSteps(address, 4096, [0])).toThrow()
    for (const size of [0, 3, 65537, 131072, 1.5, NaN]) expect(() => addressTranslationSteps(0, size, [0])).toThrow()
    for (const table of [[], Array(257).fill(0), [-2], [1.5], [NaN], [Infinity], [65536], Array(2)]) expect(() => addressTranslationSteps(0, 65536, table)).toThrow()
    const table = [0, 1], steps = addressTranslationSteps(4096, 4096, table)
    expect(table).toEqual([0, 1]); table[1] = 5
    expect(last(steps).state['页框号']).toBe('1')
    expect(new Set(steps.map(s => s.frames)).size).toBe(steps.length)
  })
})

describe('理想等长流水线：每周期阶段位置与完成时机', () => {
  it('3条指令/4阶段共6周期，每周期各前进一步，周期末完成', () => {
    const steps = pipelineSteps(3, 4), cycles = steps.filter(s => /^周期 \d+：/.test(s.action))
    expect(cycles).toHaveLength(6)
    expect(cycles[0].frames).toEqual(['阶段 1：I1', '阶段 2：空闲', '阶段 3：空闲', '阶段 4：空闲'])
    expect(cycles[2].frames).toEqual(['阶段 1：I3', '阶段 2：I2', '阶段 3：I1', '阶段 4：空闲'])
    expect(cycles[3].frames).toEqual(['阶段 1：空闲', '阶段 2：I3', '阶段 3：I2', '阶段 4：I1'])
    expect(cycles.map(s => s.state['已完成指令（周期末）'])).toEqual(['0', '0', '0', '1', '2', '3'])
    expect(last(steps).state['流水耗时']).toBe('3+4-1=6 个周期')
    expect(last(steps).state['串行耗时']).toBe('3×4=12 个周期')
    expect(last(steps).state['加速比']).toBe('12/6=2.0000')
    expect(last(steps).frames).toEqual(Array.from({ length: 4 }, (_, s) => `阶段 ${s + 1}：空闲`))
  })

  it('所有1–10指令/1–6阶段满足n+k-1，单指令/单阶段加速比为1', () => {
    for (let n = 1; n <= 10; n++) for (let k = 1; k <= 6; k++) {
      const steps = pipelineSteps(n, k), cycles = steps.filter(s => /^周期 \d+：/.test(s.action))
      expect(cycles).toHaveLength(n + k - 1)
      for (const [index, step] of cycles.entries()) {
        const c = index + 1
        expect(Number(step.state['当前周期'])).toBe(c)
        expect(Number(step.state['已完成指令（周期末）'])).toBe(Math.max(0, Math.min(n, c - k + 1)))
        for (let stage = 1; stage <= k; stage++) {
          const id = c - stage + 1
          expect(step.frames![stage - 1]).toBe(`阶段 ${stage}：${id >= 1 && id <= n ? `I${id}` : '空闲'}`)
        }
      }
      expect(Number(last(steps).state['已完成指令（周期末）'])).toBe(n)
      expect(new Set(steps.map(s => s.frames)).size).toBe(steps.length)
      if (n === 1 || k === 1) expect(last(steps).state['加速比']).toContain('=1.0000')
    }
  })

  it.each([[0, 1], [11, 1], [1, 0], [1, 7], [1.5, 2], [2, 1.5], [NaN, 1], [1, Infinity]])('拒绝参数n=%s/k=%s', (n, k) => {
    expect(() => pipelineSteps(n, k)).toThrow()
  })
})

describe('所有新实验的步骤是完整且相互独立的展示快照', () => {
  it('每步都有动作、文本状态和全新frames，不输出NaN/undefined/共用对象', () => {
    const runs = [binarySearchSteps([0, 3, 8], 3), quickSortSteps([3, 0, 2]), heapSortSteps([3, 0, 2]),
      ...(['bfs', 'dijkstra', 'kruskal'] as const).map(k => graphSteps(5, tiedGraph, k)),
      addressTranslationSteps(37, 4096, [0]), pipelineSteps(3, 4)]
    for (const steps of runs) {
      for (const step of steps) {
        expect(step.action.length).toBeGreaterThan(5)
        expect(Object.keys(step.state).length).toBeGreaterThan(2)
        expect(Object.values(step.state).every(v => typeof v === 'string' && !/NaN|undefined/.test(v))).toBe(true)
        expect(step.frames?.length).toBeGreaterThan(0)
      }
      expect(new Set(steps.map(s => s.state)).size).toBe(steps.length)
      expect(new Set(steps.map(s => s.frames)).size).toBe(steps.length)
    }
  })
})

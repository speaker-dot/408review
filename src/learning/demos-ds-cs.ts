import type { DemoStep } from './demos'

/** 教学模型：所有下标/顶点均从 0 开始；快照只有可展示的文本，不暴露内部可变数组。 */
export interface Edge { from: number; to: number; weight: number }
export type GraphDemoKind = 'bfs' | 'dijkstra' | 'kruskal'

function integer(value: number, min: number, max: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${label}必须为 ${min}–${max} 的安全整数。`)
  }
}

function valuesCopy(values: number[]): number[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > 16) {
    throw new Error('数列必须包含 1–16 个元素。')
  }
  for (const value of values) integer(value, 0, 65535, '元素')
  return [...values]
}

function record(steps: DemoStep[], action: string, state: Record<string, string>, frames: string[]): void {
  // 显式复制：后来交换、入队、合并集合均不能改变已揭晓的步骤。
  steps.push({ action, state: { ...state }, frames: [...frames] })
}

/** 闭区间 [low, high]；相等即返回一个命中位置，不声称返回首个重复元素。 */
export function binarySearchSteps(values: number[], target: number): DemoStep[] {
  const a = valuesCopy(values)
  integer(target, 0, 65535, '目标值')
  if (a.some((v, i) => i > 0 && v < a[i - 1])) throw new Error('折半查找的输入必须按非递减顺序排列。')
  const steps: DemoStep[] = []
  let low = 0, high = a.length - 1, mid = -1, comparisons = 0, result = -2
  const snapshot = (action: string) => record(steps, action, {
    '数组': a.join(', '), '目标': String(target), 'low': String(low), 'high': String(high),
    '本次中点': mid < 0 ? '尚无' : String(mid), '候选区间': low > high ? '空' : `[${low}, ${high}]`,
    '比较次数': String(comparisons), '结果': result === -2 ? '待定' : result < 0 ? '未找到' : String(result),
    '约定': '闭区间；mid=floor((low+high)/2)；重复值命中任意一个位置',
  }, a.map((v, i) => `a[${i}]=${v}${i === mid ? ' ← 本次 mid' : ''}${i >= low && i <= high ? '（候选）' : ''}`))
  snapshot('初始化完整候选区间。数组有序，才可以根据一次比较排除半边。')
  while (low <= high) {
    mid = Math.floor((low + high) / 2)
    comparisons++
    snapshot(`比较 a[${mid}]=${a[mid]} 与目标 ${target}，此时区间仍为 [${low}, ${high}]。`)
    if (a[mid] === target) {
      result = mid
      snapshot(`找到目标，返回 0 基下标 ${mid}。重复元素存在时，这不一定是首个下标。`)
      return steps
    }
    if (a[mid] < target) {
      low = mid + 1
      snapshot(`a[${mid}] 小于目标，令 low=mid+1=${low}；中点与左半边均被排除。`)
    } else {
      high = mid - 1
      snapshot(`a[${mid}] 大于目标，令 high=mid-1=${high}；中点与右半边均被排除。`)
    }
  }
  result = -1
  snapshot('low>high，候选区间为空，目标不在数组中。不能再访问空区间的中点。')
  return steps
}

/** 首元素作枢轴，双向挖坑：右侧跳过 >=pivot，左侧跳过 <=pivot，最后枢轴填坑。 */
export function quickSortSteps(values: number[]): DemoStep[] {
  const a = valuesCopy(values), steps: DemoStep[] = [], fixed = new Set<number>()
  let low = 0, high = a.length - 1, i = low, j = high, hole = -1, pivot: number | undefined
  const snapshot = (action: string) => record(steps, action, {
    '数组': a.map((v, index) => index === hole ? '□' : String(v)).join(', '),
    '当前分区': `[${low}, ${high}]`, 'i': String(i), 'j': String(j),
    '暂存枢轴': pivot === undefined ? '无' : String(pivot), '坑位': hole < 0 ? '无' : String(hole),
    '已固定下标': [...fixed].sort((x, y) => x - y).join(', ') || '无',
    '约定': '首元素枢轴；右指针跳过 ≥ 枢轴，左指针跳过 ≤ 枢轴；先左分区后右分区',
  }, a.map((v, index) => `a[${index}]=${index === hole ? '□' : v}${fixed.has(index) ? ' ✓ 已固定' : ''}`))
  snapshot('开始快速排序。取出枢轴后以 □ 表示空位；暂存枢轴仍属于原有元素，不是删除。')
  const sort = (left: number, right: number): void => {
    if (left > right) return
    low = left; high = right; i = left; j = right
    if (left === right) {
      fixed.add(left)
      snapshot(`分区 [${left}, ${right}] 只有一个元素，位置已经确定。`)
      return
    }
    pivot = a[left]; hole = left
    snapshot(`暂存首元素 ${pivot} 为枢轴，a[${left}] 成为左侧坑位。`)
    while (i < j) {
      while (i < j && a[j] >= pivot) {
        j--
        snapshot(`右侧元素不小于枢轴，j 左移到 ${j}；等于枢轴也要越过，保证重复值不会卡住。`)
      }
      if (i < j) {
        a[i] = a[j]; hole = j
        snapshot(`将小于枢轴的 a[${j}]=${a[j]} 搬入 a[${i}]，新坑位在 ${j}。`)
      }
      while (i < j && a[i] <= pivot) {
        i++
        snapshot(`左侧元素不大于枢轴，i 右移到 ${i}；扫描不能越过 j。`)
      }
      if (i < j) {
        a[j] = a[i]; hole = i
        snapshot(`将大于枢轴的 a[${i}]=${a[i]} 搬入 a[${j}]，新坑位在 ${i}。`)
      }
    }
    const position = i, value = pivot
    a[position] = value; hole = -1; pivot = undefined; fixed.add(position)
    snapshot(`i=j=${position}，枢轴 ${value} 填回坑位。左分区 ≤ ${value}，右分区 ≥ ${value}；枢轴位置固定。`)
    sort(left, position - 1)
    sort(position + 1, right)
  }
  sort(0, a.length - 1)
  low = 0; high = a.length - 1; i = -1; j = -1
  snapshot('所有非空分区处理完毕，数组非递减。首元素枢轴在已排序输入上会产生不平衡分区，本模型不宣称总是 O(n log n)。')
  return steps
}

/** 0 基最大堆；左右孩子为 2r+1/2r+2，孩子相等时先选左孩子。 */
export function heapSortSteps(values: number[]): DemoStep[] {
  const a = valuesCopy(values), steps: DemoStep[] = []
  let heapSize = a.length, root = -1, child = -1, phase = '建堆'
  const snapshot = (action: string) => record(steps, action, {
    '数组': a.join(', '), '阶段': phase, '堆大小': String(heapSize),
    '调整位置': root < 0 ? '无' : String(root), '较大孩子': child < 0 ? '无' : String(child),
    '堆区间': heapSize ? `[0, ${heapSize - 1}]` : '空',
    '有序后缀': heapSize < a.length ? a.slice(heapSize).join(', ') : '空',
    '约定': '最大堆；孩子等大选左；父结点等于较大孩子时不交换；堆外后缀不参与下沉',
  }, a.map((v, index) => `a[${index}]=${v}${index < heapSize ? '（堆内）' : ' ✓ 已固定'}`))
  const sift = (start: number): void => {
    root = start; child = -1
    while (root * 2 + 1 < heapSize) {
      const left = root * 2 + 1, right = left + 1
      child = right < heapSize && a[right] > a[left] ? right : left
      snapshot(`比较孩子，选择 a[${child}]=${a[child]}；父结点为 a[${root}]=${a[root]}。`)
      if (a[root] >= a[child]) {
        snapshot('父结点不小于较大孩子，当前子树满足最大堆关系，下沉结束。')
        return
      }
      const oldRoot = root
      ;[a[root], a[child]] = [a[child], a[root]]
      root = child; child = -1
      snapshot(`交换 a[${oldRoot}] 与 a[${root}]，被换下的元素继续在位置 ${root} 下沉。`)
    }
    child = -1
    snapshot(`位置 ${root} 已无堆内孩子，本次下沉完成。`)
  }
  snapshot('从最后一个非叶结点 floor(n/2)-1 开始，按下标递减逐棵调整子树。初始数组不要求是堆。')
  for (let start = Math.floor(a.length / 2) - 1; start >= 0; start--) sift(start)
  root = -1; child = -1
  snapshot('最大堆已建立，堆顶是当前未排序元素中的最大值。自底向上建堆的总时间为 O(n)。')
  phase = '排序'
  for (let end = a.length - 1; end > 0; end--) {
    ;[a[0], a[end]] = [a[end], a[0]]
    heapSize = end; root = 0; child = -1
    snapshot(`将堆顶最大值换到 a[${end}]，堆大小缩为 ${heapSize}；交换后堆顶可能破坏堆关系，尚需下沉。`)
    sift(0)
    root = -1; child = -1
    snapshot('本轮下沉结束，堆内重新满足最大堆关系；有序后缀已经固定且不会再改变。')
  }
  heapSize = 0; root = -1; child = -1; phase = '完成'
  snapshot('最后一个元素也已固定，输出非递减数组。每轮最多沿树高下沉，堆排序为 O(n log n)，不保证稳定性。')
  return steps
}

function graphInput(vertexCount: number, edges: Edge[], kind: GraphDemoKind): Edge[] {
  integer(vertexCount, 1, 8, '顶点数')
  if (!['bfs', 'dijkstra', 'kruskal'].includes(kind)) throw new Error('图算法必须为 bfs、dijkstra 或 kruskal。')
  if (!Array.isArray(edges) || edges.length > 16) throw new Error('边数必须为 0–16。')
  for (const edge of edges) {
    if (!edge || typeof edge !== 'object') throw new Error('每条边必须具有 from、to 和 weight。')
    integer(edge.from, 0, vertexCount - 1, '边起点')
    integer(edge.to, 0, vertexCount - 1, '边终点')
    integer(edge.weight, 0, 65535, '边权')
    if (edge.from === edge.to) throw new Error('本模型不接受自环；平行边可以保留。')
  }
  return edges.map(e => ({ from: Math.min(e.from, e.to), to: Math.max(e.from, e.to), weight: e.weight }))
}

/** 无向图；BFS 给出完整遍历森林，Dijkstra 固定源点 0，Kruskal 给出最小生成森林。 */
export function graphSteps(vertexCount: number, edges: Edge[], kind: GraphDemoKind): DemoStep[] {
  const normalized = graphInput(vertexCount, edges, kind)
  const steps: DemoStep[] = []
  const edgeText = normalized.map(e => `${e.from}—${e.to}(${e.weight})`).join(', ') || '无'
  if (kind === 'kruskal') {
    const sorted = [...normalized].sort((a, b) => a.weight - b.weight || a.from - b.from || a.to - b.to)
    const parent = Array.from({ length: vertexCount }, (_, v) => v), accepted: Edge[] = []
    let components = vertexCount, total = 0
    const find = (v: number): number => {
      while (parent[v] !== v) v = parent[v]
      return v
    }
    const snapshot = (action: string, current = '无') => record(steps, action, {
      '边': edgeText, '候选顺序': sorted.map(e => `${e.from}—${e.to}(${e.weight})`).join(', ') || '无',
      '当前边': current, '已选边': accepted.map(e => `${e.from}—${e.to}(${e.weight})`).join(', ') || '无',
      '总权值': String(total), '连通分量数': String(components),
      '约定': '边按权重、较小端点、较大端点排序；同一集合的边会形成环而被舍弃',
    }, parent.map((_, v) => `顶点 ${v} → 集合代表 ${find(v)}`))
    snapshot('初始每个顶点自成集合，按确定顺序扫描所有边。重复/平行边不改变判环规则。')
    for (const edge of sorted) {
      const fromRoot = find(edge.from), toRoot = find(edge.to), current = `${edge.from}—${edge.to}(${edge.weight})`
      if (fromRoot === toRoot) {
        snapshot(`舍弃边 ${current}：两端已经同属集合 ${fromRoot}，加入会形成环。`, current)
      } else {
        parent[Math.max(fromRoot, toRoot)] = Math.min(fromRoot, toRoot)
        accepted.push({ ...edge }); total += edge.weight; components--
        snapshot(`选择边 ${current}，合并两个集合；总权值为 ${total}。`, current)
      }
    }
    snapshot(components === 1
      ? `所有顶点连通，得到最小生成树，共 ${accepted.length} 条边，总权值 ${total}。`
      : `原图不连通，得到 ${components} 个分量的最小生成森林，共 ${accepted.length} 条边，总权值 ${total}；不存在覆盖全部顶点的生成树。`)
    return steps
  }
  const adjacency: { to: number; weight: number }[][] = Array.from({ length: vertexCount }, () => [])
  for (const edge of normalized) {
    adjacency[edge.from].push({ to: edge.to, weight: edge.weight })
    adjacency[edge.to].push({ to: edge.from, weight: edge.weight })
  }
  for (const list of adjacency) list.sort((a, b) => a.to - b.to || a.weight - b.weight)
  if (kind === 'bfs') {
    const discovered = Array<boolean>(vertexCount).fill(false), processed = Array<boolean>(vertexCount).fill(false)
    const parent = Array<number>(vertexCount).fill(-1), distance = Array<number>(vertexCount).fill(-1)
    const order: number[] = [], roots: number[] = [], queue: number[] = []
    let current = -1
    const snapshot = (action: string) => record(steps, action, {
      '边': edgeText, '当前出队顶点': current < 0 ? '无' : String(current), '队列（队头在左）': queue.join(' → ') || '空',
      '出队顺序': order.join(', ') || '无', '前驱（根用 -1）': parent.join(', '),
      '到本分量根的边数（未发现用 -1）': distance.join(', '), '森林根': roots.join(', ') || '无',
      '约定': '发现即标记并入队，邻接点按顶点升序；分量结束后从最小未发现顶点重启；忽略权重',
    }, discovered.map((seen, v) => `顶点 ${v}：${processed[v] ? '已出队' : seen ? '已发现/在队列' : '未发现'}`))
    snapshot('从顶点 0 开始。BFS 的层数是边数，不是任意带权图的最小权值。')
    for (let start = 0; start < vertexCount; start++) {
      if (discovered[start]) continue
      discovered[start] = true; distance[start] = 0; roots.push(start); queue.push(start); current = -1
      snapshot(`启动分量根 ${start}，标记后入队；根没有前驱。`)
      while (queue.length) {
        const v = queue.shift()!
        current = v; processed[v] = true; order.push(v)
        snapshot(`队头 ${v} 出队，准备按升序检查邻接点。`)
        for (const neighbor of adjacency[v]) {
          if (discovered[neighbor.to]) {
            snapshot(`邻接点 ${neighbor.to} 已发现，跳过，不重复入队。`)
            continue
          }
          discovered[neighbor.to] = true; parent[neighbor.to] = v; distance[neighbor.to] = distance[v] + 1
          queue.push(neighbor.to)
          snapshot(`首次发现顶点 ${neighbor.to}，前驱记为 ${v}、边数记为 ${distance[neighbor.to]}，立即标记并入队。`)
        }
      }
    }
    current = -1
    snapshot(`遍历结束，每个顶点仅出队一次，形成 ${roots.length} 棵 BFS 树。不同分量的层数分别从 0 计。`)
    return steps
  }
  const distance = Array<number>(vertexCount).fill(Infinity), predecessor = Array<number>(vertexCount).fill(-1)
  const settled = Array<boolean>(vertexCount).fill(false), order: number[] = []
  let current = -1, finished = false
  distance[0] = 0
  const text = (value: number) => Number.isFinite(value) ? String(value) : '∞'
  const snapshot = (action: string) => record(steps, action, {
    '边': edgeText, '源点': '0', '当前顶点': current < 0 ? '无' : String(current),
    '距离（按顶点顺序）': distance.map(text).join(', '), '前驱（源点/不可达用 -1）': predecessor.join(', '),
    '确定顺序': order.join(', ') || '无',
    '未取得有限距离的顶点': distance.flatMap((d, v) => d === Infinity ? [v] : []).join(', ') || '无',
    '不可达顶点': finished ? distance.flatMap((d, v) => d === Infinity ? [v] : []).join(', ') || '无' : '尚未判定',
    '约定': '选未确定的最小距离顶点，等距先选小顶点；严格变短才改前驱；权重非负（允许 0）',
  }, distance.map((d, v) => `顶点 ${v}：${text(d)}${settled[v] ? ' ✓ 已确定' : '（暂定）'}`))
  snapshot('源点 0 的距离为 0，其余为 ∞。暂定距离可以被松弛，已确定的非负最短距离不再改变。')
  for (;;) {
    let selected = -1
    for (let v = 0; v < vertexCount; v++) {
      if (!settled[v] && Number.isFinite(distance[v]) && (selected < 0 || distance[v] < distance[selected])) selected = v
    }
    if (selected < 0) break
    current = selected; settled[selected] = true; order.push(selected)
    snapshot(`选中顶点 ${selected}，距离 ${distance[selected]} 正式确定；等距顶点按编号升序选择。`)
    for (const neighbor of adjacency[selected]) {
      if (settled[neighbor.to]) continue
      const candidate = distance[selected] + neighbor.weight
      if (candidate < distance[neighbor.to]) {
        const old = text(distance[neighbor.to])
        distance[neighbor.to] = candidate; predecessor[neighbor.to] = selected
        snapshot(`松弛边 ${selected}—${neighbor.to}(${neighbor.weight})：${distance[selected]}+${neighbor.weight}=${candidate}<${old}，更新距离和前驱。`)
      } else {
        snapshot(`检查边 ${selected}—${neighbor.to}(${neighbor.weight})：候选 ${candidate} 不小于当前 ${text(distance[neighbor.to])}，保持原距离与前驱。`)
      }
    }
  }
  current = -1; finished = true
  snapshot(`结束：从源点 0 可达的顶点已确定；仍为 ∞ 的顶点不可达，不用 ∞ 参与加法，也不跳到其他分量。`)
  return steps
}

/** 页表 -1 表示合法页暂不在内存；页号超出表长是非法访问，不是缺页。未模拟 TLB/多级页表。 */
export function addressTranslationSteps(address: number, pageSize: number, pageTable: number[]): DemoStep[] {
  integer(address, 0, 0xFFFFFFFF, '32 位字节地址')
  integer(pageSize, 1, 65536, '页大小')
  if (!Number.isInteger(Math.log2(pageSize))) throw new Error('页大小必须是 2 的整数次幂。')
  if (!Array.isArray(pageTable) || pageTable.length < 1 || pageTable.length > 256) throw new Error('页表必须有 1–256 项。')
  const maxFrame = Math.floor(0xFFFFFFFF / pageSize)
  for (const frame of pageTable) integer(frame, -1, maxFrame, '页框号（-1 表示不在内存）')
  const table = [...pageTable], steps: DemoStep[] = []
  const offsetBits = Math.log2(pageSize), page = Math.floor(address / pageSize), offset = address % pageSize
  let status = '待转换', frame: number | undefined, physical: number | undefined
  const snapshot = (action: string) => record(steps, action, {
    '虚拟字节地址': String(address), '虚拟地址（32 位二进制）': address.toString(2).padStart(32, '0'),
    '页大小（B）': String(pageSize), '页号位数': String(32 - offsetBits), '偏移位数': String(offsetBits),
    '页号': String(page), '页内偏移': String(offset), '页表长度': String(table.length),
    '页框号': frame === undefined ? '未读取' : String(frame), '物理字节地址': physical === undefined ? '未生成' : String(physical),
    '状态': status, '约定': '页号从 0 开始，-1 为合法页不驻留；超出页表为非法地址；无 TLB、无访问权限位',
  }, table.map((entry, v) => `页 ${v} → ${entry < 0 ? '不在内存' : `页框 ${entry}`}${v === page ? ' ← 当前页' : ''}`))
  snapshot('按页大小分解地址：页号=floor(地址/页大小)，偏移=地址 mod 页大小。高位页号和低位偏移不可混用。')
  if (page >= table.length) {
    status = '非法地址'
    snapshot(`页号 ${page} ≥ 页表长度 ${table.length}，访问越界；不读取该页表项，也不把非法访问说成缺页。`)
    return steps
  }
  frame = table[page]
  snapshot(`页号 ${page} 在合法范围内，读取页表项，得到 ${frame}。`)
  if (frame === -1) {
    status = '缺页'
    snapshot(`页 ${page} 合法但不驻留，触发缺页处理。本实验在此停止，不能用 -1 拼出物理地址。`)
    return steps
  }
  physical = frame * pageSize + offset; status = '转换成功'
  snapshot(`物理地址=页框号×页大小+页内偏移=${frame}×${pageSize}+${offset}=${physical}。映射只替换页号，偏移保持不变。`)
  return steps
}

/** 理想流水：每阶段恰好一个周期，每周期可发射一条指令，无结构/数据/控制冲突。 */
export function pipelineSteps(instructionCount: number, stageCount: number): DemoStep[] {
  integer(instructionCount, 1, 10, '指令数')
  integer(stageCount, 1, 6, '阶段数')
  const steps: DemoStep[] = [], cycles = instructionCount + stageCount - 1, serial = instructionCount * stageCount
  let cycle = 0, completed = 0
  const snapshot = (action: string, frames: string[]) => record(steps, action, {
    '当前周期': String(cycle), '已完成指令（周期末）': String(completed),
    '指令数 n': String(instructionCount), '阶段数 k': String(stageCount),
    '串行耗时': `${instructionCount}×${stageCount}=${serial} 个周期`,
    '流水耗时': `${instructionCount}+${stageCount}-1=${cycles} 个周期`,
    '加速比': `${serial}/${cycles}=${(serial / cycles).toFixed(4)}`,
    '约定': '阶段从 1 开始；展示本周期内占用，最后阶段结束才算完成；每阶段 1 周期，无冲突、无发射间隔',
  }, frames)
  const idle = () => Array.from({ length: stageCount }, (_, s) => `阶段 ${s + 1}：空闲`)
  snapshot('流水线初始为空，指令 I1 尚未发射；先经历填充，再处理，最后排空。', idle())
  for (cycle = 1; cycle <= cycles; cycle++) {
    const frames = Array.from({ length: stageCount }, (_, s) => {
      const instruction = cycle - s
      return `阶段 ${s + 1}：${instruction >= 1 && instruction <= instructionCount ? `I${instruction}` : '空闲'}`
    })
    completed = Math.max(0, Math.min(instructionCount, cycle - stageCount + 1))
    const finished = cycle - stageCount + 1, issued = cycle <= instructionCount ? `发射 I${cycle}` : '不再发射新指令'
    snapshot(`周期 ${cycle}：${issued}；${finished >= 1 && finished <= instructionCount ? `周期末 I${finished} 完成` : '尚无指令完成'}。每条在途指令只前进一个阶段。`, frames)
  }
  cycle = cycles
  snapshot(`所有 ${instructionCount} 条指令已完成，耗时 ${cycles} 个周期，等于 n+k-1；不把理想公式用于有停顿或阶段不等长的流水线。`, idle())
  return steps
}

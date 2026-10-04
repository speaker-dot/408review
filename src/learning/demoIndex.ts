import type { KnowledgeCategory } from '@/types'

/** 轻量目录与计算引擎分开：知识点详情页不必加载全部实验算法。 */
export interface DemoField {
  key: string
  label: string
  kind: 'text' | 'number' | 'textarea' | 'select'
  help?: string
  options?: string[]
}
export interface DemoMetadata {
  id: string
  category: KnowledgeCategory
  title: string
  focus: string
  summary: string
  assumptions: string
  nodeIds: string[]
  fields: DemoField[]
  defaults: Record<string, string>
}
export const demoSubjects = [
  { id: 'DS', name: '数据结构', short: 'DS' },
  { id: 'CS', name: '计算机组成', short: 'CO' },
  { id: 'OS', name: '操作系统', short: 'OS' },
  { id: 'NET', name: '计算机网络', short: 'NET' },
] as const
const sequence = (key: string, label: string, help = '用空格或逗号分隔，最多 16 个 0–65535 整数。'): DemoField => ({ key, label, kind: 'text', help })
const number = (key: string, label: string, help: string): DemoField => ({ key, label, kind: 'number', help })
const select = (key: string, label: string, options: string[]): DemoField => ({ key, label, kind: 'select', options })
const text = (key: string, label: string, help: string): DemoField => ({ key, label, kind: 'textarea', help })
const graphFields = [number('vertices', '顶点数量', '1–8；顶点从 0 开始编号。'), text('edges', '边：起点 终点 权重', '每行一条无向边，最多 16 条；非负权重，不支持自环。')]
const graphDefaults = { vertices: '5', edges: '0 1 2\n0 2 6\n1 2 1\n1 3 4\n2 3 2\n3 4 3' }

export const demoIndex: DemoMetadata[] = [
  { id: 'binary', category: 'DS', title: '折半查找', focus: '边界与判定次数', summary: '观察 low、high、mid 如何缩小范围，找不到时也有清楚的终止条件。', assumptions: '非递减有序数组；0 基闭区间 [low, high]；mid 向下取整，找到一个匹配即结束。', nodeIds: ['DS-07-02-002'], fields: [sequence('values', '有序数组'), number('target', '查找值', '0–65535')], defaults: { values: '3 8 12 17 21 29 35 42', target: '21' } },
  { id: 'kmp', category: 'DS', title: 'KMP 匹配', focus: '失配与前缀复用', summary: '主串指针不回退：看看已匹配的前后缀究竟省掉了哪些比较。', assumptions: 'ASCII 字符、0 基 lps 定义；与教材 1 基 next 不可混用；允许寻找重叠匹配。', nodeIds: ['DS-04-01-002'], fields: [{ key: 'text', label: '主串', kind: 'text', help: '1–80 个 ASCII 字符。' }, { key: 'pattern', label: '模式串', kind: 'text', help: '1–30 个 ASCII 字符。' }], defaults: { text: 'ABABABACABA', pattern: 'ABABACA' } },
  { id: 'quick', category: 'DS', title: '快速排序', focus: '划分与枢轴归位', summary: '先看一次 partition，再跟进递归；区分局部划分完成和全序列有序。', assumptions: '首元素枢轴、双向挖坑法；从右扫描大于等于枢轴的值，再从左扫描小于等于枢轴的值。', nodeIds: ['DS-08-03-002'], fields: [sequence('values', '待排序数组')], defaults: { values: '49 38 65 97 76 13 27' } },
  { id: 'heap', category: 'DS', title: '堆排序', focus: '建堆与下沉', summary: '看懂建堆和取堆顶为何是不同阶段，跟踪已排序区如何增长。', assumptions: '0 基数组最大堆、升序结果；先自底向上建堆，再将堆顶换到末尾并缩小堆。', nodeIds: ['DS-08-04-002'], fields: [sequence('values', '待排序数组')], defaults: { values: '4 10 3 5 1 8 7' } },
  { id: 'bfs', category: 'DS', title: '广度优先搜索', focus: '队列与访问次序', summary: '从队列的入队、出队顺序理解“先近后远”，而不是死记遍历序列。', assumptions: '无向图；从顶点 0 开始，邻接点按编号递增；发现时标记，非连通图继续最小未访问顶点。权重不影响 BFS。', nodeIds: ['DS-06-03-002', 'DS-06-03-003'], fields: graphFields, defaults: graphDefaults },
  { id: 'dijkstra', category: 'DS', title: 'Dijkstra 最短路径', focus: '确定最短路与松弛', summary: '每轮选谁、哪些距离被更新、为什么更新后还不能立即标记完成。', assumptions: '无向非负权图、源点 0；距离相同时先选编号小者；不可达点保持 ∞。不是负权图模型。', nodeIds: ['DS-06-05-001'], fields: graphFields, defaults: graphDefaults },
  { id: 'kruskal', category: 'DS', title: 'Kruskal 最小生成树', focus: '选边与判环', summary: '为什么某条很短的边也要跳过？逐步区分生成树和最短路径。', assumptions: '无向非负权图；权重、端点编号作为确定的平局规则；非连通时得到最小生成森林。', nodeIds: ['DS-06-04-002'], fields: graphFields, defaults: graphDefaults },
  { id: 'cache', category: 'CS', title: 'Cache 替换', focus: '地址分解与命中', summary: '把地址分成标记、组号、偏移，再比较 LRU 和 FIFO 的命中差异。', assumptions: '16 位字节地址、16 B 块、2 组 × 2 路、仅读访问；忽略写策略和访存延迟。', nodeIds: ['CS-03-03-001', 'CS-03-03-002'], fields: [sequence('addresses', '字节地址序列', '最多 40 个 0–65535 地址，可用 0x 十六进制。'), select('policy', '替换策略', ['LRU', 'FIFO'])], defaults: { addresses: '0 32 0 64 32 0', policy: 'LRU' } },
  { id: 'address', category: 'CS', title: '分页地址变换', focus: '页号、偏移与页框', summary: '用一次访存串起逻辑地址分解、查页表、缺页与物理地址生成。', assumptions: '32 位无符号字节地址；页大小为 2 的幂；页表项为页框号，-1 表示不在内存；不含 TLB 和缺页处理耗时。', nodeIds: ['CS-03-04-001', 'OS-03-03-001'], fields: [number('address', '逻辑字节地址', '0–4294967295'), number('pageSize', '页大小 / B', '1–65536，必须为 2 的幂。'), sequence('pageTable', '页表：按页号排列的页框号', '最多 256 项，-1 表示缺页；页号超出表长表示非法访问。')], defaults: { address: '5700', pageSize: '4096', pageTable: '3 7 -1 11' } },
  { id: 'pipeline', category: 'CS', title: '指令流水线', focus: '装入、重叠与排空', summary: '从每个周期的位置看清吞吐率和加速比，避免把阶段数当成总用时。', assumptions: '理想等长阶段，每阶段 1 个时钟周期，无数据/结构/控制冲突，无额外开销。', nodeIds: ['CS-05-06-001'], fields: [number('instructions', '指令数量', '1–10'), number('stages', '流水段数量', '1–6')], defaults: { instructions: '6', stages: '5' } },
  { id: 'scheduling', category: 'OS', title: '处理机调度', focus: '时间线与周转时间', summary: '切换 FCFS、非抢占 SJF、时间片轮转，比较相同进程的完成与等待时间。', assumptions: '单 CPU、无 I/O 阻塞和切换开销；SJF 非抢占；到达/队列顺序的平局规则在轨迹中标明。', nodeIds: ['OS-02-02-003', 'OS-02-02-002'], fields: [text('processes', '进程：名称 到达时间 执行时间', '每行一个进程，如 P1 0 5；最多 8 个，名称不可重复；到达 0–100，执行 1–50。'), select('policy', '调度策略', ['FCFS', 'SJF', 'RR']), number('quantum', 'RR 时间片', '1–50；非 RR 策略不使用此值。')], defaults: { processes: 'P1 0 5\nP2 1 3\nP3 2 1', policy: 'RR', quantum: '2' } },
  { id: 'banker', category: 'OS', title: '银行家安全性检查', focus: 'Work 与安全序列', summary: '进程“还能请求多少”和“结束后归还多少”不是同一个向量。', assumptions: '这里只检查给定状态的安全性，不代替资源请求算法；Need=Max−Allocation，进程结束归还 Allocation。', nodeIds: ['OS-02-04-003'], fields: [text('allocation', 'Allocation：已分配矩阵', '1–6 行进程、1–4 列资源；每项为 0–99 的整数。'), text('max', 'Max：最大需求矩阵', '与 Allocation 同维度，且每项不小于已分配值。'), sequence('available', 'Available：可用资源向量', '长度与矩阵列数一致，每项为 0–99 的整数。')], defaults: { allocation: '1 0\n0 1\n1 1', max: '2 1\n1 2\n2 2', available: '1 1' } },
  { id: 'page', category: 'OS', title: '页面置换', focus: '缺页与淘汰规则', summary: '逐次看页框，比较 FIFO、LRU、OPT；命中时是否改顺序决定后续结果。', assumptions: '初始内存为空、固定页框；OPT 预知未来只用于理论比较；FIFO 命中不改变入队时间。', nodeIds: ['OS-03-04-003'], fields: [sequence('references', '页引用序列', '最多 40 个非负页号。'), number('capacity', '页框数', '1–6'), select('policy', '置换策略', ['FIFO', 'LRU', 'OPT'])], defaults: { references: '7 0 1 2 0 3 0 4 2 3 0 3 2', capacity: '3', policy: 'LRU' } },
  { id: 'disk', category: 'OS', title: '磁盘调度', focus: '访问顺序与移动量', summary: '画出磁头走过的路径，分清 SCAN 的碰边折返和 LOOK 的请求处折返。', assumptions: '磁道 0–199，忽略旋转延迟；SSTF 距离相同时取较小磁道；SCAN 有反向请求才继续碰边折返。', nodeIds: ['OS-04-03-001'], fields: [sequence('requests', '磁道请求序列', '最多 30 项，磁道范围 0–199。'), number('head', '磁头起点', '0–199'), select('policy', '调度策略', ['FCFS', 'SSTF', 'SCAN']), select('direction', 'SCAN 初始方向', ['up', 'down'])], defaults: { requests: '55 58 18 90 160', head: '50', policy: 'SCAN', direction: 'up' } },
  { id: 'subnet', category: 'NET', title: 'IPv4 子网划分', focus: '网络号与可用地址', summary: '从位掩码推导网络地址、广播地址和可用主机范围，特别处理 /31 与 /32。', assumptions: 'IPv4 CIDR；/0–/30 使用传统网络/广播语义；/31 按点到点、/32 按单主机语义单独处理。', nodeIds: ['NET-04-03-003'], fields: [{ key: 'ip', label: 'IPv4 地址', kind: 'text', help: '四段十进制地址，每段 0–255。' }, number('prefix', '前缀长度', '0–32')], defaults: { ip: '192.168.10.77', prefix: '26' } },
  { id: 'crc', category: 'NET', title: 'CRC 模 2 除法', focus: '补零、异或与余数', summary: '每次异或都看得见，再将所得码字带回生成多项式验证。', assumptions: '二进制数据与生成多项式；生成串首尾为 1；模 2 运算不借位，不是普通整数除法。', nodeIds: ['NET-03-03-001', 'CS-02-01-003'], fields: [{ key: 'data', label: '数据位串', kind: 'text', help: '1–64 位，仅含 0 或 1。' }, { key: 'generator', label: '生成多项式位串', kind: 'text', help: '2–17 位，首尾必须为 1；如 1101 代表 x³+x²+1。' }], defaults: { data: '1010', generator: '1101' } },
  { id: 'arq', category: 'NET', title: 'GBN / SR 可靠传输', focus: '丢帧、确认与重传', summary: '同样丢掉一帧，为什么后退 N 帧和选择重传会走出不同的过程？', assumptions: '6 帧编号 0–5、3 位序号、发送窗口 3；仅指定数据帧首次发送丢失，ACK 不丢失；不模拟序号回绕。', nodeIds: ['NET-03-04-003', 'NET-03-04-004'], fields: [select('policy', '可靠传输协议', ['GBN', 'SR']), number('lost', '首次丢失的帧号', '0–5')], defaults: { policy: 'GBN', lost: '1' } },
  { id: 'tcp', category: 'NET', title: 'TCP 累计确认', focus: '重复 ACK 与快重传', summary: '接收到最大的段号不等于确认号；连续前缀决定 ACK 能前进多远。', assumptions: '7 个等长段，段号 1–7、窗口 4；接收缓存乱序段、ACK 可靠；序号按段而非真实 TCP 字节。', nodeIds: ['NET-05-03-004', 'NET-05-03-003'], fields: [number('lost', '首次丢失的段号', '1–7')], defaults: { lost: '2' } },
]

export function demosForNode(nodeId: string): DemoMetadata[] {
  return demoIndex.filter(demo => demo.nodeIds.includes(nodeId))
}

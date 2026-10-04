import { cacheSteps, kmpSteps, pageSteps, parseNumbers, tcpSteps, type DemoStep } from './demos'
import { addressTranslationSteps, binarySearchSteps, graphSteps, heapSortSteps, pipelineSteps, quickSortSteps, type Edge } from './demos-ds-cs'
import { bankerSteps, crcSteps, diskSchedulingSteps, schedulingSteps, slidingWindowSteps, subnetSteps, type SchedulingProcess } from './demos-os-net'
import { demoIndex } from './demoIndex'

export function parseInteger(value: string): number {
  if (!/^-?\d+$/.test(value.trim())) throw new Error('请输入完整的十进制整数，不支持小数或空白。')
  const n = Number(value)
  if (!Number.isSafeInteger(n)) throw new Error('数值超出安全整数范围。')
  return n
}
function signedList(value: string, max = 256): number[] {
  const parts = value.trim().split(/[，,\s]+/).filter(Boolean)
  if (!parts.length || parts.length > max) throw new Error(`请输入 1–${max} 个整数。`)
  return parts.map(parseInteger)
}
function rows(value: string, max: number): string[] {
  const result = value.trim().split(/[;；\r\n]+/).map(row => row.trim()).filter(Boolean)
  if (result.length > max) throw new Error(`最多 ${max} 行。`)
  return result
}
export function parseGraphEdges(value: string): Edge[] {
  return rows(value, 16).map(row => {
    const values = signedList(row, 3)
    if (values.length !== 3) throw new Error('每条边需要三个整数：起点 终点 权重。')
    return { from: values[0], to: values[1], weight: values[2] }
  })
}
export function parseProcesses(value: string): SchedulingProcess[] {
  return rows(value, 8).map(row => {
    const parts = row.split(/[，,\s]+/)
    if (parts.length !== 3 || !/^[A-Za-z][\w-]{0,19}$/.test(parts[0])) throw new Error('每行填写进程名称、到达时间、执行时间，如 P1 0 5。')
    return { id: parts[0], arrival: parseInteger(parts[1]), burst: parseInteger(parts[2]) }
  })
}
function matrix(value: string): number[][] {
  const result = rows(value, 6).map(row => signedList(row, 4))
  if (!result.length) throw new Error('矩阵不能为空。')
  return result
}

/** 先统一验证字段，再调用纯模型；不把输入当脚本或表达式执行。 */
export function buildDemoSteps(id: string, inputs: Record<string, string>): DemoStep[] {
  const demo = demoIndex.find(item => item.id === id)
  if (!demo) throw new Error('未知实验。')
  for (const field of demo.fields) {
    const value = inputs[field.key]
    if (typeof value !== 'string' || value.length > 6000) throw new Error('实验输入缺失或过长。')
    if (field.kind === 'select' && !field.options?.includes(value)) throw new Error('请选择提供的策略。')
  }
  const n = (key: string) => parseInteger(inputs[key])
  const list = (key: string) => parseNumbers(inputs[key])
  switch (id) {
    case 'binary': return binarySearchSteps(list('values'), n('target'))
    case 'kmp': return kmpSteps(inputs.text, inputs.pattern)
    case 'quick': return quickSortSteps(list('values'))
    case 'heap': return heapSortSteps(list('values'))
    case 'bfs': case 'dijkstra': case 'kruskal': return graphSteps(n('vertices'), parseGraphEdges(inputs.edges), id)
    case 'cache': return cacheSteps(list('addresses'), inputs.policy as 'LRU' | 'FIFO')
    case 'address': return addressTranslationSteps(n('address'), n('pageSize'), signedList(inputs.pageTable))
    case 'pipeline': return pipelineSteps(n('instructions'), n('stages'))
    case 'scheduling': return schedulingSteps(parseProcesses(inputs.processes), inputs.policy as 'FCFS' | 'SJF' | 'RR', inputs.policy === 'RR' ? n('quantum') : 2)
    case 'banker': return bankerSteps(matrix(inputs.allocation), matrix(inputs.max), list('available'))
    case 'page': return pageSteps(list('references'), n('capacity'), inputs.policy as 'FIFO' | 'LRU' | 'OPT')
    case 'disk': return diskSchedulingSteps(list('requests'), n('head'), inputs.policy as 'FCFS' | 'SSTF' | 'SCAN', inputs.direction as 'up' | 'down', 199)
    case 'subnet': return subnetSteps(inputs.ip, n('prefix'))
    case 'crc': return crcSteps(inputs.data, inputs.generator)
    case 'arq': return slidingWindowSteps(inputs.policy as 'GBN' | 'SR', n('lost'))
    case 'tcp': return tcpSteps(n('lost'))
    default: throw new Error('实验尚未接入。')
  }
}

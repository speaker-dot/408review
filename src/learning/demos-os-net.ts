import type { DemoStep } from './demos'

/** 所有模型均有输入上界，返回独立快照，不修改输入数组。 */
function integer(value: number, label: string, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(label + '必须为 ' + min + '–' + max + ' 的安全整数。')
  }
}
function numbers(values: number[], label: string, maxLength: number, max: number): void {
  if (!Array.isArray(values) || values.length < 1 || values.length > maxLength) {
    throw new Error(label + '数量必须为 1–' + maxLength + '。')
  }
  values.forEach(value => integer(value, label + '中的值', 0, max))
}
function policy(value: string, allowed: string[]): void {
  if (!allowed.includes(value)) throw new Error('不支持的策略：' + value)
}
function mean(values: number[]): string {
  const sum = values.reduce((total, value) => total + value, 0)
  return String(sum) + '/' + values.length + ' = ' + (sum / values.length).toFixed(3)
}

export interface SchedulingProcess { id: string; arrival: number; burst: number }

/**
 * 单CPU、一次CPU计算段、无I/O，切换耗时为0；SJF明确为非抢占式。
 * 同时到达按输入顺序；RR量子结束时，边界处新到达者先入队，再放回旧进程。
 */
export function schedulingSteps(processes: SchedulingProcess[], scheduling: 'FCFS' | 'SJF' | 'RR', quantum = 2): DemoStep[] {
  policy(scheduling, ['FCFS', 'SJF', 'RR'])
  integer(quantum, '时间片', 1, 50)
  if (!Array.isArray(processes) || !processes.length || processes.length > 8) throw new Error('请输入1–8个进程。')
  const ids = new Set<string>()
  const jobs = processes.map((p, index) => {
    if (!p || typeof p.id !== 'string' || !p.id.trim() || p.id.length > 20 || ids.has(p.id)) throw new Error('进程ID须非空、不重复，长度不超过20。')
    ids.add(p.id)
    integer(p.arrival, '到达时刻', 0, 100)
    integer(p.burst, 'CPU服务时间', 1, 50)
    return { ...p, index, remaining: p.burst, completedAt: undefined as number | undefined }
  })
  const incoming = [...jobs].sort((a, b) => a.arrival - b.arrival || a.index - b.index)
  const queue: typeof jobs = []
  const timeline: string[] = []
  const steps: DemoStep[] = []
  let time = 0, arrived = 0, done = 0
  const enqueue = () => {
    const names: string[] = []
    while (arrived < incoming.length && incoming[arrived].arrival <= time) {
      const job = incoming[arrived++]
      queue.push(job)
      names.push(job.id + '@' + job.arrival)
    }
    return names.join(', ') || '无'
  }
  const snapshot = (action: string, arrivals = '无') => steps.push({
    action,
    state: {
      '模型': '单CPU，无I/O，切换开销0；SJF不抢占；RR边界新到达者先入队',
      '策略': scheduling, '时间片': scheduling === 'RR' ? String(quantum) : '不适用',
      '当前时刻': String(time), '本次新入队': arrivals,
      '就绪队列': queue.map(j => j.id + '(剩余' + j.remaining + ')').join(' → ') || '空',
      '执行时间线': timeline.join('，') || '尚未执行',
      '完成时刻': jobs.filter(j => j.completedAt !== undefined).map(j => j.id + '=' + j.completedAt).join(', ') || '尚无',
    },
    frames: jobs.map(j => j.id + '：' + (j.completedAt !== undefined ? '完成@' + j.completedAt : '剩余' + j.remaining)),
  })
  snapshot('初始：从时间0开始，只有已经到达的进程才有资格进入就绪队列。')
  while (done < jobs.length) {
    let arrivals = enqueue()
    if (!queue.length) {
      const old = time
      time = incoming[arrived].arrival
      timeline.push('空闲[' + old + ',' + time + ')')
      arrivals = enqueue()
      snapshot('CPU没有就绪任务，空闲到下一次到达。', arrivals)
    }
    if (scheduling === 'SJF') queue.sort((a, b) => a.burst - b.burst || a.arrival - b.arrival || a.index - b.index)
    const job = queue.shift()!
    const start = time, run = scheduling === 'RR' ? Math.min(quantum, job.remaining) : job.remaining
    time += run
    job.remaining -= run
    timeline.push(job.id + '[' + start + ',' + time + ')')
    const during = enqueue()
    if (!job.remaining) { job.completedAt = time; done++ }
    else queue.push(job)
    snapshot(job.id + '执行' + run + '个时间单位，' + (job.remaining ? '时间片用完，回到队尾。' : '本次CPU计算结束。'), [arrivals, during].filter(s => s !== '无').join(', ') || '无')
  }
  const turns = jobs.map(j => j.completedAt! - j.arrival)
  const waits = jobs.map((j, index) => turns[index] - j.burst)
  steps.push({
    action: '全部完成。周转=完成−到达；本模型无I/O，等待=周转−CPU服务时间。',
    state: {
      '完成时刻': jobs.map(j => j.id + '=' + j.completedAt).join(', '),
      '周转时间': jobs.map((j, i) => j.id + '=' + turns[i]).join(', '),
      '等待时间': jobs.map((j, i) => j.id + '=' + waits[i]).join(', '),
      '平均周转': mean(turns), '平均等待': mean(waits), '执行时间线': timeline.join('，'),
    },
  })
  return steps
}

/** 只做银行家安全性检查，Work/Finish是模拟值，不真实分配或运行进程。 */
export function bankerSteps(allocation: number[][], max: number[][], available: number[]): DemoStep[] {
  numbers(available, '资源类别', 4, 99)
  if (!Array.isArray(allocation) || !allocation.length || allocation.length > 6 ||
      !Array.isArray(max) || max.length !== allocation.length) throw new Error('Allocation与Max须有相同的1–6个进程。')
  const columns = available.length
  const alloc = allocation.map(row => {
    numbers(row, 'Allocation行', columns, 99)
    if (row.length !== columns) throw new Error('矩阵列数必须与Available一致。')
    return [...row]
  })
  const maxima = max.map(row => {
    numbers(row, 'Max行', columns, 99)
    if (row.length !== columns) throw new Error('矩阵列数必须与Available一致。')
    return [...row]
  })
  const need = maxima.map((row, i) => row.map((value, j) => {
    if (value < alloc[i][j]) throw new Error('Allocation不能超过Max。')
    return value - alloc[i][j]
  }))
  const work = [...available], finish = alloc.map(() => false), sequence: number[] = []
  const steps: DemoStep[] = []
  const snapshot = (action: string, checked = '—', result = '检查中') => steps.push({
    action,
    state: {
      'Need = Max − Allocation': need.map((row, i) => 'P' + i + ': (' + row.join(', ') + ')').join('；'),
      'Work': '(' + work.join(', ') + ')', 'Finish': finish.map((value, i) => 'P' + i + '=' + value).join(', '),
      '当前检查': checked, '安全序列': sequence.map(i => 'P' + i).join(' → ') || '尚无', '结论': result,
    },
    frames: alloc.map((row, i) => 'P' + i + ' 已分配(' + row.join(', ') + ')；Need(' + need[i].join(', ') + ')；' + (finish[i] ? '模拟完成' : '尚未完成')),
  })
  snapshot('建立Need矩阵；Work复制Available，所有Finish初始化为false。')
  for (;;) {
    let progressed = false
    for (let i = 0; i < alloc.length; i++) {
      if (finish[i]) continue
      const possible = need[i].every((value, j) => value <= work[j])
      snapshot(possible ? 'P' + i + '的每类Need均不大于Work，可模拟满足。' : 'P' + i + '至少一类Need超过Work，暂时跳过，不能用资源总数相加判断。', 'P' + i)
      if (!possible) continue
      const before = '(' + work.join(', ') + ')'
      alloc[i].forEach((value, j) => { work[j] += value })
      finish[i] = true
      sequence.push(i)
      progressed = true
      snapshot('模拟P' + i + '完成：Work从' + before + '加回其Allocation，而不是加回Max或Need。', 'P' + i)
    }
    if (finish.every(Boolean)) {
      snapshot('所有Finish均为true，找到一条能够满足声明最大需求的完成次序。', '—', '安全')
      break
    }
    if (!progressed) {
      snapshot('整轮没有可继续完成的进程，无法构造覆盖全部进程的安全序列。', '—', '不安全（不等同已发生死锁）')
      break
    }
  }
  return steps
}

/** SCAN沿给定方向服务，仍有反向请求时才触及物理边界，然后折返。 */
export function diskSchedulingSteps(requests: number[], head: number, scheduling: 'FCFS' | 'SSTF' | 'SCAN', direction: 'up' | 'down', maxTrack = 199): DemoStep[] {
  policy(scheduling, ['FCFS', 'SSTF', 'SCAN'])
  policy(direction, ['up', 'down'])
  integer(maxTrack, '最大柱面号', 1, 999)
  integer(head, '初始磁头位置', 0, maxTrack)
  numbers(requests, '磁盘请求', 30, maxTrack)
  const pending = requests.map((track, index) => ({ track, index }))
  const serviced: number[] = [], route = [head], steps: DemoStep[] = []
  let position = head, distance = 0
  const snapshot = (action: string, moved = 0) => steps.push({
    action,
    state: {
      '策略': scheduling, '初始方向': direction === 'up' ? '柱面号增大' : '柱面号减小',
      '物理范围': '0–' + maxTrack, '当前磁头': String(position), '本段移动': String(moved),
      '累计寻道距离': String(distance), '已服务请求': serviced.join(', ') || '尚无',
      '待处理请求': pending.map(r => r.track).join(', ') || '空', '路线': route.join(' → '),
    },
  })
  const move = (target: number, boundary = false, index?: number) => {
    const old = position, moved = Math.abs(target - position)
    distance += moved
    position = target
    route.push(target)
    if (!boundary) {
      const at = pending.findIndex(r => r.index === index)
      pending.splice(at, 1)
      serviced.push(target)
    }
    snapshot(boundary ? '反向仍有请求，先由' + old + '移动到物理边界' + target + '，再折返；这不是LOOK。' : '由' + old + '到' + target + '，服务该请求。', moved)
  }
  snapshot('同一柱面的重复请求保留，各次服务可以产生0寻道距离；最后一个请求完成即停止。')
  if (scheduling === 'FCFS') {
    for (const r of [...pending]) move(r.track, false, r.index)
  } else if (scheduling === 'SSTF') {
    while (pending.length) {
      const selected = [...pending].sort((a, b) => Math.abs(a.track - position) - Math.abs(b.track - position) || a.track - b.track || a.index - b.index)[0]
      move(selected.track, false, selected.index)
    }
  } else {
    const first = pending.filter(r => direction === 'up' ? r.track >= head : r.track <= head)
      .sort((a, b) => (direction === 'up' ? a.track - b.track : b.track - a.track) || a.index - b.index)
    for (const r of first) move(r.track, false, r.index)
    if (pending.length) {
      move(direction === 'up' ? maxTrack : 0, true)
      const second = [...pending].sort((a, b) => (direction === 'up' ? b.track - a.track : a.track - b.track) || a.index - b.index)
      for (const r of second) move(r.track, false, r.index)
    }
  }
  snapshot('全部请求完成即停止，不追加无意义的继续扫描。SSTF同距选较小柱面号，再按原输入顺序。')
  return steps
}

function ipv4Text(value: number): string {
  return [24, 16, 8, 0].map(shift => (value >>> shift) & 255).join('.')
}
function binary(value: number): string { return value.toString(2).padStart(32, '0').match(/.{8}/g)!.join('.') }

/** /31点到点端点语义依据RFC3021 §2.1，不套用普通子网扣2公式。 */
export function subnetSteps(ipv4: string, prefix: number): DemoStep[] {
  integer(prefix, 'CIDR前缀长度', 0, 32)
  if (typeof ipv4 !== 'string') throw new Error('IPv4必须为点分十进制字符串。')
  const octets = ipv4.trim().split('.')
  if (octets.length !== 4 || octets.some(s => !/^(0|[1-9]\d{0,2})$/.test(s) || Number(s) > 255)) throw new Error('IPv4须有4个0–255十进制段；不接受前导零。')
  const address = octets.reduce((value, octet) => value * 256 + Number(octet), 0)
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const network = (address & mask) >>> 0, end = (network | (~mask >>> 0)) >>> 0
  const total = 2 ** (32 - prefix)
  const ordinary = prefix <= 30
  const hosts = ordinary ? total - 2 : total
  const first = ordinary ? network + 1 : network, last = ordinary ? end - 1 : end
  const semantics = prefix === 31 ? '/31仅按点到点链路解释：两个地址都是端点，不设子网定向广播（RFC3021 §2.1）。'
    : prefix === 32 ? '/32是单地址前缀/主机路由，不再扣网络地址和广播地址；实际地址分配另看接口场景。'
      : '普通子网位划分：全0主机位为网络地址、全1为广播地址。此为理论范围，保留/特殊地址和设备规则另行排除；/0不代表全球全部地址都能分配。'
  const finalState = {
    '输入IP': ipv4Text(address), '前缀长度': String(prefix), '网络位/主机位': prefix + ' / ' + (32 - prefix),
    '掩码': ipv4Text(mask), '网络前缀地址': ipv4Text(network), '地址块末地址': ipv4Text(end),
    '广播地址': ordinary ? ipv4Text(end) : '无子网定向广播',
    '地址块总数': String(total), '可用主机数（模型）': String(hosts),
    '主机范围（模型）': ipv4Text(first) + ' – ' + ipv4Text(last), '语义': semantics,
  }
  return [
    { action: '把四个十进制段分别转为8位二进制；前缀指定高位网络部分。', state: { '地址二进制': binary(address), '前缀长度': String(prefix), '网络位/主机位': prefix + ' / ' + (32 - prefix) } },
    { action: '掩码前prefix位为1，其余主机位为0。/0与/32分别单独处理，避免JavaScript移位32位时回绕。', state: { '掩码': ipv4Text(mask), '掩码二进制': binary(mask) } },
    { action: 'IP与掩码按位AND，清掉全部主机位，得到网络前缀地址。', state: { '网络前缀地址': ipv4Text(network), 'AND结果二进制': binary(network) }, frames: ['IP    ' + binary(address), 'Mask  ' + binary(mask), 'AND   ' + binary(network)] },
    { action: '保持网络位，把主机位设为全1，得到地址块末地址；它是否是广播地址要看前缀语义。', state: { '地址块末地址': ipv4Text(end), '末地址二进制': binary(end), '广播地址': finalState['广播地址'] } },
    { action: '最后才判断可分配范围，/31与/32不能一律使用2的主机位次方减2。', state: finalState },
  ]
}

function divideBits(word: string, generator: string): { remainder: string; trace: { at: number; before: string; after: string; current: string }[] } {
  const work = word.split('').map(Number), divisor = generator.split('').map(Number)
  const trace: { at: number; before: string; after: string; current: string }[] = []
  for (let i = 0; i <= work.length - divisor.length; i++) {
    if (!work[i]) continue
    const before = work.slice(i, i + divisor.length).join('')
    for (let j = 0; j < divisor.length; j++) work[i + j] ^= divisor[j]
    trace.push({ at: i, before, after: work.slice(i, i + divisor.length).join(''), current: work.join('') })
  }
  return { remainder: work.slice(-(generator.length - 1)).join(''), trace }
}

/** GF(2)模2除法只异或，无借位；允许零数据，要求生成式首末位1。 */
export function crcSteps(dataBits: string, generatorBits: string): DemoStep[] {
  if (typeof dataBits !== 'string' || !/^[01]{1,64}$/.test(dataBits)) throw new Error('数据须为1–64位二进制串。')
  if (typeof generatorBits !== 'string' || !/^1[01]{0,15}1$/.test(generatorBits)) throw new Error('生成式须为2–17位二进制串，首末位均为1。')
  const degree = generatorBits.length - 1, padded = dataBits + '0'.repeat(degree)
  const { remainder, trace } = divideBits(padded, generatorBits), code = dataBits + remainder
  const verification = divideBits(code, generatorBits).remainder
  const steps: DemoStep[] = [{
    action: '生成式最高次数为r，先在数据后补r个0，再做模2长除。',
    state: { '原始数据': dataBits, '生成式': generatorBits, '次数r': String(degree), '补零被除数': padded },
  }]
  for (const step of trace) steps.push({
    action: '从左第' + (step.at + 1) + '位为1，将生成式对齐该位并异或；中间跳过的首位0不需要减。',
    state: { '对齐位置（0基）': String(step.at), '异或前局部': step.before, '生成式': generatorBits, '异或后局部': step.after, '当前余式': step.current },
  })
  steps.push({
    action: '保留r位余数并接回原数据，再验证码字可被生成式整除。通过CRC只代表未检测到错误，不是可靠传输或纠错保证。',
    state: { '次数r': String(degree), '余数': remainder, '发送码字': code, '码字验证余数': verification, '检验': /^0+$/.test(verification) ? '通过：余数全0' : '失败' },
  })
  return steps
}

/**
 * 固定6帧编号0..5，3位序号空间8，发送窗口3；SR接收窗口3、GBN接收窗口1。
 * 只丢指定帧首次传输，ACK立即且可靠、按序到达，不发新一轮/回绕；是教学事件模型。
 */
export function slidingWindowSteps(kind: 'GBN' | 'SR', lostFrame: number): DemoStep[] {
  policy(kind, ['GBN', 'SR'])
  integer(lostFrame, '首次丢失帧号（0基）', 0, 5)
  const buffer = new Set<number>(), acked = new Set<number>(), sent = new Set<number>(), delivered: number[] = []
  const steps: DemoStep[] = []
  let base = 0, next = 0, expected = 0, transmissions = 0, retransmissions = 0, lossDone = false
  const snapshot = (action: string) => steps.push({
    action,
    state: {
      '模型': '6帧0..5；序号空间8；发送窗3；ACK可靠立即反馈；只丢一次数据，不是完整协议仿真',
      '策略': kind, '发送窗口': base < 6 ? base + '..' + Math.min(base + 2, 5) : '全部确认', '下一新帧': next < 6 ? String(next) : '全部首次发送完',
      '接收方下个期望': String(expected),
      '接收乱序缓存': [...buffer].sort((a, b) => a - b).join(', ') || '空',
      '已上交序列': delivered.join(', ') || '尚无', '总发送帧次数': String(transmissions), '重传帧次数': String(retransmissions),
    },
    frames: Array.from({ length: 6 }, (_, n) => n + '：' + (delivered.includes(n) ? '已按序上交' : buffer.has(n) ? '已缓存' : sent.has(n) ? '已发，尚未按序交付' : '未发')),
  })
  const transmit = (frame: number, retry: boolean) => {
    transmissions++
    if (retry) retransmissions++
    sent.add(frame)
    if (frame === lostFrame && !lossDone) {
      lossDone = true
      snapshot('首次发送帧' + frame + '丢失；丢失本身不产生ACK，不能假称接收方确认了它。')
      return
    }
    if (kind === 'GBN') {
      if (frame === expected) {
        delivered.push(frame)
        expected++
        base = expected
        snapshot((retry ? '重传' : '首次发送') + '帧' + frame + '按序到达并上交；累计ACK=' + expected + '表示下个期望帧。')
      } else {
        snapshot('帧' + frame + '乱序到达，GBN窗口1丢弃它；重复累计ACK=' + expected + '，发送窗口不能越过缺口。')
      }
    } else {
      buffer.add(frame)
      while (buffer.has(expected)) { buffer.delete(expected); delivered.push(expected++) }
      acked.add(frame)
      while (acked.has(base)) base++
      snapshot((retry ? '重传' : '首次发送') + '帧' + frame + '被接收，独立ACK该帧；可缓存乱序，但只有连续前缀按序上交。')
    }
  }
  snapshot('初始为空。GBN累计ACK按下个期望编号；SR独立确认帧号，两种ACK不能混用。')
  while (base < 6) {
    if (next < 6 && next < base + 3) {
      transmit(next++, false)
      continue
    }
    if (kind === 'GBN') {
      const left = base, right = next
      snapshot('窗口不能前移或已发到尾部，最早未确认帧超时；GBN从' + left + '退回，重传已发但未累计确认的' + left + '..' + (right - 1) + '。')
      for (let frame = left; frame < right; frame++) transmit(frame, true)
    } else {
      const missing = Array.from({ length: next - base }, (_, i) => base + i).filter(frame => !acked.has(frame))
      snapshot('未收到独立ACK的帧超时；SR只选择重传缺失帧' + missing.join(', ') + '，已确认的后继不用重传。')
      for (const frame of missing) transmit(frame, true)
    }
  }
  snapshot('全部6帧按序上交。GBN重复发送被丢弃后继；SR保留正确后继，所以只重传首次丢失的帧。')
  return steps
}

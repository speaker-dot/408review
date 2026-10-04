/** 推演只计算确定性状态，UI 不修改算法。方便用单元测试复核每一步。 */
export interface DemoStep { action:string; state:Record<string,string>; frames?:string[] }
export function parseNumbers(text:string,max=40):number[]{
  const tokens=text.trim().split(/[，,\s]+/).filter(Boolean)
  if(!tokens.length || tokens.length>max)throw new Error(`请输入 1–${max} 个非负整数，用空格或逗号分隔。`)
  return tokens.map(t=>{if(!/^(?:\d+|0x[\da-f]+)$/i.test(t))throw new Error('只支持十进制非负整数或 0x 开头的十六进制。');const n=Number(t);if(!Number.isSafeInteger(n)||n>65535)throw new Error('数值范围为 0–65535。');return n})
}
export function lpsArray(pattern:string):number[]{
  const lps=Array(pattern.length).fill(0) as number[]
  for(let i=1,j=0;i<pattern.length;){if(pattern[i]===pattern[j])lps[i++]=++j;else if(j)j=lps[j-1];else i++}
  return lps
}
export function kmpSteps(text:string,pattern:string):DemoStep[]{
  if(!text.length||!pattern.length||text.length>80||pattern.length>30)throw new Error('主串 1–80 字符，模式串 1–30 字符。')
  if(!/^[\x20-\x7e]+$/.test(text+pattern))throw new Error('本实验按字符下标演示，请使用 ASCII 字符，避免 UTF-16 代理对歧义。')
  const lps=lpsArray(pattern),steps:DemoStep[]=[];let i=0,j=0,count=0;const matches:number[]=[]
  const snapshot=(action:string)=>steps.push({action,state:{'主串':text,'模式串':pattern,'i（下个待比较主串下标）':String(i),'j（已匹配长度）':String(j),'lps':lps.join(', '),'比较次数':String(count),'匹配起点（0 基）':matches.join(', ')||'尚无'}})
  snapshot('建立 lps 数组。lps[k] 是 pattern[0..k] 的最长相等真前后缀长度；这里不是 1 基 next 数组。')
  while(i<text.length){const pi=i,pj=j;count++
    if(text[i]===pattern[j]){i++;j++;if(j===pattern.length){matches.push(i-j);j=lps[j-1];snapshot(`S[${pi}] = P[${pj}]，得到完整匹配；回退已匹配长度以寻找重叠匹配。`)}else snapshot(`S[${pi}] = P[${pj}]，主串与模式匹配长度同时前进。`)}
    else if(j){j=lps[j-1];snapshot(`S[${pi}] ≠ P[${pj}]，i 不动，j 回退到 lps[${pj-1}]=${j}。`)}
    else{i++;snapshot(`S[${pi}] ≠ P[0]，没有可复用前缀，i 前进一位。`)}
  }
  snapshot(`主串扫描完毕，发现 ${matches.length} 处匹配。`);return steps
}
export function cacheSteps(addresses:number[],policy:'LRU'|'FIFO'='LRU'):DemoStep[]{
  // 固定配置有明确边界：16 位字节地址，块 16 B，2 组，每组 2 行，读访问。
  const sets:number[][]=[[],[]],steps:DemoStep[]=[];let hits=0
  steps.push({action:'Cache 初始为空。每组数组从左到右为最早替换到最晚替换。',state:{'配置':'16 B/块，2 组 × 2 行；读访问','策略':policy},frames:['组0：空','组1：空']})
  for(const a of addresses){if(!Number.isInteger(a)||a<0||a>65535)throw new Error('地址范围为 0–65535')
    const block=Math.floor(a/16),set=block%2,tag=Math.floor(block/2),offset=a%16,list=sets[set],at=list.indexOf(tag),hit=at>=0;let evicted:number|undefined
    if(hit){hits++;if(policy==='LRU'){list.splice(at,1);list.push(tag)}}else{if(list.length===2)evicted=list.shift();list.push(tag)}
    steps.push({action:`读地址 ${a}：${hit?'命中':'缺失'}${evicted===undefined?'':`，替换组 ${set} 中标记 ${evicted}`}。${policy==='FIFO' && hit?'FIFO 命中不改变入队顺序。':''}`,state:{'地址（16 位二进制）':a.toString(2).padStart(16,'0'),'标记 | 组号 | 偏移':`${tag} | ${set} | ${offset}`,'累计命中':String(hits),'累计访问':String(steps.length)},frames:sets.map((s,i)=>`组${i}：${s.join(' → ')||'空'}`)})
  }return steps
}
export function pageSteps(references:number[],capacity:number,policy:'FIFO'|'LRU'|'OPT'):DemoStep[]{
  if(!Number.isInteger(capacity)||capacity<1||capacity>6)throw new Error('页框数量必须为 1–6')
  const frames:number[]=[],born=new Map<number,number>(),used=new Map<number,number>();let faults=0
  const steps:DemoStep[]=[{action:'内存初始为空。页框编号固定，访问命中不会产生缺页。',state:{'策略':policy,'页框数':String(capacity),'缺页数':'0'},frames:Array(capacity).fill('空')}]
  references.forEach((p,i)=>{
    if(!Number.isInteger(p)||p<0)throw new Error('页号必须为非负整数')
    let replaced:number|undefined;const hit=frames.includes(p)
    if(!hit){faults++;if(frames.length<capacity)frames.push(p);else{
      let victim=0,best=policy==='OPT'?-1:Infinity
      frames.forEach((v,j)=>{let score:number;if(policy==='OPT'){const next=references.indexOf(v,i+1);score=next<0?Infinity:next;if(score>best){best=score;victim=j}}else{score=(policy==='FIFO'?born:used).get(v)!;if(score<best){best=score;victim=j}}})
      replaced=frames[victim];frames[victim]=p
    }born.set(p,i)}used.set(p,i)
    steps.push({action:`访问页 ${p}：${hit?'命中':'缺页'}${replaced===undefined?'':`，淘汰页 ${replaced}`}。${policy==='OPT'&&!hit?'OPT 查看未来首次使用位置，最晚使用者先淘汰（并列按页框顺序）。':''}`,state:{'当前访问位置（1 基）':String(i+1),'累计缺页':String(faults),'剩余访问':references.slice(i+1).join(', ')||'无'},frames:Array.from({length:capacity},(_,k)=>frames[k]===undefined?'空':String(frames[k]))})
  });return steps
}
export function tcpSteps(lost:number):DemoStep[]{
  if(!Number.isInteger(lost)||lost<1||lost>7)throw new Error('丢失段号必须为 1–7')
  const steps:DemoStep[]=[],buffer=new Set<number>();let expected=1,duplicates=0,lossPending=false,fastTriggered=false
  const snapshot=(action:string)=>steps.push({action,state:{'发送窗口（段单位）':`${expected}..${expected+3}（窗口=4段）`,'累计 ACK（下个期望段）':String(expected),'重复 ACK 数':String(duplicates),'接收乱序缓冲':[...buffer].sort((a,b)=>a-b).join(', ')||'空','模型':'MSS=1段；初始序号1；不演示拥塞窗口或字节序号'},frames:[1,2,3,4,5,6,7].map(v=>v<expected?`${v} ✓`:buffer.has(v)?`${v} 已缓冲`:v===lost&&lossPending?`${v} 丢失`:String(v))})
  const receive=(s:number,retransmit=false)=>{
    const old=expected;buffer.add(s);while(buffer.has(expected)){buffer.delete(expected);expected++}
    duplicates=expected===old?duplicates+1:0
    snapshot(`${retransmit?'重传':'发送'}段 ${s} 被接收，返回 ACK=${expected}${expected===old?'（重复 ACK）':'（累计确认）'}。`)
  }
  const retransmit=(reason:string)=>{snapshot(`${reason}，重传丢失段 ${lost}，已缓冲的后续段不用重传。`);lossPending=false;receive(lost,true)}
  snapshot('开始：只丢失指定段的首次传输，ACK 不丢失，接收方缓存窗口内乱序段。')
  for(let s=1;s<=7;s++){
    if(s>=expected+4&&lossPending)retransmit('窗口无法继续前移，等待重传超时')
    if(s===lost){lossPending=true;snapshot(`段 ${s} 首次发送丢失，接收方没有因“丢失本身”生成 ACK。`)}else receive(s)
    if(duplicates>=3&&lossPending&&!fastTriggered){fastTriggered=true;retransmit('收到 3 个重复 ACK，触发快重传')}
  }
  if(lossPending)retransmit('尾部丢失，重复 ACK 不足 3 个，等待重传超时')
  snapshot('最终 ACK=8，7 个段均按序交付。累计确认的是连续前缀，不是最大的已收到序号。');return steps
}

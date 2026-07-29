import { buildRichTraps } from './content-v2.mjs'

export { buildRichTraps }

const EXAM_URLS = {
  2023: 'https://www.xit.edu.cn/_upload/article/files/c1/ce/26986f79493495bbaacba9738587/ac8ae739-b5ab-4d8e-b5cf-441525833872.pdf',
  2024: 'https://www.xit.edu.cn/_upload/article/files/c1/ce/26986f79493495bbaacba9738587/6b611f5c-55d9-4612-8ff9-30b028731314.pdf',
  2025: 'https://www.xit.edu.cn/_upload/article/files/c1/ce/26986f79493495bbaacba9738587/d9fce855-72bd-4e00-9a48-5d4ec5ef6f72.pdf',
}

function examSource(year, questionNo) {
  return {
    label: `${year} 年全国硕士研究生招生考试 408`,
    year,
    questionNo: `第 ${questionNo} 题`,
    url: EXAM_URLS[year],
    adapted: true,
  }
}

function originalSource(label = '原创·408 模拟题') {
  return { label, adapted: false }
}

/**
 * 这里只记录“年份—题号—考点”的映射，不保存真题全文。
 * 站内题干会重新设定数据和表述，解析也由项目独立编写。
 */
const examTopicMap = [
  [/顺序表|线性表的逻辑特性/, [[2023, 1]]],
  [/单链表|双链表|循环链表/, [[2023, 2], [2024, 1]]],
  [/稀疏矩阵|三元组/, [[2023, 3]]],
  [/栈的应用|表达式求值|括号匹配/, [[2024, 2], [2025, 2]]],
  [/KMP|Next/, [[2024, 6]]],
  [/二叉树的定义|完全二叉树|遍历|森林/, [[2023, 5], [2024, 3], [2025, 3]]],
  [/哈夫曼|WPL/, [[2023, 4], [2025, 5]]],
  [/图的存储|邻接多重表|图的基本概念/, [[2024, 4], [2025, 6]]],
  [/BFS|广度优先/, [[2023, 6]]],
  [/B 树|B\+ 树/, [[2023, 7], [2025, 8]]],
  [/折半查找|判定树/, [[2023, 8], [2024, 5]]],
  [/哈希|散列|冲突处理|装填因子/, [[2023, 9], [2025, 9]]],
  [/快速排序|堆排序|希尔排序|排序算法的比较/, [[2023, 10], [2024, 8], [2025, 10]]],
  [/CPI|MIPS|性能指标/, [[2023, 12], [2025, 18]]],
  [/补码|无符号数与有符号数|溢出/, [[2023, 13], [2023, 16], [2025, 12]]],
  [/IEEE 754|浮点/, [[2023, 14], [2025, 13]]],
  [/指令格式|寻址方式|ISA/, [[2023, 17], [2025, 16]]],
  [/数据通路|寄存器组织/, [[2023, 18], [2025, 19]]],
  [/流水线|数据相关|控制相关/, [[2023, 19]]],
  [/总线性能|总线带宽/, [[2023, 20], [2024, 20], [2025, 20]]],
  [/程序中断|中断隐指令|异常/, [[2023, 21], [2024, 21], [2025, 22]]],
  [/DMA/, [[2023, 22], [2024, 22], [2025, 21]]],
  [/宏内核|微内核|操作系统内核/, [[2023, 23]]],
  [/进程的状态|线程|调度/, [[2023, 27], [2023, 29], [2024, 30]]],
  [/分页|页表|虚拟内存|逻辑地址|物理地址/, [[2023, 25], [2023, 28], [2024, 25], [2025, 24]]],
  [/文件控制块|索引结点|空闲空间/, [[2023, 31], [2024, 26], [2025, 29]]],
  [/磁盘调度/, [[2024, 32], [2025, 32]]],
  [/奈奎斯特|香农|调制/, [[2023, 34], [2024, 34]]],
  [/停止-等待|GBN|SR 协议|滑动窗口/, [[2023, 35], [2024, 37]]],
  [/CRC|校验码/, [[2023, 37], [2025, 34]]],
  [/CSMA\/CD|二进制指数退避/, [[2023, 36], [2025, 35]]],
  [/子网划分|CIDR|IPv4 地址/, [[2023, 39], [2025, 47]]],
  [/IPv6/, [[2023, 40]]],
  [/TCP 连接|TCP 可靠|TCP 流量|TCP 拥塞/, [[2024, 38], [2025, 38]]],
  [/HTTP|持久连接|非持久连接/, [[2024, 40]]],
]

function sourcesFor(name) {
  const found = examTopicMap.find(([test]) => test.test(name))
  return found ? found[1].map(([year, questionNo]) => examSource(year, questionNo)) : []
}

function splitSentences(text) {
  return text
    .split(/[；。]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function cleanSentence(text) {
  return text.trim().replace(/[；。]$/, '')
}

function numberedSteps(text) {
  return splitSentences(text)
    .map((step, index) => `${index + 1}. **${step}。**`)
    .join('\n')
}

function focusPoints(profile) {
  const definition = splitSentences(profile.definition)
  const structure = splitSentences(profile.structure)
  return [
    definition[0] ?? profile.definition,
    structure[0] ?? profile.structure,
    `看到题目先检查适用条件，再使用 $${profile.formula}$，不要只凭记忆套结论。`,
  ]
}

const exampleBank = [
  {
    test: /时间复杂度|渐进符号/,
    text: '例如循环变量每次乘 2：$i=1,2,4,\\ldots$，执行次数由 $2^k\\le n$ 得 $k\\le\\log_2n$，所以时间复杂度是 $\\Theta(\\log n)$。重点不是“看到循环就写 $O(n)$”，而是数基本操作真正执行了多少次。',
  },
  {
    test: /顺序表.*插入|插入与删除/,
    text: '长度为 6 的顺序表在第 3 个位置插入新元素时，原第 3～6 个元素必须从后向前移动，共移动 $6-3+1=4$ 次。若从前向后搬，会在读取旧值前把它覆盖。',
  },
  {
    test: /单链表|双链表|循环链表/,
    text: '在单链表结点 $p$ 后插入 $s$，先做 `s->next = p->next`，再做 `p->next = s`。若顺序颠倒，原后继地址会丢失。双链表还要补齐两条 `prev` 方向的链接，并单独处理尾结点边界。',
  },
  {
    test: /^循环队列（判空判满条件）$/,
    text: '若数组容量为 8 且牺牲一个单元区分空与满，则空条件是 $front=rear$，满条件是 $(rear+1)\\bmod 8=front$，最多存 7 个元素。题目若改用 `size` 计数，判满条件就会改变。',
  },
  {
    test: /KMP|Next/,
    text: '模式串出现失配时，KMP 不回退主串指针，只把模式指针跳到 `next[j]`。手算前必须先写清教材采用 0 下标还是 1 下标，因为同一模式串在不同约定下的 next 数值外观不同，但“利用已匹配前后缀”这一含义不变。',
  },
  {
    test: /二叉树的定义|完全二叉树|结点数与度数/,
    text: '一棵非空二叉树若有 $n_0=7$ 个叶结点，则度为 2 的结点一定有 $n_2=6$ 个。这个结论来自边数计数，与树是否完全无关；度为 1 的结点数不会出现在该等式中。',
  },
  {
    test: /遍历|重建二叉树/,
    text: '先序给出根，中序负责把剩余结点划成左、右子树。例如先序 `ABDCE`、中序 `DBAEC`：根是 A，中序左段 `DB`、右段 `EC`，再递归处理。只有先序与后序通常不能唯一重建一般二叉树。',
  },
  {
    test: /哈夫曼|WPL/,
    text: '权值 $2,3,7,9$ 每次合并两个最小值：$2+3=5$、$5+7=12$、$9+12=21$，于是 $WPL=5+12+21=38$。直接把叶权相加只能得到 21，并不是带权路径长度。',
  },
  {
    test: /Dijkstra/,
    text: '若源点到 A、B 的暂定距离分别为 3、8，且边 $A\\to B$ 权重为 2，确定 A 后松弛得到 $dist[B]=\\min(8,3+2)=5$。暂定距离第一次被写入并不代表已经最终确定。',
  },
  {
    test: /关键路径|AOE/,
    text: '事件最早时间前推时取最大值，因为所有前驱活动都完成事件才发生；最迟时间逆推时取最小值，以免拖延汇点。活动余量为 0 才是关键活动，但缩短一条关键活动不一定缩短总工期，因为可能同时存在多条关键路径。',
  },
  {
    test: /折半查找|判定树/,
    text: '在 600 个有序元素中成功折半查找，最坏比较次数不超过 $\\lfloor\\log_2 600\\rfloor+1=10$。但若底层是单链表，找到中点本身需要顺序移动，整体不能据此直接写成 $O(\\log n)$。',
  },
  {
    test: /哈希|散列|装填因子/,
    text: '表长 7，散列函数 $H(k)=k\\bmod7$，依次插入 10、17、24 时三者初址都为 3。线性探测会占用 3、4、5 号位置；查找失败必须继续探测到真正的空单元，不能在遇到“已删除”标记时停止。',
  },
  {
    test: /快速排序/,
    text: '一次划分结束后，枢轴左侧都不大于它、右侧都不小于它，但左右两段内部并未有序。若每次枢轴都落在端点，递归树退化，时间复杂度会从平均 $O(n\\log n)$ 恶化为 $O(n^2)$。',
  },
  {
    test: /IEEE 754|浮点/,
    text: '单精度数 `0 10000001 010000…` 的阶码真值为 $129-127=2$，尾数为 $1.01_2=1.25$，因此数值为 $1.25\\times2^2=5$。读题时先分符号、阶码、尾数三段，再判断是否为规格化数或特殊值。',
  },
  {
    test: /CPI|性能指标/,
    text: '程序执行 $10^9$ 条指令，平均 $CPI=1.5$，主频 3 GHz，则 CPU 时间为 $10^9\\times1.5/(3\\times10^9)=0.5\\,s$。主频更高不必然更快，还必须同时看指令数与 CPI。',
  },
  {
    test: /Cache 基本|映射方式/,
    text: '4 KiB Cache、64 B 块、2 路组相联共有 $4096/(64\\times2)=32$ 组，因此块内偏移 6 位、组索引 5 位。地址拆分必须先算“组数”，不能把总行数直接当作组数。',
  },
  {
    test: /分页|页表|TLB|地址变换/,
    text: '页大小 4 KiB 即 $2^{12}$ B，所以地址低 12 位是页内偏移。虚拟地址 `0x12345ABC` 的页号为 `0x12345`、偏移为 `0xABC`；换页框时偏移保持不变，只有高位页号被页框号替换。',
  },
  {
    test: /调度算法|周转时间/,
    text: '进程到达时刻为 2、完成时刻为 11，则周转时间是 $11-2=9$；若服务时间为 4，等待时间是 $9-4=5$。SJF 只能在已经到达的进程中选最短者，不能为了等待未来短作业而让 CPU 空闲。',
  },
  {
    test: /信号量|生产者|读者|哲学家|进程同步/,
    text: '容量为 $N$ 的有界缓冲区通常设 `empty=N`、`full=0`、`mutex=1`。生产者必须先 `wait(empty)` 再 `wait(mutex)`；若反过来并在缓冲区满时持有 mutex 等待 empty，消费者无法进入临界区释放空位，可能死锁。',
  },
  {
    test: /银行家|安全状态/,
    text: '安全性检查令 $Work=Available$。找到满足 $Need_i\\le Work$ 的进程后，模拟其完成并执行 $Work=Work+Allocation_i$。回收的是已分配资源，不是 Need，也不是 Max；能找到一条安全序列即可证明当前状态安全。',
  },
  {
    test: /页面置换|LRU|FIFO/,
    text: '引用串 `1,2,3,1,4`、3 个页框下，访问第 4 个页面 1 命中。FIFO 不改变装入次序，随后淘汰最早装入的 1；LRU 会刷新页面 1 的最近使用时刻，随后淘汰页面 2。两种算法从这里开始分叉。',
  },
  {
    test: /奈奎斯特|香农/,
    text: '无噪声带宽 4 MHz、若每个码元携带 6 bit，则奈奎斯特上限为 $2B\\log_2V=2\\times4M\\times6=48$ Mbps，对应 $V=64$ 种码元。若题目给信噪比，则应改用香农公式判断信道容量。',
  },
  {
    test: /GBN|SR 协议|滑动窗口/,
    text: '3 bit 序号下，GBN 发送窗口最大为 $2^3-1=7$，SR 在收发窗口相等时最大为 $2^{3-1}=4$。前者接收方只收按序帧并累计确认，后者可以缓存窗口内失序帧并单独确认。',
  },
  {
    test: /子网划分|CIDR/,
    text: '地址 `192.168.10.70/27` 的块大小是 32，70 落在 64～95，因此网络地址为 `.64`、广播地址为 `.95`、普通主机范围为 `.65`～`.94`。最长前缀匹配比较的是匹配前缀长度，不是掩码十进制数值。',
  },
  {
    test: /TCP/,
    text: '发送 1000 B 数据且首字节序号为 500，则接收方无缺失时确认号为 1500；确认号表示“下一个期望字节”，不是最后收到的字节。实际可发送窗口还要取 $\\min(rwnd,cwnd)$。',
  },
]

function workedExample(node, profile) {
  const matched = exampleBank.find(({ test }) => test.test(node.name))
  if (matched) return matched.text
  const steps = splitSentences(profile.procedure)
  return `做一个最小推演：先写清“${cleanSentence(profile.definition)}”；然后执行“${steps[0] ?? '识别对象与约束'}”；每完成一步都问“本步读了什么、改了什么、哪条定义允许这样改”。最后用 $${profile.formula}$ 检查数量级、单位或边界。这个例子不要求背表格，目标是把定义转换成一条可复查的推理链。`
}

function childRoadmap(children) {
  if (!children.length) return ''
  return [
    '',
    '本节点是章节入口，建议按下面顺序进入子节点：',
    '',
    ...children.map(
      (child, index) =>
        `${index + 1}. **${child.name}**（参见 ID: ${child.id}）：先回答它解决什么问题，再做对应过程题。`,
    ),
  ].join('\n')
}

export function buildRichDetails(node, profile, children, subjectName) {
  const points = focusPoints(profile)
  const prerequisite =
    node.parentId !== node.category
      ? `先修：直接上位概念 (参见 ID: ${node.parentId})。`
      : `这是${subjectName}的一级主干，先建立全章地图，再进入叶子知识点。`
  const sourceHints = sourcesFor(node.name)
  const historyText = sourceHints.length
    ? `近年可核验考法包括 ${sourceHints.map((item) => `${item.year} 年${item.questionNo}`).join('、')}。`
    : '本节点更常作为相邻考点的前置条件或干扰项来源，复习时以理解边界为主。'

  return [
    '### 先抓重点',
    `> **一句话讲明白：** ${cleanSentence(profile.definition)}。`,
    '>',
    `> **本节最重要的结论：** ${points[0]}；${points[1]}。`,
    '>',
    `> **做题第一反应：** ${points[2]}`,
    '',
    prerequisite,
    '',
    '读完本节，你需要能完成三件事：**用白话解释概念、判断结论的适用边界、按步骤推出可验证结果**。如果只能背出术语，却说不清“为什么”和“什么时候不能用”，说明还没有真正掌握。',
    '',
    '### 核心定义',
    profile.definition,
    '',
    '不要把定义读成一整块。把它拆成下面四个问题：',
    '',
    '| 要问的问题 | 本节应抓住什么 |',
    '|---|---|',
    `| 研究对象是什么？ | 围绕“${node.name}”中被组织、传送、调度或计算的对象展开 |`,
    `| 前提是什么？ | 先核对输入范围、表示方法、下标约定和边界条件 |`,
    `| 哪些量会变化？ | ${cleanSentence(profile.structure)} |`,
    `| 怎样算完成？ | 结果满足定义，并能由 $${profile.formula}$ 或不变量复核 |`,
    '',
    '### 为什么需要它',
    `这个知识点不是孤立术语，而是在“正确性、时间、空间、硬件代价或通信代价”之间作选择。${profile.structure} 同一个逻辑问题换一种表示，算法步骤和代价可能立刻改变；因此 408 喜欢把“逻辑上正确”与“在当前表示上高效”放在同一个选项里考查。`,
    '',
    '**理解时请始终区分两层：**',
    '',
    '- **模型层**：对象之间是什么关系，哪些结论由定义保证。',
    '- **实现层**：这些关系存在哪里，一次读、写、比较或传输要付出什么代价。',
    '',
    '只背模型层，容易在代码、地址或性能题中失分；只背实现步骤，又容易在题目更换前提后机械套用。',
    '',
    '### 数据结构与状态',
    profile.structure,
    childRoadmap(children),
    '',
    '草稿纸上建议只保留三类信息：',
    '',
    '1. **不变量**：整个过程中始终为真的约束。',
    '2. **当前状态**：本轮允许变化的指针、数组项、寄存器、队列、窗口或计时量。',
    '3. **输出证据**：前驱链、访问序列、中间矩阵、地址拆分或关键计算式。',
    '',
    '这三类信息分开写，能避免“新状态覆盖旧状态”和“最后有答案却没有过程分”。',
    '',
    '### 解题步骤',
    numberedSteps(profile.procedure),
    '',
    '**每一步都要能回答：为什么此刻允许这样做？** 如果答案只是“因为公式这么写”，就回到定义检查前提。选择题可用反例排除绝对化说法；综合题则要保留初始化、关键变化、终止条件和最终判断。',
    '',
    '### 关键公式',
    `$$${profile.formula}$$`,
    '',
    '| 检查顺序 | 具体动作 |',
    '|---|---|',
    '| 1. 定义符号 | 写出每个字母、下标和单位，不让同一字母在题中承担两个含义 |',
    '| 2. 核对前提 | 检查有序/无序、正权/负权、连续/离散、可抢占/不可抢占等限制 |',
    '| 3. 再代数值 | 先保留表达式，再统一 bit、Byte、Hz、s 等单位 |',
    '| 4. 验证结果 | 用极端值、逆运算、不变量或数量级判断答案是否合理 |',
    '',
    '### 具体例子',
    workedExample(node, profile),
    '',
    '**复盘重点不是抄答案，而是找“第一次发生分叉的位置”**：不同算法、不同表示或不同边界条件从哪一步开始得到不同结果？能说清这一点，才具备迁移到新题的能力。',
    '',
    '### 必须记住的结论',
    `- **定义结论：** ${points[0]}。`,
    `- **表示结论：** ${points[1]}。`,
    `- **过程结论：** ${splitSentences(profile.procedure).at(-1) ?? profile.procedure}。`,
    `- **公式结论：** $${profile.formula}$ 只能在题设满足相应前提时使用。`,
    '',
    '### 408考情',
    `${profile.exam} ${historyText}`,
    '',
    '408 选择题常见命题方式是：保留熟悉结论，只改动一个前提、单位、更新时机或数据表示。综合应用题则按“建模—关键过程—结果—验证/复杂度”给分。复习时不要追求同模板刷五遍；应至少覆盖**概念辨析、边界反例、过程追踪、计算或设计**中的不同考法。',
  ].join('\n')
}

function rotateOptions(options, correctIndex, shift) {
  const normalizedShift = shift % options.length
  const rotated = [...options.slice(normalizedShift), ...options.slice(0, normalizedShift)]
  const rotatedCorrect = (correctIndex - normalizedShift + options.length) % options.length
  return {
    options: rotated.map((option, index) => `${'ABCD'[index]}. ${option}`),
    answer: 'ABCD'[rotatedCorrect],
  }
}

function stableShift(id, salt = 0) {
  return [...id].reduce((sum, char) => sum + char.charCodeAt(0), salt) % 4
}

const subjectLabels = {
  DS: '数据结构',
  CS: '计算机组成原理',
  OS: '操作系统',
  NET: '计算机网络',
}

function definitionChoice(node, profile) {
  const correct = cleanSentence(profile.definition)
  const rotated = rotateOptions(
    [
      correct,
      `“${node.name}”一旦选定，结论就与输入边界和具体表示无关`,
      `只要最终数值相同，中间状态的更新顺序可以任意交换`,
      `无论输入规模和实现方式如何，其全部操作代价都恒为 $O(1)$`,
    ],
    0,
    stableShift(node.id),
  )
  return {
    type: 'choice',
    question: `在${subjectLabels[node.category]}中，关于“${node.name}”的定义与适用条件，下列说法正确的是（ ）。`,
    ...rotated,
    explanation: `正确项抓住了定义中的对象、约束和结果：${profile.definition} 其余选项分别把有条件结论绝对化、忽略状态依赖，或在没有分析输入规模与实现时武断给出复杂度。遇到这类题，先圈出题干中的边界词，再用定义逐项核对。`,
  }
}

function boundaryChoice(node, profile) {
  const trap = cleanSentence(profile.traps[0] ?? '忽略适用前提')
  const correct = `先确认题设满足定义与边界，再按“${cleanSentence(profile.procedure)}”推演`
  const rotated = rotateOptions(
    [
      correct,
      `看到熟悉公式 $${profile.formula}$ 后立即代数，不必定义符号和单位`,
      `即使出现“${trap}”，仍可直接沿用原结论`,
      '只检查最终答案是否与选项相同，不需要检查中间状态',
    ],
    0,
    stableShift(node.id, 7),
  )
  return {
    type: 'choice',
    question: `某同学在处理${subjectLabels[node.category]}中的“${node.name}”题目时，下面哪一种做法最可靠（ ）。`,
    ...rotated,
    explanation: `应先检查前提，再按过程推进。公式只是压缩后的关系，不会替你完成对象识别、单位统一和边界判断。本题的典型陷阱是“${trap}”；一旦前提被改变，即使公式外形熟悉，也应重新建模而不是继续套用。`,
  }
}

function processChoice(node, profile) {
  const steps = splitSentences(profile.procedure)
  const first = steps[0] ?? '读取题设'
  const second = steps[1] ?? '建立状态'
  const last = steps.at(-1) ?? '验证结论'
  const correct = `先“${first}”，再“${second}”，最后“${last}”`
  const rotated = rotateOptions(
    [
      correct,
      `先写最终结论，再根据结论反推一个看似合理的中间过程`,
      `本轮判断直接读取尚未提交的新状态，并覆盖所有旧状态`,
      `忽略终止条件，只要中间结果暂时不变就立即结束`,
    ],
    0,
    stableShift(node.id, 13),
  )
  return {
    type: 'choice',
    question: `处理${subjectLabels[node.category]}中的“${node.name}”过程题时，下列操作顺序正确的是（ ）。`,
    ...rotated,
    explanation: `规范顺序来自该知识点自身的状态依赖：${profile.procedure} 错误选项要么倒因为果，要么混用新旧状态，要么没有依据就提前终止。过程题的关键不是多写字，而是让每一次状态变化都能追溯到定义或不变量。`,
  }
}

const verifiedChoices = [
  {
    test: /^单链表的定义与实现$/,
    build: () => ({
      question: '带头结点单链表中，指针 `p` 指向非尾结点，欲把 `p` 的直接后继结点 `q` 移到表首。下列操作序列正确的是（ ）。',
      options: [
        'A. `q=p->next; p->next=q->next; q->next=head->next; head->next=q;`',
        'B. `q=p->next; q->next=p; head->next=q;`',
        'C. `head->next=q; q->next=p->next; p->next=q;`',
        'D. `p->next=head->next; head->next=p->next;`',
      ],
      answer: 'A',
      explanation: '必须先保存 `p` 的后继 q，再让 p 跨过 q，最后把 q 接到头结点之后。A 中每条原链都在被覆盖前得到保存；其余操作会造成自环、重复链接或丢失原表首/后继。',
    }),
  },
  {
    test: /^稀疏矩阵的三元组与十字链表$/,
    build: () => ({
      question: '使用三元组表保存稀疏矩阵时，除全部非零元素的“行号、列号、值”外，还必须单独保存（ ）。',
      options: [
        'A. 矩阵总行数、总列数和非零元素个数',
        'B. 仅含非零元素的行数和列数',
        'C. 每一行的最大元素',
        'D. 主对角线元素个数',
      ],
      answer: 'A',
      explanation: '三元组无法体现末尾的全零行或全零列，因此不能单独确定矩阵的完整形状。总行数、总列数与非零项数必须作为表头信息保存。',
    }),
  },
  {
    test: /^栈的应用：括号匹配、表达式求值$/,
    build: () => ({
      question: '中缀表达式 $x+y\\times(z-u)/v$ 对应的后缀表达式是（ ）。',
      options: ['A. `xyzu-×v/+`', 'B. `xyz×u-v/+`', 'C. `xyzu-×v/+`', 'D. `xy+zu-×v/`'],
      answer: 'C',
      explanation: '括号内先得到 `zu-`，再与 y 做乘法得到 `yzu-×`，随后除以 v，最后与 x 相加，所以为 `xyzu-×v/+`。运算数输出次序不变，栈只保存尚未输出的运算符。',
    }),
  },
  {
    test: /^KMP 算法/,
    build: () => ({
      question: 'KMP 匹配中，主串指针为 $i$、模式串指针为 $j$。当 $S[i]\\ne P[j]$ 且 $j$ 不在模式首位时，标准处理是（ ）。',
      options: [
        'A. 同时令 $i=i-1$、$j=j-1$',
        'B. 保持 $i$ 不变，令 $j=next[j]$',
        'C. 令 $i$ 回到本轮匹配起点，$j$ 不变',
        'D. 同时把 $i$、$j$ 置为 0',
      ],
      answer: 'B',
      explanation: 'KMP 利用已匹配部分的最长相等前后缀，失配时只移动模式指针，主串指针不回退。若同时回退 i，就会退化成朴素匹配。',
    }),
  },
  {
    test: /^由遍历序列重建二叉树$/,
    build: () => ({
      question: '已知一棵一般二叉树的先序序列和后序序列，下列结论正确的是（ ）。',
      options: [
        'A. 一定能唯一确定该二叉树',
        'B. 仅当结点数为奇数时唯一',
        'C. 通常不能唯一确定，还需要中序序列或额外结构条件',
        'D. 只需知道树高即可唯一',
      ],
      answer: 'C',
      explanation: '先序和后序无法普遍区分只有一个孩子时该孩子在左还是在右。先序+中序或后序+中序在关键字互异时通常可唯一重建。',
    }),
  },
  {
    test: /^B 树与 B\+ 树/,
    build: () => ({
      question: '关于用于外存索引的 B 树与 B+ 树，下列说法正确的是（ ）。',
      options: [
        'A. B+ 树所有记录均只出现在内部结点',
        'B. B+ 树叶结点通常按关键字有序链接，适合范围查询',
        'C. B 树非叶结点不保存任何关键字',
        'D. 两者每个结点都必须恰好达到最大分支数',
      ],
      answer: 'B',
      explanation: 'B+ 树的数据记录集中在叶层，叶结点按关键字顺序链接，范围扫描可连续向后。内部结点作为索引；B 树内部结点则可以保存记录信息。',
    }),
  },
  {
    test: /^快速排序/,
    build: () => ({
      question: '某趟快速排序划分结束后，枢轴位于下标 k。此时必然成立的是（ ）。',
      options: [
        'A. 整个序列已经有序',
        'B. 左右两个子序列各自已经有序',
        'C. 枢轴左侧元素不大于枢轴，右侧元素不小于枢轴',
        'D. 枢轴一定是当前序列的中位数',
      ],
      answer: 'C',
      explanation: '一次 partition 只把枢轴放到最终位置并完成两侧的大小划分，左右子区间内部仍可能无序。枢轴也不保证是中位数。',
    }),
  },
  {
    test: /^堆排序/,
    build: () => ({
      question: '对大根堆执行一次删除堆顶操作后，恢复堆序的正确做法是（ ）。',
      options: [
        'A. 将最后一个元素移到根，从根开始向下调整',
        'B. 将最后一个元素移到根，从最后一个叶结点向上建堆',
        'C. 删除根后直接把左右子树拼接',
        'D. 对剩余元素执行一次冒泡排序',
      ],
      answer: 'A',
      explanation: '末元素填根可保持完全二叉树形态，但根可能小于孩子，因此应沿较大孩子方向下滤，直到恢复堆序，单次调整为 $O(\\log n)$。',
    }),
  },
  {
    test: /^无符号数与有符号数/,
    build: () => ({
      question: '8 位机器数 `1111 1110` 分别解释为无符号整数和补码有符号整数，其值是（ ）。',
      options: ['A. 254 和 -2', 'B. 254 和 -1', 'C. 126 和 -2', 'D. -2 和 254'],
      answer: 'A',
      explanation: '按无符号解释得到 254；按 8 位补码解释，取反加一得到绝对值 2，所以为 -2。同一比特串的数值取决于类型解释。',
    }),
  },
  {
    test: /^IEEE 754 标准$/,
    build: () => ({
      question: 'IEEE 754 单精度位串为 `0 10000001 01000000000000000000000`，其十进制值是（ ）。',
      options: ['A. 2.5', 'B. 5', 'C. 10', 'D. -5'],
      answer: 'B',
      explanation: '符号位为 0，阶码真值 $129-127=2$，规格化尾数为 $1.01_2=1.25$，故数值为 $1.25\\times2^2=5$。',
    }),
  },
  {
    test: /^补码的加减法运算/,
    build: () => ({
      question: '两个 8 位补码正数相加，结果符号位变为 1。关于溢出判断，下列说法正确的是（ ）。',
      options: [
        'A. 一定无溢出，只产生进位',
        'B. 发生有符号溢出，应检查 OF',
        'C. 只要 CF=0 就无溢出',
        'D. 补码加法不存在溢出',
      ],
      answer: 'B',
      explanation: '同号正数相加却得到负号结果，说明真实和超过补码正数上限。OF 用于有符号溢出，CF 主要服务于无符号加法，二者不能混用。',
    }),
  },
  {
    test: /^数据相关、结构相关、控制相关的处理$/,
    build: () => ({
      question: '五段流水线中，`lw r1,0(r2)` 紧接 `add r3,r1,r4`。即使有常见转发通路，通常仍需停顿，原因是（ ）。',
      options: [
        'A. 加载数据到访存阶段末才产生，下一条执行阶段来不及使用',
        'B. 两条指令操作码相同',
        'C. 寄存器 r1 不允许写入',
        'D. 加法指令一定引起控制冒险',
      ],
      answer: 'A',
      explanation: '这是典型 load-use 冒险：加载数据在 MEM 阶段结束才可用，而紧随其后的 add 在更早的 EX 阶段需要该值，普通转发无法跨越这个时序差。',
    }),
  },
  {
    test: /^DMA 方式/,
    build: () => ({
      question: 'DMA 传送数据时，主要的数据通路位于（ ）。',
      options: [
        'A. 外设接口与主存之间',
        'B. CPU 通用寄存器与外设之间',
        'C. CPU 算术逻辑部件与主存之间',
        'D. 中断向量表与设备驱动之间',
      ],
      answer: 'A',
      explanation: 'DMA 控制器取得总线控制权后，在设备接口与主存之间成块搬运数据。CPU 只负责初始化参数并在完成后处理通知，不逐字节执行传送。',
    }),
  },
  {
    test: /^进程的状态与转换/,
    build: () => ({
      question: '单核系统中，正在运行的进程时间片用完后，其典型状态转换是（ ）。',
      options: ['A. 运行态→就绪态', 'B. 运行态→阻塞态', 'C. 就绪态→阻塞态', 'D. 阻塞态→运行态'],
      answer: 'A',
      explanation: '时间片用完时进程仍具备运行条件，只是暂时失去 CPU，因此回到就绪队列。等待 I/O 或同步事件才进入阻塞态。',
    }),
  },
  {
    test: /^文件控制块 FCB 与索引结点$/,
    build: () => ({
      question: '一个进程关闭其打开的普通文件时，文件系统通常会做的是（ ）。',
      options: [
        'A. 更新进程打开文件表并减少相应打开引用',
        'B. 一定删除目录项',
        'C. 一定释放磁盘索引结点',
        'D. 一定把硬链接计数减 1',
      ],
      answer: 'A',
      explanation: 'close 结束的是一次打开引用，不等价于删除文件。目录项、硬链接计数和磁盘索引结点是否释放由 unlink 及链接/打开引用情况决定。',
    }),
  },
  {
    test: /^磁盘的结构与调度算法/,
    build: () => ({
      question: 'C-SCAN 磁盘调度与 SCAN 的主要区别是（ ）。',
      options: [
        'A. C-SCAN 只在一个方向服务请求，回程直接移到另一端',
        'B. C-SCAN 总选择距离最近的请求',
        'C. C-SCAN 从不移动到磁盘端点',
        'D. C-SCAN 与 FCFS 完全相同',
      ],
      answer: 'A',
      explanation: 'SCAN 往返两个方向都服务，C-SCAN 只沿固定方向服务，到端点后回到另一端再继续，因此等待时间分布通常更均匀。',
    }),
  },
  {
    test: /^检错编码（奇偶校验、CRC）$/,
    build: () => ({
      question: 'CRC 生成多项式为 $G=10011$，发送数据后附加的余数位数应为（ ）。',
      options: ['A. 3', 'B. 4', 'C. 5', 'D. 16'],
      answer: 'B',
      explanation: '生成多项式最高次数为 4，CRC 余数位数等于次数，因此为 4 bit。发送端先补 4 个 0 做模 2 除法，再用余数替换。',
    }),
  },
  {
    test: /^IPv6 数据报格式、地址类型$/,
    build: () => ({
      question: '关于 IPv6，下列说法正确的是（ ）。',
      options: [
        'A. 基本首部固定为 40 B，路由器不对数据报分片',
        'B. 使用广播地址替代多播',
        'C. 地址长度为 64 bit',
        'D. 一个地址中可以使用多次 `::` 压缩',
      ],
      answer: 'A',
      explanation: 'IPv6 地址为 128 bit，基本首部固定 40 B，中间路由器不分片。IPv6 不使用 IPv4 式广播，一个文本地址中 `::` 最多出现一次。',
    }),
  },
  {
    test: /^TCP 报文段格式/,
    build: () => ({
      question: 'TCP 发送方以序号 500 发送 1000 B 数据，接收方连续无误收到后返回的确认号应为（ ）。',
      options: ['A. 500', 'B. 1000', 'C. 1499', 'D. 1500'],
      answer: 'D',
      explanation: 'TCP 按字节编号，本段携带字节 500～1499；累计确认号表示下一个期望字节，因此为 1500，而不是最后收到的 1499。',
    }),
  },
  {
    test: /^HTTP 协议/,
    build: () => ({
      question: '浏览器使用非持久 HTTP/1.0，且不允许并行 TCP 连接。页面含 1 个 HTML 文件和 7 个小对象，忽略传输时间，从首次建连开始至少需要（ ）个 RTT。',
      options: ['A. 8', 'B. 9', 'C. 14', 'D. 16'],
      answer: 'D',
      explanation: '每个对象单独建立 TCP：1 RTT 建连、1 RTT 请求并收到响应，共 2 RTT。总对象数为 8，串行请求需 $8\\times2=16$ RTT。',
    }),
  },
]

const specificChoices = [
  ...verifiedChoices,
  {
    test: /循环队列/,
    build: () => ({
      question: '容量为 8 的循环队列牺牲一个存储单元区分队空和队满。若 `front=3`、`rear=2`，则队列当前状态及元素个数是（ ）。',
      options: ['A. 队空，0 个', 'B. 队满，7 个', 'C. 非空非满，6 个', 'D. 非空非满，7 个'],
      answer: 'B',
      explanation: '牺牲一个单元时，队满条件为 $(rear+1)\\bmod8=front$。这里 $(2+1)\\bmod8=3=front$，故队满；可用容量为 $8-1=7$。不能仅凭 rear 小于 front 判断为空。',
    }),
  },
  {
    test: /^结点数与度数的关系$/,
    build: () => ({
      question: '某非空二叉树有 12 个度为 2 的结点、5 个度为 1 的结点，则叶结点数和总结点数分别为（ ）。',
      options: ['A. 11，28', 'B. 12，29', 'C. 13，30', 'D. 17，34'],
      answer: 'C',
      explanation: '二叉树满足 $n_0=n_2+1$，故叶结点 $n_0=13$。总结点 $n=n_0+n_1+n_2=13+5+12=30$。度为 1 的结点不影响前一等式，但计算总结点时必须计入。',
    }),
  },
  {
    test: /^折半查找（判定树构造）$/,
    build: () => ({
      question: '对含 600 个关键字的有序顺序表执行折半查找，一次成功查找的关键字比较次数最多为（ ）。',
      options: ['A. 9', 'B. 10', 'C. 300', 'D. 600'],
      answer: 'B',
      explanation: '$2^9=512<600<1024=2^{10}$，最坏成功比较次数为 $\\lfloor\\log_2 600\\rfloor+1=10$。前提是有序顺序表；换成链表后，访问中点的代价会改变整体效率。',
    }),
  },
  {
    test: /^带权路径长度 WPL 计算$/,
    build: () => ({
      question: '权值集合为 $\\{2,3,7,9\\}$，按哈夫曼算法构造二叉树，其带权路径长度为（ ）。',
      options: ['A. 21', 'B. 33', 'C. 38', 'D. 42'],
      answer: 'C',
      explanation: '依次合并 $2+3=5$、$5+7=12$、$9+12=21$。哈夫曼树的 WPL 等于每次合并权值之和，即 $5+12+21=38$。21 只是所有叶权之和。',
    }),
  },
  {
    test: /^CPI、MIPS、FLOPS$/,
    build: () => ({
      question: '某程序执行 $10^9$ 条指令，平均 CPI 为 1.5，处理器主频为 3 GHz。忽略其他开销，其 CPU 执行时间为（ ）。',
      options: ['A. 0.25 s', 'B. 0.5 s', 'C. 1.5 s', 'D. 2 s'],
      answer: 'B',
      explanation: '$T=IC\\times CPI/f=10^9\\times1.5/(3\\times10^9)=0.5\\,s$。主频、CPI 和指令数必须同时参与计算，不能只比较主频。',
    }),
  },
  {
    test: /^Cache 基本原理与映射方式/,
    build: () => ({
      question: '32 位按字节编址，Cache 数据区 4 KiB，块大小 64 B，2 路组相联。主存地址中的组索引位数为（ ）。',
      options: ['A. 4', 'B. 5', 'C. 6', 'D. 10'],
      answer: 'B',
      explanation: '组数 $=4096/(64\\times2)=32=2^5$，所以组索引 5 位；块内偏移为 $\\log_2 64=6$ 位。组相联题必须先由容量、块大小和路数求组数。',
    }),
  },
  {
    test: /^分页存储管理/,
    build: () => ({
      question: '页大小为 4 KiB，虚拟地址为 `0x12345ABC`，则页内偏移为（ ）。',
      options: ['A. `0x123`', 'B. `0x345`', 'C. `0xABC`', 'D. `0x45ABC`'],
      answer: 'C',
      explanation: '4 KiB 为 $2^{12}$ B，页内偏移占低 12 位，即低 3 个十六进制数字 `ABC`。地址转换只替换页号对应的高位，页内偏移保持不变。',
    }),
  },
  {
    test: /^奈奎斯特定理与香农定理/,
    build: () => ({
      question: '无噪声信道带宽为 4 MHz，采用 64 种码元的调制方式，奈奎斯特极限数据率为（ ）。',
      options: ['A. 24 Mbps', 'B. 32 Mbps', 'C. 48 Mbps', 'D. 64 Mbps'],
      answer: 'C',
      explanation: '$R=2B\\log_2V=2\\times4\\times10^6\\times6=48$ Mbps。64 种码元每个码元携带 6 bit；无噪声题使用奈奎斯特公式。',
    }),
  },
  {
    test: /^GBN 协议/,
    build: () => ({
      question: 'GBN 协议使用 3 bit 帧序号，为避免新旧帧混淆，发送窗口最大可取（ ）。',
      options: ['A. 3', 'B. 4', 'C. 7', 'D. 8'],
      answer: 'C',
      explanation: 'GBN 的发送窗口上限是 $2^k-1$，当 $k=3$ 时为 7。若取满 8，序号回绕后接收方无法区分新一轮帧与旧帧。',
    }),
  },
  {
    test: /^SR 协议/,
    build: () => ({
      question: 'SR 协议使用 3 bit 帧序号，发送窗口与接收窗口相等，则窗口最大可取（ ）。',
      options: ['A. 3', 'B. 4', 'C. 7', 'D. 8'],
      answer: 'B',
      explanation: 'SR 要求发送窗口与接收窗口之和不超过序号空间，二者相等时 $W\\le2^{k-1}=4$。这与 GBN 的 $2^k-1$ 不同。',
    }),
  },
  {
    test: /^子网划分与子网掩码、CIDR/,
    build: () => ({
      question: '主机地址为 `192.168.10.70/27`，其所在子网的广播地址为（ ）。',
      options: ['A. `192.168.10.63`', 'B. `192.168.10.64`', 'C. `192.168.10.94`', 'D. `192.168.10.95`'],
      answer: 'D',
      explanation: '/27 的块大小为 32，70 位于 64～95 这一块；网络地址是 64，广播地址是 95，可用主机为 65～94。',
    }),
  },
]

function specificChoice(node) {
  const matched = specificChoices.find(({ test }) => test.test(node.name))
  if (!matched) return undefined
  const quiz = matched.build()
  return {
    type: 'choice',
    ...quiz,
    explanation: `${quiz.explanation} 核对这类计算题时，还应把公式、代入过程和边界条件各写一行，避免只凭选项反推答案。`,
  }
}

function quizSourceAt(node) {
  const sources = sourcesFor(node.name)
  return sources.at(-1) ?? originalSource()
}

const customAnalyses = [
  {
    test: /^邻接矩阵（适合稠密图）$/,
    source: examSource(2023, 41),
    quiz: {
      type: 'analysis',
      question: '有向图采用邻接矩阵 `A[n][n]` 存储。请设计一个算法，输出所有“出度严格大于入度”的顶点，并返回这类顶点的个数。要求说明设计思想，给出伪代码，并分析时间复杂度。',
      answer: [
        '对每个顶点 $v_i$，扫描邻接矩阵的第 $i$ 行统计出度，扫描第 $i$ 列统计入度；若 `out > in` 则输出并计数。',
        '',
        '```text',
        'count = 0',
        'for i = 0 .. n-1:',
        '    out = 0; in = 0',
        '    for j = 0 .. n-1:',
        '        out += (A[i][j] != 0)',
        '        in  += (A[j][i] != 0)',
        '    if out > in:',
        '        print(i)',
        '        count++',
        'return count',
        '```',
        '',
        '邻接矩阵的每一行、每一列都被扫描，时间复杂度为 $O(n^2)$；除计数变量外额外空间为 $O(1)$。',
      ].join('\n'),
      explanation: '这是真正的算法设计题：先把“出度、入度”的定义落到邻接矩阵的行与列，再写循环。得分点包括统计方向正确、遍历全部顶点、输出与计数、复杂度。若是邻接表，统计入度需要额外数组或再次扫描所有边，复杂度表达也应随存储结构改变。',
    },
  },
  {
    test: /^AOV 网与拓扑排序算法$/,
    source: examSource(2024, 41),
    quiz: {
      type: 'analysis',
      question: '有向图采用邻接矩阵存储。请设计算法判断该图是否存在唯一拓扑序列。要求说明如何同时识别“存在环”和“拓扑序不唯一”，并给出复杂度。',
      answer: [
        '先统计所有顶点入度。每轮收集当前入度为 0 且尚未输出的顶点：',
        '',
        '- 若数量为 0 且仍有顶点未输出，图中有环，不存在拓扑序；',
        '- 若数量大于 1，本轮有多种选择，拓扑序不唯一；',
        '- 若数量恰为 1，输出该顶点并删除其所有出边。',
        '',
        '只有连续 $n$ 轮都恰好找到一个零入度顶点，才能判定拓扑序唯一。邻接矩阵实现中，每轮扫描顶点并删除一行出边，时间复杂度为 $O(n^2)$，入度数组与删除标记占 $O(n)$ 空间。',
      ].join('\n'),
      explanation: '关键不是最后能否输出全部顶点，而是“每一轮零入度候选是否唯一”。仅判断最终输出数等于 $n$ 只能证明是 DAG，不能证明拓扑序唯一。写代码时应在删除出边前检查候选个数，否则会错过分叉点。',
    },
  },
  {
    test: /^冲突处理方法/,
    source: examSource(2024, 42),
    quiz: {
      type: 'analysis',
      question: '长度为 11 的空散列表使用 $H(key)=(3key)\\bmod11$，冲突时按 $H_i=(H(key)+i^2)\\bmod11$ 探测。依次插入关键字 20、3、11、18、9、14、7。请画出最终散列表，计算装填因子，并分别写出查找 14 与查找失败关键字 8 的探测序列。',
      answer: [
        '逐个计算初址并在冲突时增加平方偏移：',
        '',
        '| 地址 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
        '| 关键字 | 11 | 18 | — | 20 | — | 7 | 9 | 14 | 3 | — | — |',
        '',
        '装填因子 $\\alpha=7/11$。查找 14 时，初址为 9，探测序列为地址 $9,10,2,7$，在地址 7 成功。查找 8 时初址为 2，而地址 2 为空，因此第一次比较探测即确认失败。',
      ].join('\n'),
      explanation: '平方探测的偏移是相对初始散列地址计算，不能在上一次地址上继续累加 $i^2$。查找必须复现插入时完全相同的探测序列；遇到从未使用的空单元可停止，遇到删除标记则不能停止。画表、装填因子、成功序列、失败停止位置是四个独立得分点。',
    },
  },
  {
    test: /^数据通路$/,
    source: examSource(2024, 43),
    quiz: {
      type: 'analysis',
      question: '某 32 位定长指令系统含 `add rd,rs1,rs2`、`slli rd,rs1,shamt` 和 `lw rd,imm(rs1)`。通用寄存器字段均为 5 位，移位量字段也为 5 位。请回答：①最多有多少个通用寄存器；②为何移位量 5 位足够；③执行 `lw` 时立即数为何必须符号扩展；④无符号加法溢出应检查 OF 还是 CF。',
      answer: [
        '1. 5 位寄存器编号可表示 $2^5=32$ 个通用寄存器。',
        '2. 32 位字一次逻辑移位的有效移位量为 0～31，正好需要 5 位。',
        '3. `lw` 的有效地址为 $R[rs1]+imm$，偏移量可能为负，因此立即数应符号扩展后送入 ALU 做加法。',
        '4. 无符号加法用进位标志 CF 判断溢出；OF 反映有符号补码结果是否超出可表示范围。',
      ].join('\n'),
      explanation: '这类综合题把指令格式、数据通路和数值表示串在一起。字段宽度决定编码容量，控制信号决定数据来自寄存器还是扩展后的立即数，标志位的解释则取决于操作数被视为有符号还是无符号。作答时应逐小问标明“位宽依据—数据来源—ALU 操作—标志解释”。',
    },
  },
  {
    test: /^信号量机制/,
    source: examSource(2024, 46),
    quiz: {
      type: 'analysis',
      question: '共享缓冲区 B 只能容纳一个分组。操作 C1 向空缓冲区写入，C2 从非空缓冲区读出，C3 修改非空缓冲区。①两个进程都执行 C1 时，C1 是否属于临界区？②B 初始为空，一个进程执行一次 C1、另一个执行一次 C2，使用尽可能少的信号量描述同步；③B 初始非空，两个进程各执行一次 C3，描述互斥。',
      answer: [
        '1. C1 属于临界区，因为两个进程同时写 B 会产生竞争，必须互斥访问共享数据。',
        '2. 只需一个同步信号量 `full=0`：写进程完成 C1 后 `signal(full)`；读进程先 `wait(full)` 再执行 C2。由于每个操作只执行一次且 C1、C2 有确定先后，本小问无需再引入计数缓冲区模型。',
        '3. 只需互斥信号量 `mutex=1`。两个进程均执行 `wait(mutex); C3; signal(mutex);`。',
      ].join('\n'),
      explanation: '题目要求“尽可能少”，所以不能机械套用生产者—消费者的 empty/full/mutex 三信号量。先判断约束是同步还是互斥：C1→C2 是发生先后，使用初值 0 的同步量；两个 C3 之间只是不能并发进入临界区，使用初值 1 的互斥量。',
    },
  },
  {
    test: /^层次路由（BGP）$/,
    source: examSource(2024, 47),
    quiz: {
      type: 'analysis',
      question: '某大型自治系统内部任意两台主机通信可能经过 20 台以上路由器；边界路由器还需向其他自治系统通告前缀。请说明：①内部应优先选择 RIP 还是 OSPF；②跨自治系统可达性由什么协议、什么类型会话传播；③路由器从多条 AS 路径中选路时，为什么不能只写“跳数最少”。',
      answer: [
        '1. 内部优先选择 OSPF。RIP 以跳数度量且最大有效距离为 15，不适合可能超过 15 跳的大型自治系统；OSPF 使用链路状态与层次区域，更适合扩展。',
        '2. 跨自治系统使用 BGP。不同 AS 边界路由器之间使用 eBGP，会话把可达前缀及 AS_PATH 等路径属性通告出去；同一 AS 内再通过 iBGP 传播外部路由信息。',
        '3. BGP 是策略型路径向量协议，选路会综合本地策略和多种路径属性。AS_PATH 较短只是常见比较项之一，不等价于 IGP 中简单的路由器跳数。',
      ].join('\n'),
      explanation: '综合题的主线是先分清“自治系统内”和“自治系统间”。RIP/OSPF 属于 IGP，BGP 属于 EGP；eBGP 与 iBGP 的传播范围不同。作答时明确协议类别、适用规模和度量/属性，比只背报文名更稳。',
    },
  },
]

function legacyIsSpecific(legacyAnalysis) {
  return Boolean(
    legacyAnalysis &&
      !legacyAnalysis.question.includes('某系统需要使用') &&
      legacyAnalysis.question.length > 120,
  )
}

const legacyAnalysisNodes =
  /银行家算法|Cache 基本原理与映射方式|页面置换算法|^调度算法（FCFS|子网划分与子网掩码、CIDR|TCP 拥塞控制|Dijkstra 算法|AOE 网与关键路径算法|GBN 协议/

function sourceForLegacy(node) {
  if (/Cache 基本原理/.test(node.name)) return examSource(2023, 43)
  if (/AOE 网与关键路径/.test(node.name)) return examSource(2025, 42)
  if (/GBN 协议/.test(node.name)) return examSource(2025, 47)
  return originalSource('原创·408 综合模拟题')
}

function analysesFor(node, legacyAnalysis) {
  const result = []
  const custom = customAnalyses.find(({ test }) => test.test(node.name))
  if (custom) {
    result.push({ ...custom.quiz, source: custom.source })
  }
  if (legacyAnalysisNodes.test(node.name) && legacyIsSpecific(legacyAnalysis) && !custom) {
    result.push({
      ...legacyAnalysis,
      source: sourceForLegacy(node),
    })
  }
  return result
}

export function buildQuizSet(node, profile, legacyAnalysis) {
  const depth = node.id.split('-').length
  const choices = []
  const special = specificChoice(node)
  if (special) choices.push(special)
  choices.push(definitionChoice(node, profile))
  if (depth >= 3) choices.push(boundaryChoice(node, profile))
  if (depth >= 4 && !special) choices.push(processChoice(node, profile))

  const uniqueChoices = choices.filter(
    (quiz, index, all) => all.findIndex((item) => item.question === quiz.question) === index,
  )
  uniqueChoices.forEach((quiz) => {
    quiz.source =
      quiz === special ? quizSourceAt(node) : originalSource('原创·分层理解练习')
  })

  const analyses = analysesFor(node, legacyAnalysis)
  const quizzes = [...uniqueChoices, ...analyses]
  return quizzes.map((quiz, index) => ({
    ...quiz,
    id: `${node.id}-Q${String(index + 1).padStart(3, '0')}`,
  }))
}

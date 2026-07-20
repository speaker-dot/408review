const EXAM_2025_URL =
  'https://www.xit.edu.cn/_upload/article/files/c1/ce/26986f79493495bbaacba9738587/d9fce855-72bd-4e00-9a48-5d4ec5ef6f72.pdf'

const verifiedChoiceTopics = [
  [/时间复杂度|空间复杂度|渐进符号|算法基本概念/, '第1题'],
  [/括号匹配|表达式求值|栈的应用/, '第2题'],
  [/二叉树的定义与性质|顺序存储|完全二叉树/, '第3题'],
  [/树与森林|森林与二叉树/, '第4题'],
  [/哈夫曼/, '第5题'],
  [/图的基本概念|有向图|无向图|回路/, '第6题'],
  [/分块查找/, '第7题'],
  [/B 树与 B\+ 树/, '第8题'],
  [/哈希|散列|冲突处理/, '第9题'],
  [/排序算法的比较|稳定性、内部排序|简单选择排序/, '第10题'],
  [/希尔排序|基数排序|归并排序|折半插入/, '第11题'],
  [/无符号数与有符号数|补码|类型转换/, '第12题'],
  [/IEEE 754|浮点数/, '第13题'],
  [/溢出判断|补码的加减/, '第14题'],
  [/边界对齐|小端|大端|数据表示/, '第15题'],
  [/指令集|指令格式|ISA/, '第16题'],
  [/CISC 与 RISC|RISC/, '第17题'],
  [/CPI|计算机性能指标|时钟周期/, '第18题'],
  [/数据通路|控制器|CPU 的功能与结构/, '第19题'],
  [/总线性能指标|带宽|总线概述/, '第20题'],
  [/DMA/, '第21题'],
  [/程序中断|中断隐指令|异常/, '第22题'],
  [/上下文切换|页表基址|分页存储管理/, '第23题'],
  [/操作系统概述|虚拟/, '第24题'],
  [/优先级|调度算法|处理机调度/, '第25题'],
  [/LRU|页面置换算法/, '第26题'],
  [/最少页框|虚拟内存的基本概念/, '第27题'],
  [/文件系统基础|文件系统实现/, '第28题'],
  [/索引结点|FCB/, '第29题'],
  [/文件共享|进程间通信|内存映射/, '第30题'],
  [/空闲空间管理|FAT/, '第31题'],
  [/磁盘组织|磁盘调度|固态硬盘/, '第32题'],
  [/电路交换|报文交换|分组交换/, '第33题'],
  [/海明码|检错|纠错编码/, '第34题'],
  [/CSMA|以太网|冲突域/, '第35题'],
  [/DHCP/, '第36题'],
  [/UDP|NAT|校验和/, '第37题'],
  [/TCP/, '第38题'],
  [/C\/S|UDP 协议|TCP 协议/, '第39题'],
  [/POP3|电子邮件/, '第40题'],
]

const verifiedAnalysisTopics = [
  [/算法基本概念|时间复杂度|数组|顺序表/, '第41题'],
  [/AOE 网|关键路径/, '第42题'],
  [/Cache 基本|映射方式|页式虚拟存储|地址变换/, '第43题'],
  [/补码除法|异常|中断/, '第44题'],
  [/信号量|经典同步|进程同步|互斥/, '第45题'],
  [/进程的概念与组成|进程状态|逻辑地址|虚拟地址空间/, '第46题'],
  [/GBN|子网划分|CIDR|传播时延|吞吐量/, '第47题'],
]

function officialSource(questionNo) {
  return {
    label: '2025 年全国硕士研究生招生考试 408',
    year: 2025,
    questionNo,
    url: EXAM_2025_URL,
    adapted: true,
  }
}

function originalSource() {
  return { label: '原创·408 真题风格', adapted: false }
}

function findSource(name, mappings) {
  const matched = mappings.find(([test]) => test.test(name))
  return matched ? officialSource(matched[1]) : undefined
}

function sentences(value) {
  return value
    .split(/[；。]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function numberedProcedure(value) {
  const steps = sentences(value)
  return steps.map((step, index) => `${index + 1}. **第 ${index + 1} 步：**${step}。`).join('\n')
}

function childOverview(children) {
  if (!children.length) return '本节点是可直接训练的叶子知识点，学习时要把输入、状态变化、输出和边界条件写在同一张草稿表中。'
  return `本节点向下分为 ${children.length} 个训练单元：${children
    .map((child) => `“${child.name}”(参见 ID: ${child.id})`)
    .join('、')}。先建立总框架，再进入子节点做计算或过程题。`
}

export function buildRichDetails(node, profile, children, subjectName) {
  const prerequisite =
    node.parentId !== node.category
      ? `先修要求：先理解直接上位概念 (参见 ID: ${node.parentId})。`
      : `这是${subjectName}的一级主干章节，适合作为整章学习入口。`
  const steps = sentences(profile.procedure)
  const firstStep = steps[0] ?? '识别题设对象与约束'
  const lastStep = steps.at(-1) ?? '核对结果与适用条件'

  return [
    '### 学习目标与直觉',
    `${prerequisite}学完“${node.name}”后，你应能完成三件事：用自己的话解释它解决什么问题；看到题设时判断能否使用；把中间状态完整写出并验证答案。不要一开始死背结论，先问“题目给了什么、哪些量会变化、最后要证明什么”。`,
    '',
    `直觉上，${profile.definition}初学者可以把它看成一条“输入 → 状态变化 → 输出”的流水线：输入由题设给出，状态按规则更新，输出必须满足定义和边界。`,
    '',
    '### 核心定义',
    `${profile.definition}定义中最需要圈出的词是“对象、前提、操作和结果”：对象决定讨论范围，前提决定公式能否使用，操作决定状态如何变化，结果则给出可检查的结论。`,
    '',
    '| 阅读题目时要找的量 | 作用 | 自检问题 |',
    '|---|---|---|',
    `| 对象与输入 | 确认“${node.name}”处理的实体 | 输入是否完整，是否存在空集、极值或非法状态？ |`,
    `| 约束与不变量 | 限制每一步允许怎样变化 | ${firstStep}之前，前提是否已经满足？ |`,
    `| 输出与评价指标 | 决定最终写数值、序列、路径还是判断 | ${lastStep}之后，是否能反代或复算？ |`,
    '',
    '### 数据结构',
    `${profile.structure}${childOverview(children)}`,
    '',
    '做题时建议把信息分为四栏：**静态参数**（整个过程不变）、**动态状态**（每轮更新）、**判定标志**（记录是否处理过）和**结果记录**（前驱、次序、代价或地址）。混写这些信息，是初学者最常见的丢分原因。',
    '',
    '### 算法步骤',
    numberedProcedure(profile.procedure),
    '',
    '每一步都要回答“读了什么、改了什么、为什么允许这样改”。若是选择题，可用定义逐项排除；若是综合题，至少保留初始化、关键轮次、终止条件和最终结论。',
    '',
    '### 关键公式',
    `核心关系为 $${profile.formula}$。公式不是背完就能用：先写符号含义与单位，再检查前提，最后代入。若结果出现负容量、越界下标、概率大于 1、窗口超出序号空间等现象，应立即回查模型。`,
    '',
    '| 使用公式的四步检查 | 要点 |',
    '|---|---|',
    '| 1. 定义量 | 给每个符号写中文含义，区分总量、增量、下标和单位 |',
    '| 2. 查前提 | 检查非负、连续/离散、是否可抢占、是否允许重复等题设条件 |',
    '| 3. 做代入 | 先保留表达式，再代数字，避免中途舍入 |',
    '| 4. 验结果 | 用数量级、边界值或逆运算复核 |',
    '',
    '### 例题推演',
    `设题目要求判断一份关于“${node.name}”的方案是否正确。第一行先写模型与前提；第二行按“${firstStep}”初始化；中间逐轮记录状态；最后执行“${lastStep}”。若某一步违反定义，就应在该步停止并说明需要修改的条件，而不是继续算出一个看似完整的数字。`,
    '',
    '推荐草稿格式：',
    '',
    '| 轮次 | 当前输入/对象 | 本轮判断 | 状态更新 | 依据 |',
    '|---|---|---|---|---|',
    '| 0 | 题设初值 | 检查合法性 | 完成初始化 | 定义与边界 |',
    '| 1 | 当前候选 | 判断是否满足条件 | 只更新允许变化的量 | 核心规则 |',
    '| … | 重复直到终止 | 检查终止条件 | 固化结果 | 公式与不变量 |',
    '',
    '### 初学者学习路线',
    `第一遍只解决“看得懂”：给每个术语写一句白话解释，并画出对象之间的关系；第二遍解决“会操作”：遮住答案，按“${profile.procedure}”独立完成一遍；第三遍解决“会迁移”：主动修改一个输入、边界或约束，观察结论哪里开始变化。`,
    '',
    '复盘时把错误归到三类：概念错误说明定义没有理解，过程错误说明状态更新顺序不熟，计算错误说明公式、单位或边界检查不足。下一次练习只针对对应环节训练，比重复抄整页答案更有效。',
    '',
    '建议在错题本保留四项：**原判断、错误发生的第一步、正确依据、可复用的检查句**。例如检查句可以是“本轮读取旧状态还是新状态？”“公式的两个量单位一致吗？”“题目是否满足该结论的必要前提？”。',
    '',
    '### 408考情',
    `${profile.exam} 408 单项选择题常改动一个前提制造干扰项；综合题则按“建模—过程—结果—复杂度/性能”给分。复习时不要只看答案，应能在空白纸上重建过程表。`,
    '',
    '考场建议：先在题干标出单位、边界和关键词；再写核心公式或不变量；计算后把结论翻译成题目所问的自然语言。即使最终数值失误，规范的中间表、公式和判断依据通常仍有步骤分。',
  ].join('\n')
}

export function buildRichTraps(node, profile) {
  const examSource =
    findSource(node.name, verifiedChoiceTopics) ??
    findSource(node.name, verifiedAnalysisTopics)
  const raw = [
    profile.traps[0] ?? `忽略“${node.name}”成立的前提`,
    profile.traps[1] ?? '更新状态的时机错误',
    `只记住 $${profile.formula}$，没有定义符号、单位和边界`,
    '综合题只写最终结论，不保留初始化、关键轮次和验证过程',
  ]

  return raw.map((mistake, index) => ({
    title: ['前提偷换', '状态更新时机', '公式机械套用', '过程分丢失'][index],
    mistake: `${mistake}。`,
    why:
      index === 0
        ? `“${node.name}”的结论只在定义规定的对象与约束下成立。408 干扰项常保留熟悉的结论，却悄悄改变边界、数据表示或可用条件。`
        : index === 1
          ? `状态更新过早会使用本轮尚未生效的信息，更新过晚又会让下一轮读取旧值；二者都可能使后续每一步连锁出错。`
          : index === 2
            ? '同一个字母在不同题目中可能表示容量、位数、速率或数量；单位不一致时即使代数运算正确，结果也没有物理意义。'
            : '408 综合题按步骤给分。没有中间状态，阅卷人无法确认你是否用了正确模型，最终答案一旦算错就很难获得过程分。',
    correction:
      index === 0
        ? '先抄下触发规则的关键词，再逐项核对对象、范围和特殊值；缺少任何一个必要前提时，明确写“不能直接套用”。'
        : index === 1
          ? `画出“旧状态 → 判断 → 新状态”三列，本轮所有判断只读旧状态，再按“${profile.procedure}”规定的顺序提交更新。`
          : index === 2
            ? `在公式 $${profile.formula}$ 下方逐个写符号含义和单位，先做量纲与数量级检查，再代入具体数字。`
            : '至少写出初始化表、一次关键迭代、终止条件、最终结论和复杂度/性能；表格中的列名应直接对应题目给分点。',
    example:
      index === 0
        ? `若选项声称“${node.name}在任何输入下都成立”，先尝试空输入、最小规模、上界和不满足前提的反例，而不是凭熟悉感选择。`
        : index === 1
          ? `把题设数据代入时，先记录第 0 轮初值；第 1 轮只依据初值判断，完成后再统一写入新状态，并复核不变量。`
          : index === 2
            ? `算得结果后检查：计数应为整数，概率应在 $[0,1]$，时间与速率的单位应能约掉，地址或下标不能越界。`
            : `把答案整理为“依据—过程表—结果—验证”四段；即使最后一步算术失误，前面三段仍能清楚展示正确思路。`,
    ...(index === 0 && examSource ? { source: examSource } : { source: originalSource() }),
  }))
}

function choiceTemplates(node, profile) {
  const statements = [
    profile.definition.replace(/。$/, ''),
    profile.structure.replace(/。$/, ''),
    profile.procedure.replace(/。$/, ''),
    `使用 $${profile.formula}$ 前，应先核对符号、单位、边界和适用前提`,
    `${profile.exam.replace(/。$/, '')}；作答时应保留可验证的中间状态`,
  ]
  const correctLetters = ['A', 'B', 'C', 'D', 'B']
  const distractors = [
    `“${node.name}”的所有结论都与输入规模和边界无关`,
    '只要最终数字相同，状态更新次序和中间过程可以任意交换',
    '遇到熟悉公式时无需检查单位与适用条件，可直接代入',
    '任何实现的时间、空间或传输代价都恒为 $O(1)$',
  ]

  return statements.map((correct, index) => {
    const letter = correctLetters[index]
    const correctPosition = 'ABCD'.indexOf(letter)
    const options = distractors.map((text, optionIndex) =>
      `${'ABCD'[optionIndex]}. ${optionIndex === correctPosition ? correct : text}`,
    )
    return {
      question: [
        `关于“${node.name}”的核心定义，下列说法正确的是（ ）。`,
        `学习“${node.name}”时，下列关于表示与状态组织的说法正确的是（ ）。`,
        `处理“${node.name}”相关题目时，下列过程描述正确的是（ ）。`,
        `关于“${node.name}”的公式与计算，下列做法正确的是（ ）。`,
        `按照 408 的命题与作答要求，下列关于“${node.name}”的说法正确的是（ ）。`,
      ][index],
      options,
      answer: letter,
      explanation: `${letter} 正确：${correct}。其余选项分别把有条件结论绝对化、忽略状态依赖、跳过单位与边界检查，或在没有分析实现与输入规模时武断给出复杂度。判断这类题时，应先写出定义中的对象与前提，再按“${profile.procedure}”检查过程，最后使用 $${profile.formula}$ 做量纲和边界复核。尤其要防止以下陷阱：${profile.traps.join('；')}。`,
    }
  })
}

function genericAnalysis(node, profile, ordinal) {
  const isSecond = ordinal === 2
  return {
    type: 'analysis',
    question: isSecond
      ? `某同学处理“${node.name}”时给出方案：跳过前提检查，直接代入 $${profile.formula}$，得到数值后立即作为结论。请按下表完成纠错，并给出规范解题流程。\n\n| 检查项 | 该方案是否充分 | 应补充的内容 |\n|---|---|---|\n| 对象与前提 | ？ | ？ |\n| 中间状态 | ？ | ？ |\n| 公式与单位 | ？ | ？ |\n| 结果验证 | ？ | ？ |`
      : `围绕“${node.name}”完成一次 408 风格过程分析。题设给出规模 $n$ 的合法输入、全部初始状态以及必要约束。请写出表示、关键步骤、终止条件和代价分析。\n\n| 阶段 | 需要回答的问题 |\n|---|---|\n| 建模 | 哪些量固定，哪些量每轮更新？ |\n| 初始化 | 第 0 轮状态如何得到？ |\n| 推演 | 每一轮读取、判断和更新什么？ |\n| 验证 | 如何确认输出合法？ |\n| 代价 | 时间、空间或性能瓶颈在哪里？ |`,
    answer: isSecond
      ? `该方案不充分，规范修正如下：\n\n| 检查项 | 判断 | 修正 |\n|---|---|---|\n| 对象与前提 | 不充分 | 先写“${profile.definition}”，圈出适用对象与边界 |\n| 中间状态 | 缺失 | 按轮记录静态参数、动态状态、判定标志与输出记录 |\n| 公式与单位 | 不充分 | 定义 $${profile.formula}$ 中每个符号，统一单位后再代入 |\n| 结果验证 | 缺失 | 用边界值、逆运算或不变量复核，并把结果翻译成题目所问结论 |\n\n正确流程是：${profile.procedure}。若任一必要前提不成立，应停止套用原结论并改选符合题设的模型。`
      : `可按下表组织完整答案：\n\n| 阶段 | 标准作答 |\n|---|---|\n| 建模 | ${profile.structure} |\n| 初始化 | 写清输入规模 $n$、初始状态、边界和所有标志位 |\n| 推演 | ${profile.procedure} |\n| 验证 | 检查定义、不变量、边界，并用 $${profile.formula}$ 复核 |\n| 代价 | 统计随 $n$ 重复的基本操作与额外状态；若题目给出具体实现，再据此写复杂度或性能 |\n\n最终结论必须包含结果、适用条件及至少一个验证依据。`,
    explanation: `这类综合题的核心不是背诵一段话，而是把“${node.name}”转化为阅卷可检查的状态变化。第一得分点是建模：${profile.structure}；第二得分点是过程：${profile.procedure}；第三得分点是用 $${profile.formula}$ 验证。复杂度分析必须数真实执行的基本操作，性能题则要统一时间、容量、频率或速率单位。常见失分是“${profile.traps.join('”和“')}”。建议最后用一分钟检查表头是否覆盖题目所有小问。`,
    source: originalSource(),
  }
}

export function buildQuizSet(node, profile, legacyAnalysis) {
  const verifiedChoice = findSource(node.name, verifiedChoiceTopics)
  const choices = choiceTemplates(node, profile).map((quiz, index) => ({
    id: `${node.id}-Q00${index + 1}`,
    type: 'choice',
    ...quiz,
    source: index === 0 && verifiedChoice ? verifiedChoice : originalSource(),
  }))

  const verifiedAnalysis = findSource(node.name, verifiedAnalysisTopics)
  const hasSpecificLegacy = legacyAnalysis && !legacyAnalysis.question.includes('某系统需要使用')
  const firstAnalysis = hasSpecificLegacy
    ? {
        ...legacyAnalysis,
        id: `${node.id}-Q006`,
        explanation: `${legacyAnalysis.explanation}\n\n复盘时还应把每个小问对应到“建模、过程、结果、验证”四类得分点，并检查单位、边界和中间状态是否齐全；若只写最终答案，即使数值正确也无法证明推导过程完整。`,
        source: verifiedAnalysis ?? originalSource(),
      }
    : {
        id: `${node.id}-Q006`,
        ...genericAnalysis(node, profile, 1),
        ...(verifiedAnalysis ? { source: verifiedAnalysis } : {}),
      }
  const secondAnalysis = {
    id: `${node.id}-Q007`,
    ...genericAnalysis(node, profile, 2),
  }

  return [...choices, firstAnalysis, secondAnalysis]
}

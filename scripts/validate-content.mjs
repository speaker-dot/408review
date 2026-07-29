import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const contentRoot = path.join(projectRoot, 'src', 'content')
const folders = { DS: 'ds', CS: 'cs', OS: 'os', NET: 'net' }
const requiredHeadings = [
  '### 先抓重点',
  '### 核心定义',
  '### 为什么需要它',
  '### 数据结构与状态',
  '### 解题步骤',
  '### 关键公式',
  '### 具体例子',
  '### 必须记住的结论',
  '### 408考情',
]
const errors = []
const records = new Map()
const questionOwners = new Map()
const counts = {}
const mathStats = {
  strings: 0,
  fieldsWithMath: 0,
}

// 这些命令只有放在 $...$ 或 $$...$$ 中才会被 KaTeX 识别。
// 校验器会忽略 Markdown 代码块，避免把示例代码中的反斜杠误判成公式。
const rawLatexCommand =
  /\\(?:frac|dfrac|tfrac|sqrt|sum|prod|Theta|Omega|Delta|alpha|beta|gamma|lambda|mu|sigma|times|cdot|leq?|geq?|neq?|approx|infty|rightarrow|leftarrow|leftrightarrow|land|lor|bmod|pmod|text|mathrm|mathbf|begin|end|langle|rangle|overline|underline|hat|vec)\b/

function assert(condition, message) {
  if (!condition) errors.push(message)
}

function stripMarkdownCode(value) {
  return value.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
}

/**
 * 检查一个字符串中的数学标记是否能被 MarkdownContent 的渲染规则识别。
 * 同时支持行内 $...$ 与块级 $$...$$，并拒绝遗漏分隔符的 LaTeX 命令。
 */
function validateMathString(value, label) {
  mathStats.strings += 1

  const text = stripMarkdownCode(value)
  let outsideMath = ''
  let cursor = 0
  let containsMath = false

  while (cursor < text.length) {
    if (text[cursor] !== '$' || text[cursor - 1] === '\\') {
      outsideMath += text[cursor]
      cursor += 1
      continue
    }

    containsMath = true
    const isBlock = text[cursor + 1] === '$'
    const delimiter = isBlock ? '$$' : '$'
    const openingIndex = cursor
    cursor += delimiter.length

    let closingIndex = -1
    while (cursor < text.length) {
      // MarkdownContent 的行内公式不跨行；块级公式允许换行。
      if (!isBlock && text[cursor] === '\n') break
      if (text.startsWith(delimiter, cursor) && text[cursor - 1] !== '\\') {
        closingIndex = cursor
        break
      }
      cursor += 1
    }

    if (closingIndex < 0) {
      assert(false, `${label}: 数学公式分隔符 ${delimiter} 未闭合（位置 ${openingIndex}）`)
      return
    }

    cursor = closingIndex + delimiter.length
  }

  if (containsMath) mathStats.fieldsWithMath += 1

  const rawCommand = outsideMath.match(rawLatexCommand)
  assert(
    !rawCommand,
    `${label}: LaTeX 命令 ${rawCommand?.[0]} 未放入 $...$ 或 $$...$$`,
  )
}

function validateMathFields(value, label) {
  if (typeof value === 'string') {
    validateMathString(value, label)
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateMathFields(item, `${label}[${index}]`))
    return
  }

  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      validateMathFields(item, `${label}.${key}`)
    }
  }
}

for (const [category, folder] of Object.entries(folders)) {
  const directory = path.join(contentRoot, folder)
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json'))
  counts[category] = files.length

  for (const file of files) {
    const filePath = path.join(directory, file)
    let node
    try {
      node = JSON.parse(await readFile(filePath, 'utf8'))
    } catch (error) {
      errors.push(`${file}: JSON 无法解析：${error.message}`)
      continue
    }

    const label = `${category}/${file}`
    validateMathFields(node, label)
    const expectedKeys = [
      'id',
      'name',
      'category',
      'parentId',
      'difficulty',
      'summary',
      'details',
      'traps',
      'quizzes',
    ]
    assert(
      JSON.stringify(Object.keys(node)) === JSON.stringify(expectedKeys),
      `${label}: 顶层字段或字段顺序不符合 Schema`,
    )
    assert(file === `${node.id}.json`, `${label}: 文件名与 id 不一致`)
    assert(node.category === category, `${label}: category 不正确`)
    assert(
      /^((DS|CS|OS|NET)-\d{2})(-\d{2})?(-\d{3})?$/.test(node.id),
      `${label}: id 格式不正确`,
    )
    assert(typeof node.name === 'string' && node.name.length > 0, `${label}: name 为空`)
    assert(
      Number.isInteger(node.difficulty) && node.difficulty >= 1 && node.difficulty <= 5,
      `${label}: difficulty 超出 1-5`,
    )
    assert(
      typeof node.summary === 'string' && node.summary.length <= 50,
      `${label}: summary 超过 50 字或类型错误`,
    )
    for (const heading of requiredHeadings) {
      assert(node.details.includes(heading), `${label}: details 缺少 ${heading}`)
    }
    assert(node.details.length >= 1200, `${label}: details 少于 1200 字符，讲解过短`)
    assert(node.details.includes('$'), `${label}: details 缺少 LaTeX 数学表达式`)
    assert(node.details.includes('|---|'), `${label}: details 缺少过程/公式表格`)
    assert(!node.details.includes('课程中的一个考查单元'), `${label}: details 仍含旧版泛化定义`)
    if (node.parentId !== category) {
      assert(
        node.details.includes(`(参见 ID: ${node.parentId})`),
        `${label}: 未引用直接父节点`,
      )
    }
    assert(
      Array.isArray(node.traps) &&
        node.traps.length >= 4 &&
        node.traps.every(
          (item) =>
            typeof item?.title === 'string' &&
            item.title.length > 0 &&
            item.mistake?.length >= 8 &&
            item.why?.length >= 30 &&
            item.correction?.length >= 30 &&
            item.example?.length >= 30 &&
            typeof item.source?.label === 'string',
        ),
      `${label}: traps 不合格`,
    )
    assert(
      Array.isArray(node.quizzes) && node.quizzes.length >= 1 && node.quizzes.length <= 5,
      `${label}: quizzes 应按考法精选 1-5 题`,
    )

    const quizzes = node.quizzes ?? []
    quizzes.forEach((quiz, index) => {
      assert(quiz?.id === `${node.id}-Q${String(index + 1).padStart(3, '0')}`, `${label}: 第 ${index + 1} 题 id 不正确`)
      assert(typeof quiz?.source?.label === 'string', `${label}: 第 ${index + 1} 题缺少来源`)
      assert(
        !questionOwners.has(quiz?.question),
        `${label}: 题干与 ${questionOwners.get(quiz?.question)} 完全重复`,
      )
      questionOwners.set(quiz?.question, `${label}/${quiz?.id}`)
      if (quiz?.source?.adapted) {
        assert(Boolean(quiz.source.year && quiz.source.questionNo && quiz.source.url), `${label}: 第 ${index + 1} 题真题来源不可追溯`)
      }
    })

    const choices = quizzes.filter((quiz) => quiz.type === 'choice')
    const analyses = quizzes.filter((quiz) => quiz.type === 'analysis')
    assert(choices.length >= 1 && choices.length <= 4, `${label}: 选择题应为 1-4 道精选题`)
    assert(analyses.length <= 1, `${label}: 同一节点不应强塞多道综合题`)
    for (const choice of choices) {
      assert(Array.isArray(choice.options) && choice.options.length === 4, `${label}/${choice.id}: 选项不是 4 个`)
      assert(/^[ABCD]$/.test(choice.answer), `${label}/${choice.id}: 答案不是 A-D`)
      assert(choice.explanation?.length >= 80, `${label}/${choice.id}: 解析过短`)
    }
    for (const analysis of analyses) {
      assert(analysis.question?.length >= 60, `${label}/${analysis.id}: 综合题题干过短`)
      assert(analysis.answer?.length >= 120, `${label}/${analysis.id}: 综合题答案过短`)
      assert(analysis.explanation?.length >= 80, `${label}/${analysis.id}: 综合题解析过短`)
      assert(!analysis.question.includes('某系统需要使用'), `${label}/${analysis.id}: 仍含泛化表格题`)
      assert(!analysis.question.includes('完成一次 408 风格过程分析'), `${label}/${analysis.id}: 仍含模板综合题`)
    }

    assert(!records.has(node.id), `${label}: id 重复`)
    records.set(node.id, node)
  }
}

const index = JSON.parse(await readFile(path.join(contentRoot, 'index.json'), 'utf8'))
const indexById = new Map(index.nodes.map((node) => [node.id, node]))
const expectedRoots = new Set(Object.keys(folders))

assert(index.nodes.length === records.size + expectedRoots.size, 'index.json 节点数量不正确')
assert(index.links.length === records.size, 'index.json 边数量不正确')

for (const [id, record] of records) {
  const indexNode = indexById.get(id)
  assert(Boolean(indexNode), `${id}: 未进入 index.json`)
  assert(indexNode?.name === record.name, `${id}: 索引名称与内容文件不一致`)
  assert(indexNode?.parentId === record.parentId, `${id}: 索引 parentId 不一致`)
  assert(indexById.has(record.parentId), `${id}: 父节点不在索引中`)
  assert(
    index.links.some((link) => link.source === record.parentId && link.target === id),
    `${id}: 索引缺少父子边`,
  )
}

for (const root of expectedRoots) {
  assert(indexById.has(root), `index.json 缺少科目根节点 ${root}`)
}

if (errors.length) {
  console.error(`内容校验失败，共 ${errors.length} 项：`)
  for (const error of errors.slice(0, 100)) console.error(`- ${error}`)
  if (errors.length > 100) console.error(`- 其余 ${errors.length - 100} 项已省略`)
  process.exitCode = 1
} else {
  console.log(
    `CONTENT_OK total=${records.size} DS=${counts.DS} CS=${counts.CS} OS=${counts.OS} NET=${counts.NET} ` +
      `mathFields=${mathStats.fieldsWithMath}/${mathStats.strings}`,
  )
}

import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import katex from 'katex'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const contentRoot = path.join(projectRoot, 'src', 'content')
const folders = { DS: 'ds', CS: 'cs', OS: 'os', NET: 'net' }
const requiredHeadings = [
  '### 复习时抓住这几条',
]
const errors = []
const records = new Map()
const questionOwners = new Map()
const counts = {}
const catalog = JSON.parse(await readFile(path.join(contentRoot,'index.json'),'utf8'))
const chapterIds = new Set(catalog.nodes.map(n=>n.parentId))
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

  // \frac、\bmod 等在生成脚本中若未正确保留反斜杠，会变成
  // 换页符/退格符；即使肉眼难以察觉，也必须阻止其进入内容库。
  assert(!/[\x00-\x09\x0B-\x1F]/.test(value), `${label}: 字符串含异常控制字符，请检查反斜杠转义`)

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

    try {
      katex.renderToString(text.slice(openingIndex + delimiter.length, closingIndex), {
        displayMode: isBlock, throwOnError: true, strict: 'ignore',
      })
    } catch (error) {
      assert(false, `${label}: KaTeX 无法渲染：${error.message}`)
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
      'study',
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
    assert(node.details.length >= 350, `${label}: details 少于 350 字符`)
    // 概念页不强塞公式和表格；检查具体教学证据，避免用重复段落凑字数。
    for (const phrase of ['本步读了什么、改了什么', '围绕“', '不要把定义读成一整块', '先核对输入范围、表示方法、下标约定']) {
      assert(!node.details.includes(phrase), `${label}: details 仍含旧版模板段落：${phrase}`)
    }
    assert(node.study?.keyPoints?.length >= 1, `${label}: 缺少具体记忆结论`)
    assert(node.study?.recall?.length >= 1 && node.study.recall.every(item => item.question?.length >= 5 && item.answer?.length >= 5), `${label}: 回忆自测不完整`)
    assert(node.study?.sources?.length >= 1, `${label}: 缺少教材/公开资料来源`)
    for (const source of node.study?.sources ?? []) {
      assert(typeof source.title === 'string' && source.title.length > 0 && typeof source.note === 'string', `${label}: 教材来源字段不完整`)
      try {
        assert(new URL(source.url).protocol === 'https:', `${label}: 来源链接不是 HTTPS`)
      } catch { assert(false, `${label}: 教材来源链接无效`) }
    }
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
      Array.isArray(node.quizzes) && node.quizzes.length >= (chapterIds.has(node.id)?0:1) && node.quizzes.length <= 5,
      `${label}: 叶节点需针对性习题，章节页可不强塞习题`,
    )

    const quizzes = node.quizzes ?? []
    quizzes.forEach((quiz, index) => {
      assert(quiz?.id === `${node.id}-Q${String(index + 1).padStart(3, '0')}`, `${label}: 第 ${index + 1} 题 id 不正确`)
      assert(typeof quiz?.source?.label === 'string', `${label}: 第 ${index + 1} 题缺少来源`)
      assert(!/某同学在处理|最终数值相同，中间状态/.test(JSON.stringify(quiz)),`${label}: 仍含万能习题模板`)
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
    assert(choices.length >= (chapterIds.has(node.id)?0:1) && choices.length <= 4, `${label}: 叶节点选择题应为 1-4 道精选题`)
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
  const children = [...records.values()].filter(item => item.parentId === id)
  if (!children.length) {
    assert(record.details.includes('### 跟着例题走一遍') && record.details.includes('**推导与答案**'), `${id}: 叶子知识点缺少完整例题`)
  }
  const references = JSON.stringify([record.details, record.study]).matchAll(/参见 ID:\s*((?:DS|CS|OS|NET)(?:-\d{2}){1,2}(?:-\d{3})?)/g)
  for (const reference of references) {
    assert(records.has(reference[1]), `${id}: 引用了不存在的节点 ${reference[1]}`)
  }
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

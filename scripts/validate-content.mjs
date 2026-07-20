import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const contentRoot = path.join(projectRoot, 'src', 'content')
const folders = { DS: 'ds', CS: 'cs', OS: 'os', NET: 'net' }
const requiredHeadings = [
  '### 核心定义',
  '### 数据结构',
  '### 算法步骤',
  '### 408考情',
]
const errors = []
const records = new Map()
const counts = {}

function assert(condition, message) {
  if (!condition) errors.push(message)
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
    assert(node.details.includes('$'), `${label}: details 缺少 LaTeX 数学表达式`)
    if (node.parentId !== category) {
      assert(
        node.details.includes(`(参见 ID: ${node.parentId})`),
        `${label}: 未引用直接父节点`,
      )
    }
    assert(
      Array.isArray(node.traps) &&
        node.traps.length >= 2 &&
        node.traps.every((item) => typeof item === 'string' && item.length > 0),
      `${label}: traps 不合格`,
    )
    assert(Array.isArray(node.quizzes) && node.quizzes.length === 2, `${label}: quizzes 数量不是 2`)

    const [choice, analysis] = node.quizzes ?? []
    assert(choice?.id === `${node.id}-Q001`, `${label}: 选择题 id 不正确`)
    assert(choice?.type === 'choice', `${label}: 第一题不是 choice`)
    assert(Array.isArray(choice?.options) && choice.options.length === 4, `${label}: 选择题选项不是 4 个`)
    assert(typeof choice?.answer === 'string' && choice.answer.length > 0, `${label}: 选择题答案为空`)
    assert(choice?.explanation?.length >= 120, `${label}: 选择题解析过短`)

    assert(analysis?.id === `${node.id}-Q002`, `${label}: 分析题 id 不正确`)
    assert(analysis?.type === 'analysis', `${label}: 第二题不是 analysis`)
    assert(analysis?.question?.includes('|---|'), `${label}: 分析题题干缺少标准表格`)
    assert(analysis?.answer?.includes('|---|'), `${label}: 分析题答案缺少推导表格`)
    assert(analysis?.explanation?.length >= 120, `${label}: 分析题解析过短`)

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
    `CONTENT_OK total=${records.size} DS=${counts.DS} CS=${counts.CS} OS=${counts.OS} NET=${counts.NET}`,
  )
}

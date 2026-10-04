import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { buildEditorialContent, editorialGuides } from './editorial/index.mjs'

const root = fileURLToPath(new URL('../src/content/', import.meta.url))
const records = []
for (const folder of ['ds', 'cs', 'os', 'net']) {
  for (const file of (await readdir(path.join(root, folder))).filter(f => f.endsWith('.json')).sort()) {
    const target = path.join(root, folder, file)
    records.push({ target, node: JSON.parse(await readFile(target, 'utf8')) })
  }
}
const preservedHash = rows => createHash('sha256').update(JSON.stringify(rows.map(({ node }) =>
  [node.id, node.traps, node.quizzes]))).digest('hex')
const before = preservedHash(records)
const allIds = new Set(records.map(({ node }) => node.id))
for (const id of Object.keys(editorialGuides)) {
  if (!allIds.has(id)) throw new Error(`讲解指向不存在的节点：${id}`)
}
// 先完整检查覆盖率和教学字段，再写文件，防止缺少一科时留下半套更新。
for (const { node } of records) {
  const guide = editorialGuides[node.id]
  if (!guide?.lead || !guide.sections?.length || !guide.takeaways?.length ||
      !guide.recall?.length || !guide.sources?.length) throw new Error(`讲解字段不完整：${node.id}`)
  const children = records.filter(row => row.node.parentId === node.id).map(row => row.node)
  if (!children.length && (!guide.example?.question || !guide.example?.solution)) {
    throw new Error(`叶子知识点缺少具体例题：${node.id}`)
  }
  Object.assign(node, buildEditorialContent(node, children))
}
if (preservedHash(records) !== before) throw new Error('讲解更新意外改动了易错清单或题库')
for (const { target, node } of records) await writeFile(target, `${JSON.stringify(node, null, 2)}\n`, 'utf8')
console.log(`EDITORIAL_OK nodes=${records.length} preservedTrapsAndQuizzes=${before}`)

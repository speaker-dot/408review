import ds from './ds.mjs'
import cs from './cs.mjs'
import os from './os.mjs'
import net from './net.mjs'

/** 人工编写的教学内容单独维护；旧题库生成器不能再覆盖这些讲解。 */
export const editorialGuides = { ...ds, ...cs, ...os, ...net }

export function buildEditorialContent(node, children = []) {
  const guide = editorialGuides[node.id]
  if (!guide) throw new Error(`缺少独立讲解：${node.id}`)
  const parts = [`> **${guide.lead}**`, '']
  if (node.parentId !== node.category) {
    parts.push(`所属章节：(参见 ID: ${node.parentId})。`, '')
  }
  for (const section of guide.sections ?? []) {
    parts.push(`### ${section.title}`, '', section.text, '')
  }
  if (guide.example) {
    parts.push('### 跟着例题走一遍', '', '**例题（本站编写）**', '', guide.example.question,
      '', '**推导与答案**', '', guide.example.solution, '')
  }
  if (children.length) {
    parts.push('### 接着读哪些知识点', '')
    for (const child of children) {
      const childGuide = editorialGuides[child.id]
      if (!childGuide) throw new Error(`缺少子节点讲解：${child.id}`)
      parts.push(`- **${child.name}** (参见 ID: ${child.id})：${childGuide.lead}`)
    }
    parts.push('')
  }
  parts.push('### 复习时抓住这几条', '', ...guide.takeaways.map(item => `- ${item}`))
  return {
    // 概述取该节点自己的主结论，不再继承章节的泛化定义。
    summary: (() => {
      const plain = guide.lead.replace(/\*\*/g, '').replace(/\$([^$]+)\$/g, '$1')
      return plain.length > 50 ? `${plain.slice(0, 49)}…` : plain
    })(),
    details: parts.join('\n'),
    study: {
      keyPoints: guide.takeaways,
      recall: guide.recall,
      sources: guide.sources,
    },
  }
}

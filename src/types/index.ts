/** 408 的四门科目代码。 */
export type KnowledgeCategory = 'DS' | 'OS' | 'CS' | 'NET'

/** 题目类型：选择、填空、分析。 */
export type QuizType = 'choice' | 'fill' | 'analysis'

/**
 * 习题接口。
 * question、answer 与 explanation 均允许存放 Markdown/LaTeX 字符串，
 * 具体的安全渲染由展示组件负责。
 */
export interface Quiz {
  id: string
  type: QuizType
  question: string
  options?: string[]
  answer: string
  explanation: string
}

/** 单个知识点详情，是 Dexie 中 nodes 表的记录类型。 */
export interface KnowledgeNode {
  /** 全局唯一 ID，例如 DS0101。 */
  id: string
  name: string
  category: KnowledgeCategory
  parentId?: string
  difficulty: 1 | 2 | 3 | 4 | 5
  summary: string
  /** 详细讲解，允许使用 Markdown 与 LaTeX。 */
  details: string
  traps: string[]
  quizzes: Quiz[]
}

/** 首页导图索引中的轻量节点，不包含大段知识内容。 */
export interface MindMapNode {
  id: string
  name: string
  parentId?: string
  symbolSize?: number
}

/** ECharts graph 系列使用的边。 */
export interface MindMapLink {
  source: string
  target: string
}

/** src/content/index.json 的完整结构。 */
export interface MindMapIndex {
  nodes: MindMapNode[]
  links: MindMapLink[]
}

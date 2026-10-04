/** 408 的四门科目代码。 */
export type KnowledgeCategory = 'DS' | 'OS' | 'CS' | 'NET'

/** 题目类型：选择、填空、分析。 */
export type QuizType = 'choice' | 'fill' | 'analysis'

/** 题目来源。真题只保存来源信息，题干在本站中均为改编或重新表述。 */
export interface QuizSource {
  label: string
  year?: number
  questionNo?: string
  url?: string
  adapted: boolean
}

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
  source: QuizSource
}

/** 结构化易错项：不仅指出错法，还解释原因、纠正步骤与对应例题。 */
export interface ExamTrap {
  title: string
  mistake: string
  why: string
  correction: string
  example: string
  source?: QuizSource
}

/** 教材对照区的来源；短摘录和本站解释分开保存，避免混淆原文与改写。 */
export interface StudySource {
  title: string
  url: string
  note: string
  quote?: string
  translation?: string
  locator?: string
}

export interface StudyGuide {
  keyPoints: string[]
  recall: { question: string; answer: string }[]
  sources: StudySource[]
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
  traps: ExamTrap[]
  quizzes: Quiz[]
  /** 可选以兼容离线数据库中尚未更新的旧知识点。 */
  study?: StudyGuide
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

/** 真题 PDF 文件元数据。文件本体按需缓存，不进入 Dexie。 */
export interface PaperAsset {
  label: string
  url: string
  pages: number
  bytes: number
  sha256: string
}

/** 真题来源信息，用于区分原卷、回忆版和第三方参考答案。 */
export interface PaperSource {
  publisher: string
  pageUrl: string
  paperLabel: string
  solutionLabel: string
  verifiedAt: string
  note: string
}

/** 题号与知识图谱节点之间的轻量关联。 */
export interface PaperQuestionLink {
  questionNo: number
  type: 'choice' | 'analysis'
  subject: KnowledgeCategory
  paperPage: number
  difficulty: 1 | 2 | 3 | 4 | 5
  nodeIds: string[]
}

/** 单个年份的真题资料。 */
export interface ExamPaper {
  year: number
  title: string
  examDate: string
  totalScore: number
  durationMinutes: number
  status: 'verified' | 'reviewing' | 'recalled'
  featured?: boolean
  paper: PaperAsset
  solution: PaperAsset
  source: PaperSource
  questionLinks: PaperQuestionLink[]
}

export interface ExamPaperIndex {
  papers: ExamPaper[]
}

/** Dexie 中保存的本地阅读进度。 */
export interface PaperProgress {
  year: number
  paperPage: number
  solutionPage: number
  completed: boolean
  updatedAt: number
}

/** 阅读进度与掌握程度分开：打开一页不等于掌握。 */
export type StudyStatus = 'learning' | 'review' | 'mastered'
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy'
export type ErrorKind = 'concept' | 'condition' | 'calculation' | 'procedure' | 'other'
export interface StudyProgress {
  nodeId: string
  status: StudyStatus
  visits: number
  bookmarked: boolean
  note: string
  lastStudiedAt: number
  lastReviewedAt: number
  nextReviewAt: number
  intervalDays: number
  streak: number
  /** 用户主动标记的掌握与间隔复习获得的证据不混淆。 */
  manualMastery: boolean
  updatedAt: number
}
export interface StudyAttempt {
  id: string
  nodeId: string
  quizId: string
  type: QuizType | 'recall'
  quiz?: Quiz
  selectedAnswer: string
  correct: boolean
  selfAssessed: boolean
  errorKind?: ErrorKind
  note: string
  createdAt: number
  updatedAt: number
}
export interface StudySettings {
  id: 'preferences'
  dailyReviewLimit: number
  dailyNewLimit: number
  updatedAt: number
}
export interface CorrectionFeedback {
  id: string
  nodeId: string
  section: string
  message: string
  createdAt: number
  updatedAt: number
}
export interface ExamSession {
  id: string
  year: number
  status: 'running' | 'submitted'
  startedAt: number
  deadlineAt: number
  submittedAt?: number
  answers: Record<string, string>
  analysisScores: Record<string, number>
  /** 无完整已核对答案表时，由用户交卷后参考 PDF 录入。 */
  referenceAnswers?: Record<string, string>
  updatedAt: number
}
export interface ExamAnswerKey {
  year: number
  choices: string[]
  analysis: { questionNo: number; maxScore: number }[]
  solutionSha256: string
  note: string
  choiceSections?: { category: KnowledgeCategory; from: number; to: number }[]
}

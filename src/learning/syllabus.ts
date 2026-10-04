import rawSyllabus from '@/content/syllabus.json'
import index from '@/content/index.json'
import type { KnowledgeCategory, StudyProgress } from '@/types'

export interface SyllabusItem {
  id: string
  title: string
  /** 本站独立编写的可检查学习任务，不是官方大纲原文。 */
  targets: string[]
  nodeIds: string[]
  missingTopics: string[]
  demoNodeIds: string[]
}
export interface SyllabusChapter {
  id: string
  title: string
  locator: string
  sourceIds: string[]
  items: SyllabusItem[]
}
export interface SyllabusSubject {
  id: KnowledgeCategory
  name: string
  aim: string
  chapters: SyllabusChapter[]
}
export interface SyllabusSource {
  id: string
  title: string
  publisher: string
  kind: 'official-catalog' | 'university-outline' | 'publisher-reference' | 'official-history'
  year: number
  publishedAt: string | null
  publicationNote?: string
  url: string
  documentUrl?: string
  verifiedAt: string
  note: string
}
export interface SyllabusData {
  title: string
  metadata: {
    verifiedAt: string
    scopeYear: number
    scopeStatus: string
    catalogYear: number
    catalogVerified: boolean
    catalogContentVerified: boolean
    versionNote: string
    editorialNote: string
    rightsNote: string
    offlineNote: string
    coverageNote: string
  }
  sources: SyllabusSource[]
  exam: {
    code: string
    totalScore: number
    durationMinutes: number
    choiceQuestions: number
    choiceScore: number
    analysisScore: number
    method: string
    subjectMarks: Record<KnowledgeCategory, number>
    sourceIds: string[]
    note: string
  }
  subjects: SyllabusSubject[]
  extensions: {
    id: string
    title: string
    nodeIds: string[]
    note: string
    sourceIds: string[]
  }[]
}
export const syllabus = rawSyllabus as SyllabusData
export const syllabusNodeNames = new Map(index.nodes.map(node => [node.id, node.name]))
export type SyllabusProgressState = 'pending' | 'learning' | 'review' | 'mastered' | 'unmapped' | 'needs-supplement'

/** 一个导航项只在全部关联节点已掌握且无明确缺口时显示完成。
 * 阅读次数、收藏或笔记不自动等同于掌握；缺失节点也不能由前置节点“代完成”。
 * 本函数只读取现有学习记录，不生成第二套进度存储。
 */
export function itemProgress(item: SyllabusItem, progress: ReadonlyMap<string, StudyProgress>) {
  const ids = [...new Set(item.nodeIds)]
  const mastered = ids.filter(id => progress.get(id)?.status === 'mastered').length
  const read = ids.filter(id => (progress.get(id)?.visits ?? 0) > 0).length
  let state: SyllabusProgressState = 'pending'
  if (!ids.length) state = 'unmapped'
  else if (mastered === ids.length) state = item.missingTopics.length ? 'needs-supplement' : 'mastered'
  else if (ids.some(id => progress.get(id)?.status === 'review')) state = 'review'
  else if (read > 0 || mastered > 0) state = 'learning'
  return { state, total: ids.length, mastered, read, complete: state === 'mastered' }
}

export interface SyllabusFilter {
  subject: KnowledgeCategory | 'all'
  search: string
  pendingOnly: boolean
}

/** 搜索包含节点名称/ID、学习任务与缺口；按空白分词后全部匹配，空搜索不过滤。 */
export function filterSyllabus(
  subjects: readonly SyllabusSubject[],
  filter: SyllabusFilter,
  progress: ReadonlyMap<string, StudyProgress>,
): SyllabusSubject[] {
  const terms = filter.search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return subjects
    .filter(subject => filter.subject === 'all' || subject.id === filter.subject)
    .map(subject => ({
      ...subject,
      chapters: subject.chapters.map(chapter => ({
        ...chapter,
        items: chapter.items.filter(item => {
          if (filter.pendingOnly && itemProgress(item, progress).complete) return false
          const searchable = [subject.name, subject.id, chapter.title, item.title, ...item.targets, ...item.missingTopics,
            ...item.nodeIds, ...item.nodeIds.map(id => syllabusNodeNames.get(id) ?? '')].join(' ').toLocaleLowerCase()
          return terms.every(term => searchable.includes(term))
        }),
      })).filter(chapter => chapter.items.length > 0),
    }))
    .filter(subject => subject.chapters.length > 0)
}

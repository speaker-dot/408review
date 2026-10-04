import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Cs408Database } from '@/db/db'
import { exportBackup, importBackup, parseBackup, type StudyBackup } from '@/services/backup'
import { initialProgress } from '@/learning/scheduler'
import papers from '@/content/papers/index.json'
import answerKeys from '@/content/papers/answer-keys.json'
import type { KnowledgeNode } from '@/types'

const NODE = 'CS-03-03-001'
const NOW = 1_800_000_000_000
const PAPER = papers.papers[0]
const TABLES = ['studyProgress', 'attempts', 'paperProgress', 'settings', 'feedback', 'examSessions'] as const

function fixture(updatedAt = NOW + 3_600_000): StudyBackup {
  return {
    format: 'cs408-study-backup', version: 1, exportedAt: updatedAt,
    studyProgress: [{ ...initialProgress(NODE, NOW), visits: 2, note: '先划分地址字段再计算映射', updatedAt }],
    attempts: [{
      id: 'attempt-1', nodeId: NODE, quizId: `${NODE}-Q001`, type: 'choice',
      quiz: {
        id: `${NODE}-Q001`, type: 'choice', question: '哪一字段在块内选择字节？',
        options: ['A. 标记', 'B. 块内偏移', 'C. 组索引', 'D. 进程号'], answer: 'B',
        explanation: '块内偏移选择该块中的字节，组索引选择候选组，标记辨认主存块。',
        source: { label: '本站原创·408专项练习', adapted: false },
      },
      selectedAnswer: 'A', correct: false, selfAssessed: false, errorKind: 'concept',
      note: '把命中比较与块内选址混淆', createdAt: NOW, updatedAt,
    }],
    paperProgress: [{ year: PAPER.year, paperPage: 1, solutionPage: 1, completed: false, updatedAt }],
    settings: [{ id: 'preferences', dailyReviewLimit: 10, dailyNewLimit: 3, updatedAt }],
    feedback: [{ id: 'feedback-1', nodeId: NODE, section: '核心定义', message: '建议说明字节编址假设', createdAt: NOW, updatedAt }],
    examSessions: [{
      id: 'session-1', year: PAPER.year, status: 'submitted', startedAt: NOW,
      deadlineAt: NOW + 3 * 3_600_000, submittedAt: NOW + 3_600_000,
      answers: { '1': 'B', '40': 'D' }, analysisScores: {}, updatedAt,
    }],
  }
}

// Fixtures are intentionally mutated through unknown-shaped input: the parser
// is the runtime boundary and must defend against files that bypass TS types.
function invalid(edit: (backup: any) => void): () => StudyBackup {
  const backup = JSON.parse(JSON.stringify(fixture()))
  edit(backup)
  return () => parseBackup(JSON.stringify(backup))
}

describe('study backup validation', () => {
  it('round-trips all six supported record types without changing values', () => {
    const original = fixture()
    expect(parseBackup(JSON.stringify(original))).toEqual(original)
  })

  it('rejects non-recall history without a question snapshot', () => {
    const backup = fixture()
    delete backup.attempts[0].quiz
    expect(() => parseBackup(JSON.stringify(backup))).toThrow('不合法')
  })

  it('accepts recall records and running exam sessions without submission timestamps', () => {
    const backup = fixture()
    delete backup.attempts[0].quiz
    Object.assign(backup.attempts[0], { type: 'recall', quizId: `${NODE}-recall-0`, selfAssessed: true, selectedAnswer: '' })
    backup.examSessions[0].status = 'running'
    delete backup.examSessions[0].submittedAt
    backup.examSessions[0].analysisScores = {}
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup)
  })

  it('rejects broken JSON with a useful, non-mutating error', () => {
    expect(() => parseBackup('{')).toThrow('有效 JSON')
  })

  it.each([
    ['format', (b: any) => { b.format = 'other-app' }],
    ['version', (b: any) => { b.version = 2 }],
    ['missing table', (b: any) => { delete b.attempts }],
    ['array instead of root', (b: any) => { b.studyProgress = {} }],
    ['negative timestamp', (b: any) => { b.exportedAt = -1 }],
    ['unsafe timestamp', (b: any) => { b.exportedAt = Number.MAX_SAFE_INTEGER + 1 }],
    ['null timestamp', (b: any) => { b.studyProgress[0].updatedAt = null }],
    ['unknown node', (b: any) => { b.studyProgress[0].nodeId = 'CS-99-99-999' }],
    ['subject instead of a knowledge node', (b: any) => { b.studyProgress[0].nodeId = 'CS' }],
    ['unknown status', (b: any) => { b.studyProgress[0].status = 'complete' }],
    ['fractional visits', (b: any) => { b.studyProgress[0].visits = 1.5 }],
    ['invalid boolean', (b: any) => { b.studyProgress[0].bookmarked = 'true' }],
    ['interval above maximum', (b: any) => { b.studyProgress[0].intervalDays = 91 }],
    ['overlong note', (b: any) => { b.studyProgress[0].note = 'a'.repeat(5001) }],
    ['duplicate progress', (b: any) => { b.studyProgress.push(b.studyProgress[0]) }],
    ['excess progress rows', (b: any) => { b.studyProgress = Array(401).fill(b.studyProgress[0]) }],
    ['duplicate attempts', (b: any) => { b.attempts.push(b.attempts[0]) }],
    ['unsafe record id', (b: any) => { b.attempts[0].id = '../elsewhere' }],
    ['foreign quiz id', (b: any) => { b.attempts[0].quizId = 'DS-01-01-001-Q001' }],
    ['invalid error kind', (b: any) => { b.attempts[0].errorKind = 'syntax' }],
    ['attempt updated before creation', (b: any) => { b.attempts[0].updatedAt = NOW - 1 }],
    ['incorrect choice answer format', (b: any) => { b.attempts[0].quiz.answer = 'B or D' }],
    ['missing choice option', (b: any) => { b.attempts[0].quiz.options.pop() }],
    ['duplicate choice option', (b: any) => { b.attempts[0].quiz.options[1] = b.attempts[0].quiz.options[0] }],
    ['foreign question snapshot', (b: any) => { b.attempts[0].quiz.id = 'DS-01-01-001-Q001' }],
    ['script source url', (b: any) => { b.attempts[0].quiz.source.url = 'javascript:alert(1)' }],
    ['invalid source adapted flag', (b: any) => { b.attempts[0].quiz.source.adapted = 1 }],
    ['unknown paper year', (b: any) => { b.paperProgress[0].year = 1900 }],
    ['zero paper page', (b: any) => { b.paperProgress[0].paperPage = 0 }],
    ['paper page past last page', (b: any) => { b.paperProgress[0].paperPage = PAPER.paper.pages + 1 }],
    ['solution page past last page', (b: any) => { b.paperProgress[0].solutionPage = PAPER.solution.pages + 1 }],
    ['duplicate paper progress', (b: any) => { b.paperProgress.push(b.paperProgress[0]) }],
    ['unknown settings key', (b: any) => { b.settings[0].id = 'admin' }],
    ['zero daily review limit', (b: any) => { b.settings[0].dailyReviewLimit = 0 }],
    ['excess daily new limit', (b: any) => { b.settings[0].dailyNewLimit = 21 }],
    ['overlong feedback', (b: any) => { b.feedback[0].message = 'a'.repeat(3001) }],
    ['invalid exam choice', (b: any) => { b.examSessions[0].answers['1'] = 'E' }],
    ['exam choice number outside range', (b: any) => { b.examSessions[0].answers['41'] = 'A' }],
    ['invalid analysis number', (b: any) => { b.examSessions[0].analysisScores['40'] = 1 }],
    ['negative analysis score', (b: any) => { b.examSessions[0].analysisScores['41'] = -1 }],
    ['oversized analysis score', (b: any) => { b.examSessions[0].analysisScores['41'] = 21 }],
    ['deadline before start', (b: any) => { b.examSessions[0].deadlineAt = NOW - 1 }],
    ['exam over four hours', (b: any) => { b.examSessions[0].deadlineAt = NOW + 4 * 3_600_000 + 1 }],
    ['submitted exam without submit time', (b: any) => { delete b.examSessions[0].submittedAt }],
    ['running exam with submission time', (b: any) => { b.examSessions[0].status = 'running' }],
    ['exam updated before start', (b: any) => { b.examSessions[0].updatedAt = NOW - 1 }],
  ])('rejects %s', (_label, edit) => {
    expect(invalid(edit)).toThrow('不合法')
  })

  it('rejects oversized input before attempting JSON parsing', () => {
    expect(() => parseBackup(' '.repeat(10_000_001))).toThrow('10 MB')
  })

  it('rejects a same-node snapshot that belongs to another quiz', () => {
    expect(invalid(b => { b.attempts[0].quiz.id = `${NODE}-Q002` })).toThrow('不合法')
  })

  it('rejects disagreement between an attempt and its question type', () => {
    expect(invalid(b => { b.attempts[0].type = 'analysis' })).toThrow('不合法')
  })

  it('rejects submission timestamps before an exam was started', () => {
    expect(invalid(b => { b.examSessions[0].submittedAt = NOW - 1 })).toThrow('不合法')
  })

  it('honors a configured per-question maximum, not a blanket twenty-point limit', () => {
    // This is an isolated metadata dependency fixture, not a claim about the
    // score of any actual exam question. Restore it before another test runs.
    const scores = answerKeys.keys.find(key => key.year === PAPER.year)!.analysis as { questionNo: number; maxScore: number }[]
    const original = [...scores]
    try {
      scores.splice(0, scores.length, { questionNo: 41, maxScore: 8 })
      const backup = fixture()
      backup.examSessions[0].analysisScores = { '41': 8 }
      expect(parseBackup(JSON.stringify(backup)).examSessions[0].analysisScores['41']).toBe(8)
      backup.examSessions[0].analysisScores['41'] = 9
      expect(() => parseBackup(JSON.stringify(backup))).toThrow('不合法')
    } finally { scores.splice(0, scores.length, ...original) }
  })

  it('rejects analysis self-grades without a verified question maximum', () => {
    const scores = answerKeys.keys.find(key => key.year === PAPER.year)!.analysis as { questionNo: number; maxScore: number }[]
    const original = [...scores]
    try {
      scores.splice(0, scores.length)
      const backup = fixture()
      backup.examSessions[0].analysisScores = { '41': 1 }
      expect(() => parseBackup(JSON.stringify(backup))).toThrow('不合法')
    } finally { scores.splice(0, scores.length, ...original) }
  })

  it('rejects reference answer correction on an exam that is still running', () => {
    const backup = fixture()
    backup.examSessions[0].status = 'running'
    delete backup.examSessions[0].submittedAt
    backup.examSessions[0].referenceAnswers = { '1': 'C' }
    expect(() => parseBackup(JSON.stringify(backup))).toThrow('不合法')
  })

  it('allows a delayed submission after the deadline rather than inventing an on-time finish', () => {
    const backup = fixture()
    backup.examSessions[0].submittedAt = NOW + 4 * 3_600_000
    backup.examSessions[0].updatedAt = NOW + 4 * 3_600_000
    expect(parseBackup(JSON.stringify(backup)).examSessions[0].submittedAt).toBe(NOW + 4 * 3_600_000)
  })

  it('rebuilds known fields and discards unsupported tables and prototype payloads', () => {
    const backup: any = fixture()
    backup.unknownTable = [{ id: 'extra' }]
    backup.studyProgress[0].unrecognized = 'extra'
    const text = JSON.stringify(backup).replace('"format":', '"__proto__":{"polluted":true},"format":')
    const parsed = parseBackup(text)
    expect(parsed).toEqual(fixture())
    expect(Object.prototype).not.toHaveProperty('polluted')
    expect(parsed).not.toHaveProperty('unknownTable')
    expect(parsed.studyProgress[0]).not.toHaveProperty('unrecognized')
  })

  it('rejects prototype-like exam answer keys instead of assigning them to an object', () => {
    const text = JSON.stringify(fixture()).replace('"answers":{"1":"B","40":"D"}', '"answers":{"__proto__":"A"}')
    expect(() => parseBackup(text)).toThrow('不合法')
  })
})

describe('atomic backup export and merge', () => {
  let database: Cs408Database

  beforeEach(async () => {
    database = new Cs408Database(`cs408-backup-test-${crypto.randomUUID()}`)
    await database.open()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    database.close()
    await database.delete()
  })

  it('imports and exports six tables without exporting content-cache records or PDF files', async () => {
    const content: KnowledgeNode = {
      id: NODE, name: 'cached content', category: 'CS', parentId: 'CS-03-03',
      difficulty: 3, summary: 'cache', details: 'offline copy', traps: [], quizzes: [],
    }
    await database.nodes.put(content)
    expect(await importBackup(fixture(), database)).toBe(6)
    const exported = await exportBackup(database)
    expect({ ...exported, exportedAt: fixture().exportedAt }).toEqual(fixture())
    expect(exported).not.toHaveProperty('nodes')
    expect(exported).not.toHaveProperty('papers')
    expect(await database.nodes.get(NODE)).toEqual(content)
    expect(parseBackup(JSON.stringify(exported))).toEqual(exported)
  })

  it('does not overwrite equal or newer local records', async () => {
    const current = fixture(NOW + 2 * 3_600_000)
    await importBackup(current, database)
    expect(await importBackup(fixture(NOW), database)).toBe(0)
    expect(await importBackup(current, database)).toBe(0)
    const exported = await exportBackup(database)
    expect({ ...exported, exportedAt: current.exportedAt }).toEqual(current)
  })

  it('merges newer records by each table primary key, rather than replacing the database', async () => {
    await importBackup(fixture(NOW), database)
    const existingExtra = { ...initialProgress('CS-03-03-002', NOW), note: 'do not erase', updatedAt: NOW }
    await database.studyProgress.put(existingExtra)
    const newer = fixture(NOW + 2 * 3_600_000)
    newer.studyProgress[0].note = 'updated note'
    expect(await importBackup(newer, database)).toBe(6)
    expect(await database.studyProgress.get(existingExtra.nodeId)).toEqual(existingExtra)
    expect((await database.studyProgress.get(NODE))?.note).toBe('updated note')
    expect(await database.attempts.count()).toBe(1)
    expect(await database.paperProgress.count()).toBe(1)
  })

  it('revalidates direct callers before any partial write can occur', async () => {
    const bad = fixture()
    bad.settings[0].dailyReviewLimit = 0
    await expect(importBackup(bad, database)).rejects.toThrow('不合法')
    for (const table of TABLES) expect(await database.table(table).count()).toBe(0)
  })

  it('rolls back changes in every table when the final table write fails', async () => {
    const before = fixture(NOW)
    await importBackup(before, database)
    const after = fixture(NOW + 2 * 3_600_000)
    after.studyProgress[0].note = 'must be rolled back'
    // Dexie creates transaction-scoped Table instances. A table-level hook,
    // unlike spying on one instance, intercepts the actual final transaction.
    const failWrite = () => { throw new Error('simulated storage failure') }
    database.examSessions.hook('updating', failWrite)
    try {
      await expect(importBackup(after, database)).rejects.toThrow('storage failure')
    } finally { database.examSessions.hook('updating').unsubscribe(failWrite) }
    const exported = await exportBackup(database)
    expect({ ...exported, exportedAt: before.exportedAt }).toEqual(before)
  })

  it('exports a coherent six-table snapshot while another transaction updates the same records', async () => {
    const before = fixture(NOW), after = fixture(NOW + 2 * 3_600_000)
    await importBackup(before, database)
    const exporting = exportBackup(database)
    const writing = importBackup(after, database)
    const snapshot = await exporting
    await writing
    const timestamps = TABLES.flatMap(table => snapshot[table].map(row => row.updatedAt))
    expect(new Set(timestamps).size).toBe(1)
    expect([NOW, NOW + 2 * 3_600_000]).toContain(timestamps[0])
  })

  it('concurrent imports of one backup stay idempotent', async () => {
    const results = await Promise.all([importBackup(fixture(), database), importBackup(fixture(), database)])
    expect(results.reduce((sum, count) => sum + count, 0)).toBe(6)
    for (const table of TABLES) expect(await database.table(table).count()).toBe(1)
  })
})

import Dexie from 'dexie'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Cs408Database } from '@/db/db'
import { gradeExam, questionSubject, remainingSeconds } from '@/learning/exam'
import { clearExamAnalysisScore, saveExamAnswers, saveExamScoring, startExam, submitExam } from '@/services/examRepository'
import type { ExamAnswerKey, ExamSession } from '@/types'

// 仓库需有核验过的单题满分才接受综合自评分；此处是合成fixture，不写入真实题库。
const { scoringPlan } = vi.hoisted(() => ({ scoringPlan: [12, 8, 13, 10, 10, 9, 8] }))
vi.mock('@/content/papers/answer-keys.json', () => ({
  default: { keys: [{
    year: 2025, choices: [],
    analysis: scoringPlan.map((maxScore, index) => ({ questionNo: 41 + index, maxScore })),
    solutionSha256: 'synthetic-fixture-only', note: '仅测试，不代表2025真题分值。',
  }] },
}))

const NOW = 1_720_000_000_000
const databases: Cs408Database[] = []
function testDatabase(name = '408-exam-test-' + crypto.randomUUID()) {
  const database = new Cs408Database(name)
  databases.push(database)
  return database
}
function session(change: Partial<ExamSession> = {}): ExamSession {
  return {
    id: 'unit-session', year: 2025, status: 'submitted',
    startedAt: NOW, deadlineAt: NOW + 180 * 60_000, submittedAt: NOW + 180 * 60_000,
    answers: {}, analysisScores: {}, updatedAt: NOW,
    ...change,
  }
}
function answerKey(change: Partial<ExamAnswerKey> = {}): ExamAnswerKey {
  return {
    year: 2025,
    choices: Array.from({ length: 40 }, (_, index) => 'ABCD'[index % 4]),
    analysis: scoringPlan.map((maxScore, index) => ({ questionNo: 41 + index, maxScore })),
    solutionSha256: 'unit-test-only',
    note: '仅测试使用，不声明任何年份真题答案。',
    ...change,
  }
}
afterEach(async () => {
  vi.restoreAllMocks()
  for (const database of databases) database.close()
  const names = [...new Set(databases.map(database => database.name))]
  databases.length = 0
  for (const name of names) await Dexie.delete(name)
})

describe('考试时间使用绝对截止时钟', () => {
  it('首次、后台暂停后与恢复时均按deadline重新计算', () => {
    const exam = session()
    expect(remainingSeconds(exam, NOW)).toBe(10_800)
    expect(remainingSeconds(exam, NOW + 90 * 60_000)).toBe(5_400)
    expect(remainingSeconds(exam, exam.deadlineAt - 1)).toBe(1)
    expect(remainingSeconds(exam, exam.deadlineAt)).toBe(0)
    expect(remainingSeconds(exam, exam.deadlineAt + 60_000)).toBe(0)
  })
})

describe('408答题卡分科与评分完整性', () => {
  it('40个选择按11/11/10/8分科，分析题按41..47归属', () => {
    const counts = { DS: 0, CS: 0, OS: 0, NET: 0 }
    for (let no = 1; no <= 40; no++) counts[questionSubject(no)]++
    expect(counts).toEqual({ DS: 11, CS: 11, OS: 10, NET: 8 })
    expect([11, 12, 22, 23, 32, 33, 40].map(questionSubject))
      .toEqual(['DS', 'CS', 'CS', 'OS', 'OS', 'NET', 'NET'])
    expect([41, 42, 43, 44, 45, 46, 47].map(questionSubject))
      .toEqual(['DS', 'DS', 'CS', 'CS', 'OS', 'OS', 'NET'])
  })

  it('空参考答案不能把空作答当正确，更不能显示完整总分', () => {
    const result = gradeExam(session(), answerKey({ choices: [], analysis: [] }))
    expect(result.choiceGraded).toBe(0)
    expect(result.choiceScore).toBe(0)
    expect(result.analysisScore).toBe(0)
    expect(result.total).toBeNull()
    expect(Object.values(result.subjects).every(item => item.graded === 0 && item.score === 0)).toBe(true)
  })

  it('只有实际有合法参考的题进入已批分数量，未作答有参考则为0分', () => {
    const result = gradeExam(
      session({ answers: { 1: 'A', 2: 'B' }, referenceAnswers: { 2: 'B', 3: 'C', 4: '' } }),
      answerKey({ choices: ['A', '', '', ''], analysis: [] }),
    )
    expect(result.choiceGraded).toBe(3)
    expect(result.choiceScore).toBe(4)
    expect(result.subjects.DS).toEqual({ score: 4, graded: 3, max: 22 })
    expect(result.total).toBeNull()
  })

  it('综合题未自评分时选择80分仍不是150分制完整总分', () => {
    const key = answerKey()
    const answers = Object.fromEntries(key.choices.map((answer, index) => [index + 1, answer]))
    const result = gradeExam(session({ answers }), key)
    expect(result.choiceScore).toBe(80)
    expect(result.choiceGraded).toBe(40)
    expect(result.total).toBeNull()
    expect(result.subjects).toEqual({
      DS: { score: 22, graded: 11, max: 22 },
      CS: { score: 22, graded: 11, max: 22 },
      OS: { score: 20, graded: 10, max: 20 },
      NET: { score: 16, graded: 8, max: 16 },
    })
  })

  it('七道分析合法评分后才合并，0分也属于已评分', () => {
    const key = answerKey()
    const answers = Object.fromEntries(key.choices.map((answer, index) => [index + 1, answer]))
    const analysisScores = Object.fromEntries(key.analysis.map(item => [item.questionNo, item.maxScore]))
    const full = gradeExam(session({ answers, analysisScores }), key)
    expect(full.analysisScore).toBe(70)
    expect(full.total).toBe(150)
    const zero = Object.fromEntries(key.analysis.map(item => [item.questionNo, 0]))
    expect(gradeExam(session({ answers, analysisScores: zero }), key).total).toBe(80)
  })

  it.each([-1, 99, Number.NaN, Number.POSITIVE_INFINITY])('非法综合分%s不能造出完整总分', invalid => {
    const key = answerKey()
    const answers = Object.fromEntries(key.choices.map((answer, index) => [index + 1, answer]))
    const analysisScores = Object.fromEntries(key.analysis.map(item => [item.questionNo, item.maxScore]))
    analysisScores[41] = invalid
    expect(gradeExam(session({ answers, analysisScores }), key).total).toBeNull()
  })
})

describe('考试仓库事务与可恢复状态', () => {
  it.each([0, -1, 181, Number.NaN, Number.POSITIVE_INFINITY])('拒绝异常时长%s，不创建坏截止记录', async duration => {
    const database = testDatabase()
    await expect(startExam(2025, duration, database, NOW)).rejects.toThrow('不合法')
    expect(await database.examSessions.count()).toBe(0)
  })

  it.each([2019, 2030, Number.NaN])('拒绝未提供试卷的年份%s', async year => {
    const database = testDatabase()
    await expect(startExam(year, 180, database, NOW)).rejects.toThrow('不合法')
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('拒绝非有限/负的起始时钟%s', async now => {
    const database = testDatabase()
    await expect(startExam(2025, 180, database, now)).rejects.toThrow('不合法')
  })

  it('多个并发启动只创建同一个同年份会话', async () => {
    const database = testDatabase()
    const sessions = await Promise.all(Array.from({ length: 12 }, () => startExam(2025, 180, database, NOW)))
    expect(new Set(sessions.map(exam => exam.id)).size).toBe(1)
    expect(await database.examSessions.count()).toBe(1)
    expect(sessions[0].deadlineAt).toBe(NOW + 180 * 60_000)
    const differentYear = await startExam(2024, 180, database, NOW)
    expect(differentYear.id).not.toBe(sessions[0].id)
  })

  it('两个独立IndexedDB连接也不能在同一年创建两个进行中会话', async () => {
    const first = testDatabase()
    const second = testDatabase(first.name)
    await Promise.all([first.open(), second.open()])
    const [a, b] = await Promise.all([
      startExam(2025, 180, first, NOW),
      startExam(2025, 180, second, NOW),
    ])
    expect(a.id).toBe(b.id)
    expect(await first.examSessions.count()).toBe(1)
  })

  it('并发增量保存不同题不会被旧快照覆盖，重开连接能读回', async () => {
    const database = testDatabase()
    const other = testDatabase(database.name)
    const exam = await startExam(2025, 180, database, NOW)
    await other.open()
    await Promise.all([
      saveExamAnswers(exam.id, { 1: 'A' }, database, NOW + 1_000),
      saveExamAnswers(exam.id, { 2: 'B' }, other, NOW + 2_000),
    ])
    expect((await database.examSessions.get(exam.id))?.answers).toEqual({ 1: 'A', 2: 'B' })
    await saveExamAnswers(exam.id, { 1: 'C' }, other, NOW + 3_000)
    database.close()
    const reopened = testDatabase(database.name)
    expect((await reopened.examSessions.get(exam.id))?.answers).toEqual({ 1: 'C', 2: 'B' })
  })

  it('截止前可保存，恰好到时禁止修改并以deadline作为交卷时刻', async () => {
    const database = testDatabase()
    const exam = await startExam(2025, 1, database, NOW)
    await saveExamAnswers(exam.id, { 1: 'A' }, database, exam.deadlineAt - 1)
    const expired = await saveExamAnswers(exam.id, { 1: 'B', 2: 'C' }, database, exam.deadlineAt)
    expect(expired.status).toBe('submitted')
    expect(expired.submittedAt).toBe(exam.deadlineAt)
    expect(expired.answers).toEqual({ 1: 'A' })
    const unchanged = await saveExamAnswers(exam.id, { 1: 'D' }, database, exam.deadlineAt + 50_000)
    expect(unchanged).toEqual(expired)
  })

  it('挂起直到期限之后保存，也不会获得额外答题时间', async () => {
    const database = testDatabase()
    const exam = await startExam(2025, 1, database, NOW)
    const expired = await saveExamAnswers(exam.id, { 40: 'A' }, database, exam.deadlineAt + 3_600_000)
    expect(expired.answers).toEqual({})
    expect(expired.submittedAt).toBe(exam.deadlineAt)
  })

  it('提前交卷、重复交卷和并发交卷保持首次结果不变', async () => {
    const database = testDatabase()
    const exam = await startExam(2025, 180, database, NOW)
    await saveExamAnswers(exam.id, { 1: 'B' }, database, NOW + 500)
    const submitted = await submitExam(exam.id, database, NOW + 1_000)
    expect(submitted.submittedAt).toBe(NOW + 1_000)
    const repeated = await Promise.all([
      submitExam(exam.id, database, NOW + 2_000),
      submitExam(exam.id, database, exam.deadlineAt + 1_000),
      saveExamAnswers(exam.id, { 1: 'A' }, database, NOW + 3_000),
    ])
    repeated.forEach(result => expect(result).toEqual(submitted))
    expect(await database.examSessions.get(exam.id)).toEqual(submitted)
  })

  it('超时交卷不把提交时刻延后到后台恢复时', async () => {
    const database = testDatabase()
    const exam = await startExam(2025, 1, database, NOW)
    expect((await submitExam(exam.id, database, exam.deadlineAt + 1_000)).submittedAt).toBe(exam.deadlineAt)
  })

  it('只在交卷后允许自评分，分次评分/参考答案增量保存', async () => {
    const database = testDatabase()
    const exam = await startExam(2025, 180, database, NOW)
    await expect(saveExamScoring(exam.id, { analysisScores: { 41: 8 } }, database)).rejects.toThrow('交卷后')
    await submitExam(exam.id, database, NOW + 1_000)
    await saveExamScoring(exam.id, { analysisScores: { 41: 8 }, referenceAnswers: { 1: 'A' } }, database)
    const scored = await saveExamScoring(exam.id, { analysisScores: { 42: 0 }, referenceAnswers: { 2: 'C' } }, database)
    expect(scored.analysisScores).toEqual({ 41: 8, 42: 0 })
    expect(scored.referenceAnswers).toEqual({ 1: 'A', 2: 'C' })
  })

  it('没有核验满分表的年份拒绝综合评分，不能自行猜测满分', async () => {
    const database = testDatabase()
    const exam = await startExam(2024, 180, database, NOW)
    await submitExam(exam.id, database, NOW + 1_000)
    await expect(saveExamScoring(exam.id, { analysisScores: { 41: 1 } }, database)).rejects.toThrow('分值不合法')
    expect((await database.examSessions.get(exam.id))?.analysisScores).toEqual({})
  })

  it.each([-1, 13, Number.NaN, Number.POSITIVE_INFINITY])('交卷后不接受越界综合分%s', async score => {
    const database = testDatabase()
    const exam = await startExam(2025, 180, database, NOW)
    await submitExam(exam.id, database, NOW + 1_000)
    await expect(saveExamScoring(exam.id, { analysisScores: { 41: score } }, database)).rejects.toThrow('分值不合法')
    expect((await database.examSessions.get(exam.id))?.analysisScores).toEqual({})
  })

  it.each([
    { 0: 'A' }, { 41: 'A' }, { '01': 'A' }, { 1: 'a' }, { 1: '' }, { 1: 'AB' },
  ] as Record<string, string>[])('非法答题卡被拒绝，原状态保留：%j', async answers => {
    const database = testDatabase()
    const exam = await startExam(2025, 180, database, NOW)
    await expect(saveExamAnswers(exam.id, answers, database, NOW + 1_000)).rejects.toThrow('非法')
    expect((await database.examSessions.get(exam.id))?.answers).toEqual({})
  })

  it('不存在的会话不能保存或交卷', async () => {
    const database = testDatabase()
    await expect(saveExamAnswers('missing', { 1: 'A' }, database, NOW)).rejects.toThrow('不存在')
    await expect(submitExam('missing', database, NOW)).rejects.toThrow('不存在')
  })

  it('数据库创建失败向上抛出，不能留下假的会话成功状态', async () => {
    const database = testDatabase()
    await database.open()
    vi.spyOn(database.examSessions, 'add').mockRejectedValueOnce(new Error('测试：配额不足'))
    await expect(startExam(2025, 180, database, NOW)).rejects.toThrow('配额不足')
    expect(await database.examSessions.count()).toBe(0)
  })

  it('答题写入失败向上抛出，事务回滚保留之前答案', async () => {
    const database = testDatabase()
    const exam = await startExam(2025, 180, database, NOW)
    await saveExamAnswers(exam.id, { 1: 'A' }, database, NOW + 100)
    vi.spyOn(database.examSessions, 'put').mockRejectedValueOnce(new Error('测试：写入失败'))
    await expect(saveExamAnswers(exam.id, { 1: 'B', 2: 'C' }, database, NOW + 200)).rejects.toThrow('写入失败')
    expect((await database.examSessions.get(exam.id))?.answers).toEqual({ 1: 'A' })
  })

  it('数据库读取失败不能静默返回成功提交', async () => {
    const database = testDatabase()
    const exam = await startExam(2025, 180, database, NOW)
    vi.spyOn(database.examSessions, 'get').mockRejectedValueOnce(new Error('测试：读取失败'))
    await expect(submitExam(exam.id, database, NOW + 100)).rejects.toThrow('读取失败')
    expect((await database.examSessions.get(exam.id))?.status).toBe('running')
  })
})

describe('综合题评分清除：未评分与0分严格区分', () => {
  it('仅删除指定题号，保留其他题分数、原作答、参考答案和交卷时刻', async () => {
    const database = testDatabase()
    const exam = await startExam(2025, 180, database, NOW)
    await saveExamAnswers(exam.id, { 1: 'B' }, database, NOW + 100)
    await submitExam(exam.id, database, NOW + 1_000)
    const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW + 2_000)
    const before = await saveExamScoring(exam.id, { analysisScores: { 41: 8, 42: 0 }, referenceAnswers: { 1: 'A' } }, database)
    clock.mockReturnValue(NOW + 3_000)
    const cleared = await clearExamAnalysisScore(exam.id, 41, database)
    expect(cleared).toEqual({ ...before, analysisScores: { 42: 0 }, updatedAt: NOW + 3_000 })
    expect(await database.examSessions.get(exam.id)).toEqual(cleared)
    database.close()
    const reopened = testDatabase(database.name)
    expect((await reopened.examSessions.get(exam.id))?.analysisScores).toEqual({ 42: 0 })
  })

  it('可以清除已经保存的0分，不能用真值检查把0分误当未评分', async () => {
    const database = testDatabase()
    const exam = await startExam(2025, 180, database, NOW)
    await submitExam(exam.id, database, NOW + 1_000)
    await saveExamScoring(exam.id, { analysisScores: { 41: 0, 42: 4 } }, database)
    const cleared = await clearExamAnalysisScore(exam.id, 41, database)
    expect(cleared.analysisScores).toEqual({ 42: 4 })
    expect(cleared.analysisScores).not.toHaveProperty('41')
  })

  it('对已未评分题幂等，重复清除不改动更新时间', async () => {
    const database = testDatabase()
    const exam = await startExam(2025, 180, database, NOW)
    const submitted = await submitExam(exam.id, database, NOW + 1_000)
    vi.spyOn(Date, 'now').mockReturnValue(NOW + 10_000)
    expect(await clearExamAnalysisScore(exam.id, 41, database)).toEqual(submitted)
    expect(await clearExamAnalysisScore(exam.id, 41, database)).toEqual(submitted)
    expect(await database.examSessions.get(exam.id)).toEqual(submitted)
  })

  it('进行中的试卷不能清除评分，即使目标键本就不存在', async () => {
    const database = testDatabase()
    const exam = await startExam(2025, 180, database, NOW)
    await expect(clearExamAnalysisScore(exam.id, 41, database)).rejects.toThrow('仅交卷后')
    expect(await database.examSessions.get(exam.id)).toEqual(exam)
  })

  it('不存在的试卷不会被清除操作创建', async () => {
    const database = testDatabase()
    await expect(clearExamAnalysisScore('missing', 41, database)).rejects.toThrow('不存在')
    expect(await database.examSessions.count()).toBe(0)
  })

  it.each([0, 40, 48, 41.5, Number.NaN, Number.POSITIVE_INFINITY])('拒绝非法综合题号%s且不改变记录', async no => {
    const database = testDatabase()
    const exam = await startExam(2025, 180, database, NOW)
    const submitted = await submitExam(exam.id, database, NOW + 1_000)
    await expect(clearExamAnalysisScore(exam.id, no, database)).rejects.toThrow('题号不合法')
    expect(await database.examSessions.get(exam.id)).toEqual(submitted)
  })

  it('两连接并发清除和保存不同题，不会覆盖其他标签页的新评分', async () => {
    const database = testDatabase(), other = testDatabase(database.name)
    const exam = await startExam(2025, 180, database, NOW)
    await submitExam(exam.id, database, NOW + 1_000)
    await saveExamScoring(exam.id, { analysisScores: { 41: 8, 42: 0 }, referenceAnswers: { 1: 'A' } }, database)
    await other.open()
    await Promise.all([
      clearExamAnalysisScore(exam.id, 41, database),
      saveExamScoring(exam.id, { analysisScores: { 43: 5 } }, other),
    ])
    expect((await database.examSessions.get(exam.id))?.analysisScores).toEqual({ 42: 0, 43: 5 })
    expect((await database.examSessions.get(exam.id))?.referenceAnswers).toEqual({ 1: 'A' })
    await Promise.all([
      clearExamAnalysisScore(exam.id, 42, database),
      clearExamAnalysisScore(exam.id, 43, other),
    ])
    expect((await database.examSessions.get(exam.id))?.analysisScores).toEqual({})
  })

  it('清除写入失败时整个记录回滚，旧分数仍在', async () => {
    const database = testDatabase()
    const exam = await startExam(2025, 180, database, NOW)
    await submitExam(exam.id, database, NOW + 1_000)
    const before = await saveExamScoring(exam.id, { analysisScores: { 41: 8, 42: 4 } }, database)
    const fail = () => { throw new Error('测试：清除时配额失败') }
    database.examSessions.hook('updating', fail)
    try {
      await expect(clearExamAnalysisScore(exam.id, 41, database)).rejects.toThrow('配额失败')
    } finally { database.examSessions.hook('updating').unsubscribe(fail) }
    expect(await database.examSessions.get(exam.id)).toEqual(before)
  })

  it('清除任意一道评分后总分恢复待评，其他六题分数仍计入小计', async () => {
    const database = testDatabase()
    const exam = await startExam(2025, 180, database, NOW), key = answerKey()
    await saveExamAnswers(exam.id, Object.fromEntries(key.choices.map((a, i) => [i + 1, a])), database, NOW + 100)
    await submitExam(exam.id, database, NOW + 1_000)
    const scored = await saveExamScoring(exam.id, { analysisScores: Object.fromEntries(key.analysis.map(q => [q.questionNo, q.maxScore])) }, database)
    expect(gradeExam(scored, key).total).toBe(150)
    const cleared = await clearExamAnalysisScore(exam.id, 41, database)
    expect(gradeExam(cleared, key)).toMatchObject({ choiceScore: 80, analysisScore: 58, total: null })
    expect(Object.keys(cleared.analysisScores)).toHaveLength(6)
  })
})

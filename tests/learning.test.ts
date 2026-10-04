import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { Cs408Database } from '@/db/db'
import {
  DAY, initialProgress, latestAttempts, newLearningQueue, reviewQueue, scheduleReview,
} from '@/learning/scheduler'
import { useLearningStore } from '@/stores/learning'
import type { MindMapNode, StudyAttempt, StudyProgress, StudySettings } from '@/types'

// The store uses a shared DB in production. Forward only that singleton to an
// isolated, randomly named fake IndexedDB; keep the real database class/schema.
const slot = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('@/db/db', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/db/db')>()
  return {
    ...original,
    db: new Proxy({}, {
      get(_target, property) {
        const database = slot.current as Cs408Database | undefined
        if (!database) throw new Error('Test database has not been initialized')
        const value = Reflect.get(database, property, database)
        return typeof value === 'function' ? value.bind(database) : value
      },
    }),
  }
})

const NODE = 'CS-03-03-001'
const NOW = 1_800_000_000_000
function attempt(id: string, createdAt = NOW, correct = true): StudyAttempt {
  return {
    id, nodeId: NODE, quizId: `${NODE}-Q001`, type: 'choice',
    selectedAnswer: correct ? 'B' : 'A', correct, selfAssessed: false,
    note: '', createdAt, updatedAt: createdAt,
  }
}
function progress(patch: Partial<StudyProgress> = {}): StudyProgress {
  return { ...initialProgress(NODE, NOW), ...patch }
}

describe('interval review scheduler', () => {
  it('starts as learning, without claiming reading means mastery', () => {
    expect(initialProgress(NODE, NOW)).toEqual({
      nodeId: NODE, status: 'learning', visits: 0, bookmarked: false, note: '',
      lastStudiedAt: NOW, lastReviewedAt: 0, nextReviewAt: NOW + DAY,
      intervalDays: 0, streak: 0, manualMastery: false, updatedAt: NOW,
    })
  })

  it('a forgotten answer resets evidence and becomes due in one hour', () => {
    const previous = progress({ status: 'mastered', streak: 4, intervalDays: 16, manualMastery: true })
    const saved = { ...previous }
    const result = scheduleReview(previous, 'again', NOW + DAY)
    expect(result).toMatchObject({ status: 'review', streak: 0, intervalDays: 0,
      lastReviewedAt: NOW + DAY, nextReviewAt: NOW + DAY + 3_600_000, manualMastery: false })
    expect(previous).toEqual(saved)
  })

  it('three genuinely spaced good recalls give evidence-based mastery', () => {
    const first = scheduleReview(progress(), 'good', NOW)
    const second = scheduleReview(first, 'good', NOW + DAY)
    const third = scheduleReview(second, 'good', NOW + 3 * DAY)
    expect([first.streak, second.streak, third.streak]).toEqual([1, 2, 3])
    expect([first.intervalDays, second.intervalDays, third.intervalDays]).toEqual([1, 2, 4])
    expect([first.status, second.status, third.status]).toEqual(['review', 'review', 'mastered'])
    expect(third.nextReviewAt).toBe(NOW + 7 * DAY)
  })

  it('repeating answers within the same day does not grow the streak or interval', () => {
    const first = scheduleReview(progress(), 'good', NOW)
    const sameDay = scheduleReview(first, 'easy', NOW + 30_000)
    expect(sameDay.streak).toBe(1)
    expect(sameDay.intervalDays).toBe(1)
    expect(sameDay.status).toBe('review')
  })

  it('hard recall resets the successful streak and chooses a short interval', () => {
    const result = scheduleReview(progress({ streak: 2, intervalDays: 8, lastReviewedAt: NOW - DAY }), 'hard', NOW)
    expect(result).toMatchObject({ streak: 0, intervalDays: 1, status: 'review', nextReviewAt: NOW + DAY })
  })

  it('an older completion timestamp cannot rewind an already newer plan', () => {
    const current = scheduleReview(progress(), 'easy', NOW + DAY)
    expect(scheduleReview(current, 'again', NOW)).toEqual(current)
  })

  it.each([
    ['good', 50, 60], ['easy', 50, 90], ['easy', 0, 4],
  ] as const)('caps %s spacing from %i days at %i days', (rating, oldInterval, expected) => {
    const result = scheduleReview(progress({ intervalDays: oldInterval, lastReviewedAt: NOW - DAY }), rating, NOW)
    expect(result.intervalDays).toBe(expected)
    expect(result.nextReviewAt).toBe(NOW + expected * DAY)
  })

  it('keeps the latest retry per question with a deterministic equal-time tie', () => {
    const records = [attempt('a', NOW), attempt('b', NOW), attempt('older', NOW - DAY),
      { ...attempt('other', NOW + 1), quizId: `${NODE}-Q002` }]
    const before = [...records]
    expect(latestAttempts(records).map(item => item.id)).toEqual(['other', 'b'])
    expect(records).toEqual(before)
  })

  it('review queue includes only due, non-manual records and applies stable limits', () => {
    const entries = [
      progress({ nodeId: 'CS-03-03-002', nextReviewAt: NOW }),
      progress({ nodeId: 'CS-03-03-001', nextReviewAt: NOW }),
      progress({ nodeId: 'CS-03-03-003', nextReviewAt: NOW - DAY }),
      progress({ nodeId: 'CS-03-03-004', nextReviewAt: NOW - 2 * DAY, manualMastery: true }),
      progress({ nodeId: 'CS-04-01-001', nextReviewAt: NOW + 1 }),
    ]
    expect(reviewQueue(entries, NOW, 2).map(item => item.nodeId)).toEqual(['CS-03-03-003', 'CS-03-03-001'])
    expect(reviewQueue(entries, NOW, 0)).toEqual([])
    expect(entries[0].nodeId).toBe('CS-03-03-002')
  })

  it('new-learning queue skips subjects, branches and already studied leaves', () => {
    const nodes: MindMapNode[] = [
      { id: 'CS', name: 'subject' }, { id: 'CS-01', name: 'chapter', parentId: 'CS' },
      { id: 'CS-01-01', name: 'leaf1', parentId: 'CS-01' },
      { id: 'CS-01-02', name: 'section', parentId: 'CS-01' },
      { id: 'CS-01-02-001', name: 'leaf2', parentId: 'CS-01-02' },
      { id: 'CS-01-02-002', name: 'leaf3', parentId: 'CS-01-02' },
    ]
    expect(newLearningQueue(nodes, [progress({ nodeId: 'CS-01-01' })], 1).map(n => n.id)).toEqual(['CS-01-02-001'])
    expect(newLearningQueue(nodes, [], 0)).toEqual([])
  })
})

describe('learning store transactions', () => {
  let database: Cs408Database

  beforeEach(async () => {
    database = new Cs408Database(`cs408-learning-test-${crypto.randomUUID()}`)
    slot.current = database
    await database.open()
    setActivePinia(createPinia())
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    database.close()
    await database.delete()
    slot.current = undefined
  })

  it('serializes concurrent visits without losing increments', async () => {
    const store = useLearningStore()
    await Promise.all(Array.from({ length: 12 }, () => store.visit(NODE)))
    expect((await database.studyProgress.get(NODE))?.visits).toBe(12)
    expect(store.progress[0].visits).toBe(12)
  })

  it('double-submit retries are idempotent even when concurrent', async () => {
    const store = useLearningStore()
    const item = attempt('same-attempt')
    await Promise.all([store.recordAttempt(item, 'good'), store.recordAttempt(item, 'good')])
    expect(await database.attempts.count()).toBe(1)
    expect((await database.studyProgress.get(NODE))?.streak).toBe(1)
    expect(store.attempts).toHaveLength(1)
  })

  it('different same-day submissions are saved without inflating mastery evidence', async () => {
    const store = useLearningStore()
    await Promise.all([store.recordAttempt(attempt('first'), 'good'), store.recordAttempt(attempt('second'), 'good')])
    expect(await database.attempts.count()).toBe(2)
    expect((await database.studyProgress.get(NODE))?.streak).toBe(1)
  })

  it('an aborted progress write rolls back its paired attempt', async () => {
    const store = useLearningStore()
    vi.spyOn(database.studyProgress, 'put').mockRejectedValueOnce(new Error('simulated quota failure'))
    await expect(store.recordAttempt(attempt('rollback'), 'good')).rejects.toThrow('quota failure')
    expect(await database.attempts.count()).toBe(0)
    expect(await database.studyProgress.count()).toBe(0)
    expect(store.attempts).toEqual([])
  })

  it('a delayed old attempt is kept in history but never rewinds the newer review plan', async () => {
    const store = useLearningStore()
    await store.recordAttempt(attempt('newer', NOW + 2 * DAY), 'easy')
    const current = await database.studyProgress.get(NODE)
    await store.recordAttempt(attempt('arrived-late', NOW, false), 'again')
    expect(await database.attempts.count()).toBe(2)
    expect(await database.studyProgress.get(NODE)).toEqual(current)
  })

  it('saving a stale note does not erase a concurrent visit or review plan', async () => {
    const store = useLearningStore()
    const stale = progress()
    await database.studyProgress.put(stale)
    await store.visit(NODE)
    await store.recordAttempt(attempt('reviewed', NOW + DAY), 'good')
    const current = (await database.studyProgress.get(NODE))!
    await store.saveProgress(NODE, { note: '记录块偏移、组索引与标记的区别', bookmarked: true })
    const result = (await database.studyProgress.get(NODE))!
    expect(result).toMatchObject({
      note: '记录块偏移、组索引与标记的区别', bookmarked: true,
      visits: current.visits, lastStudiedAt: current.lastStudiedAt,
      lastReviewedAt: current.lastReviewedAt, nextReviewAt: current.nextReviewAt,
      status: current.status, intervalDays: current.intervalDays, streak: current.streak,
    })
  })

  it('manual mastery is an explicit edit and preserves independently collected evidence', async () => {
    const store = useLearningStore()
    await store.recordAttempt(attempt('real-evidence'), 'good')
    await store.saveProgress(NODE, { status: 'mastered', manualMastery: true })
    expect(await database.studyProgress.get(NODE)).toMatchObject({
      status: 'mastered', manualMastery: true, streak: 1, lastReviewedAt: NOW,
    })
    expect(reviewQueue(store.progress, NOW + 10 * DAY, 10)).toEqual([])
    await store.recordAttempt(attempt('later-recall', NOW + DAY), 'good')
    expect((await database.studyProgress.get(NODE))?.manualMastery).toBe(false)
  })

  it('updating a mistake note does not count as another answer or reschedule review', async () => {
    const store = useLearningStore()
    const item = attempt('mistake', NOW, false)
    await store.recordAttempt(item, 'again')
    const current = await database.studyProgress.get(NODE)
    await store.updateAttempt({ ...item, note: '把字节地址误当作块号', errorKind: 'condition' })
    expect(await database.attempts.count()).toBe(1)
    expect(await database.studyProgress.get(NODE)).toEqual(current)
    expect(await database.attempts.get(item.id)).toMatchObject({ note: '把字节地址误当作块号', errorKind: 'condition' })
  })

  it.each([
    [0, 3], [51, 3], [1.5, 3], [10, -1], [10, 21], [10, 0.5], [NaN, 3],
  ])('rejects invalid settings %s/%s before writing', async (review, fresh) => {
    const store = useLearningStore()
    const settings: StudySettings = { id: 'preferences', dailyReviewLimit: review, dailyNewLimit: fresh, updatedAt: NOW }
    await expect(store.saveSettings(settings)).rejects.toThrow('每日复习数量')
    expect(await database.settings.count()).toBe(0)
  })

  it.each([[1, 0], [50, 20]])('accepts settings boundaries %i/%i', async (review, fresh) => {
    const store = useLearningStore()
    await store.saveSettings({ id: 'preferences', dailyReviewLimit: review, dailyNewLimit: fresh, updatedAt: NOW })
    expect(store.settings).toMatchObject({ dailyReviewLimit: review, dailyNewLimit: fresh })
    expect(await database.settings.count()).toBe(1)
  })

  it('deduplicates initialization and can retry an initial read failure', async () => {
    const store = useLearningStore()
    const failing = vi.spyOn(database.studyProgress, 'toArray').mockRejectedValueOnce(new Error('read unavailable'))
    // Pinia wraps action promises, so deduplication is about one DB load, not
    // object identity of the caller-visible Promise wrappers.
    const results = await Promise.allSettled([store.initialize(), store.initialize()])
    expect(failing).toHaveBeenCalledTimes(1)
    expect(results.map(result => result.status)).toEqual(['rejected', 'rejected'])
    expect((results[0] as PromiseRejectedResult).reason.message).toBe('read unavailable')
    expect(store.error).toContain('read unavailable')
    failing.mockRestore()
    await store.initialize()
    expect(store.error).toBe('')
  })

  it('a late older reload cannot overwrite a newer completed UI snapshot', async () => {
    const store = useLearningStore()
    await database.studyProgress.put(progress({ visits: 1, note: 'old snapshot' }))
    let releaseOld!: () => void, readCompleted!: () => void
    const oldSnapshotRead = new Promise<void>(resolve => { readCompleted = resolve })
    const fresh = progress({ visits: 9, note: 'new snapshot' })
    const actualTransaction = database.transaction.bind(database)
    // Delay delivery only after the real read transaction has completed. A
    // deferred plain Promise inside an active IDB transaction would cause a
    // test-generated PrematureCommitError instead of modeling the UI race.
    vi.spyOn(database, 'transaction').mockImplementationOnce(((...args: any[]) => {
      const reading = (actualTransaction as (...values: any[]) => Promise<unknown>)(...args)
      return reading.then(snapshot => new Promise(resolve => {
        releaseOld = () => resolve(snapshot)
        readCompleted()
      }))
    }) as typeof database.transaction)
    const older = store.reload()
    await oldSnapshotRead
    await database.studyProgress.put(fresh)
    const newer = store.reload()
    await newer
    expect(store.progress[0]).toEqual(fresh)
    releaseOld()
    await older
    expect(store.progress[0]).toEqual(fresh)
  })
})

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/db/db'
import { initialProgress, scheduleReview } from '@/learning/scheduler'
import type { StudyProgress, StudyAttempt, StudySettings, ReviewRating } from '@/types'

export const useLearningStore = defineStore('learning', () => {
  const progress = ref<StudyProgress[]>([])
  const attempts = ref<StudyAttempt[]>([])
  const settings = ref<StudySettings>({ id: 'preferences', dailyReviewLimit: 10, dailyNewLimit: 3, updatedAt: 0 })
  const error = ref('')
  let pendingLoad: Promise<void> | undefined
  let loadSequence = 0
  async function reload(): Promise<void> {
    const token=++loadSequence
    try {
      const [p, a, s] = await db.transaction('r',[db.studyProgress,db.attempts,db.settings],()=>Promise.all([db.studyProgress.toArray(), db.attempts.toArray(), db.settings.get('preferences')]))
      if(token!==loadSequence)return
      progress.value = p; attempts.value = a
      if (s) settings.value = s
      error.value = ''
    } catch (e) { if(token===loadSequence)error.value = '本地记录不可用：' + (e instanceof Error ? e.message : String(e)); throw e }
  }
  function initialize(): Promise<void> { return pendingLoad ??= reload().catch(e => { pendingLoad = undefined; throw e }) }
  async function visit(nodeId: string): Promise<void> {
    await db.transaction('rw', db.studyProgress, async () => {
      const now = Date.now(), p = await db.studyProgress.get(nodeId) ?? initialProgress(nodeId, now)
      await db.studyProgress.put({ ...p, visits: p.visits + 1, lastStudiedAt: now, updatedAt: now })
    }); await reload()
  }
  async function saveProgress(nodeId: string, change: Partial<Pick<StudyProgress, 'note'|'bookmarked'|'status'|'manualMastery'>>): Promise<void> {
    await db.transaction('rw',db.studyProgress,async()=>{
      const now=Date.now(),current=await db.studyProgress.get(nodeId)??initialProgress(nodeId,now)
      await db.studyProgress.put({...current,...change,updatedAt:now})
    });await reload()
  }
  async function recordAttempt(attempt: StudyAttempt, rating: ReviewRating): Promise<void> {
    await db.transaction('rw', db.attempts, db.studyProgress, async () => {
      // 同一提交重试使用同一 ID，避免双击/网络重试形成重复记录。
      if (await db.attempts.get(attempt.id)) return
      await db.attempts.add(JSON.parse(JSON.stringify(attempt)) as StudyAttempt)
      const p = await db.studyProgress.get(attempt.nodeId) ?? initialProgress(attempt.nodeId, attempt.createdAt)
      await db.studyProgress.put(scheduleReview(p, rating, attempt.createdAt))
    }); await reload()
  }
  async function updateAttempt(attempt: StudyAttempt): Promise<void> {
    await db.attempts.put(JSON.parse(JSON.stringify({ ...attempt, updatedAt: Date.now() })) as StudyAttempt); await reload()
  }
  async function saveSettings(value: StudySettings): Promise<void> {
    if (!Number.isInteger(value.dailyReviewLimit) || value.dailyReviewLimit < 1 || value.dailyReviewLimit > 50 ||
      !Number.isInteger(value.dailyNewLimit) || value.dailyNewLimit < 0 || value.dailyNewLimit > 20) throw new Error('每日复习数量为 1–50，新学数量为 0–20')
    await db.settings.put({ ...value, updatedAt: Date.now() }); await reload()
  }
  return { progress, attempts, settings, error, reload, initialize, visit, saveProgress, recordAttempt, updateAttempt, saveSettings }
})

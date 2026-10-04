import type { StudyAttempt, StudyProgress, ReviewRating, MindMapNode } from '@/types'

export const DAY = 86_400_000
export function initialProgress(nodeId: string, now: number): StudyProgress {
  return { nodeId, status: 'learning', visits: 0, bookmarked: false, note: '', lastStudiedAt: now,
    lastReviewedAt: 0, nextReviewAt: now + DAY, intervalDays: 0, streak: 0, manualMastery: false, updatedAt: now }
}

/** 简明的间隔复习策略，不声称是个性化最优模型。同一天刷题不累加间隔证据。 */
export function scheduleReview(previous: StudyProgress, rating: ReviewRating, now: number): StudyProgress {
  if(now < previous.lastReviewedAt)return {...previous}
  const result = { ...previous, lastReviewedAt: now, updatedAt: now, manualMastery: false }
  if (rating === 'again') {
    return { ...result, status: 'review', streak: 0, intervalDays: 0, nextReviewAt: now + 3_600_000 }
  }
  const spaced = previous.lastReviewedAt === 0 || now - previous.lastReviewedAt >= DAY
  const interval = rating === 'hard' ? 1 : rating === 'easy'
    ? Math.min(90, Math.max(4, previous.intervalDays * 3)) : Math.min(60, Math.max(1, previous.intervalDays * 2))
  result.intervalDays = spaced ? interval : Math.max(1, previous.intervalDays)
  result.streak = rating === 'hard' ? 0 : previous.streak + (spaced ? 1 : 0)
  result.status = result.streak >= 3 ? 'mastered' : 'review'
  result.nextReviewAt = now + result.intervalDays * DAY
  return result
}

export function latestAttempts(attempts: StudyAttempt[]): StudyAttempt[] {
  const latest = new Map<string, StudyAttempt>()
  for (const item of attempts) {
    const old = latest.get(item.quizId)
    if (!old || item.createdAt > old.createdAt || (item.createdAt === old.createdAt && item.id > old.id)) latest.set(item.quizId, item)
  }
  return [...latest.values()].sort((a, b) => b.createdAt - a.createdAt)
}
export function reviewQueue(progress: StudyProgress[], now: number, limit: number): StudyProgress[] {
  return progress.filter(item => item.nextReviewAt <= now && !item.manualMastery)
    .sort((a, b) => a.nextReviewAt - b.nextReviewAt || a.nodeId.localeCompare(b.nodeId)).slice(0, limit)
}
export function newLearningQueue(nodes: MindMapNode[], progress: StudyProgress[], limit: number): MindMapNode[] {
  const parents = new Set(nodes.map(item => item.parentId))
  const learned = new Set(progress.map(item => item.nodeId))
  return nodes.filter(item => item.parentId && !parents.has(item.id) && !learned.has(item.id)).slice(0, limit)
}

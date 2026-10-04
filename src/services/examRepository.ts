import { db,type Cs408Database } from '@/db/db'
import type { ExamSession } from '@/types'
import papers from '@/content/papers/index.json'
import answerKeys from '@/content/papers/answer-keys.json'
import type { ExamAnswerKey } from '@/types'

export async function startExam(year:number,durationMinutes:number,database:Cs408Database=db,now=Date.now()):Promise<ExamSession>{
  if(!papers.papers.some(p=>p.year===year)||!Number.isFinite(durationMinutes)||durationMinutes<=0||durationMinutes>180||!Number.isFinite(now)||now<0)throw new Error('考试年份或时长不合法')
  return database.transaction('rw',database.examSessions,async()=>{
    // 一年同时只有一个进行中的会话；避免双击或两个标签页重复创建。
    const existing=(await database.examSessions.where('year').equals(year).toArray()).find(s=>s.status==='running')
    if(existing)return existing
    const session:ExamSession={id:crypto.randomUUID(),year,status:'running',startedAt:now,deadlineAt:now+durationMinutes*60_000,answers:{},analysisScores:{},updatedAt:now}
    await database.examSessions.add(session);return session
  })
}
export async function saveExamAnswers(id:string,answers:Record<string,string>,database:Cs408Database=db,now=Date.now()):Promise<ExamSession>{
  return database.transaction('rw',database.examSessions,async()=>{
    const s=await database.examSessions.get(id);if(!s)throw new Error('考试记录不存在')
    if(s.status!=='running')return s
    if(now>=s.deadlineAt){const expired={...s,status:'submitted' as const,submittedAt:s.deadlineAt,updatedAt:now};await database.examSessions.put(expired);return expired}
    for(const [no,a] of Object.entries(answers))if(!/^([1-9]|[1-3]\d|40)$/.test(no)||!/^[A-D]$/.test(a))throw new Error('答题卡内容非法')
    // 每个动作只提交发生变化的题，其他标签页的不同题不被旧快照覆盖。
    const updated={...s,answers:{...s.answers,...answers},updatedAt:now};await database.examSessions.put(updated);return updated
  })
}
export async function submitExam(id:string,database:Cs408Database=db,now=Date.now()):Promise<ExamSession>{
  return database.transaction('rw',database.examSessions,async()=>{
    const s=await database.examSessions.get(id);if(!s)throw new Error('考试记录不存在')
    if(s.status==='submitted')return s
    const updated={...s,status:'submitted' as const,submittedAt:Math.min(now,s.deadlineAt),updatedAt:now};await database.examSessions.put(updated);return updated
  })
}
export async function saveExamScoring(id:string,change:Pick<ExamSession,'analysisScores'|'referenceAnswers'>,database:Cs408Database=db):Promise<ExamSession>{
  return database.transaction('rw',database.examSessions,async()=>{
    const s=await database.examSessions.get(id);if(!s||s.status!=='submitted')throw new Error('仅交卷后可评分')
    const key=(answerKeys.keys as ExamAnswerKey[]).find(k=>k.year===s.year)
    for(const [no,score] of Object.entries(change.analysisScores)){
      const max=key?.analysis.find(q=>q.questionNo===Number(no))?.maxScore
      if(!/^4[1-7]$/.test(no)||max===undefined||!Number.isFinite(score)||score<0||score>max)throw new Error('综合题分值不合法')
    }
    for(const [no,answer] of Object.entries(change.referenceAnswers??{}))if(!/^([1-9]|[1-3]\d|40)$/.test(no)||!/^[A-D]$/.test(answer))throw new Error('参考答案不合法')
    const next={...s,analysisScores:{...s.analysisScores,...change.analysisScores},referenceAnswers:{...s.referenceAnswers,...change.referenceAnswers},updatedAt:Date.now()}
    await database.examSessions.put(next);return next
  })
}

/**
 * 清空输入表示「未评分」，不是「评分为 0」。因此删除指定题号的键，
 * 并在读写事务中合并当前记录，避免覆盖其他标签页刚保存的其他题分数。
 * 已经未评分时直接返回；清除旧评分不依赖当前版本仍提供该题满分表。
 */
export async function clearExamAnalysisScore(id:string,questionNo:number,database:Cs408Database=db):Promise<ExamSession>{
  if(!Number.isInteger(questionNo)||questionNo<41||questionNo>47)throw new Error('综合题题号不合法')
  return database.transaction('rw',database.examSessions,async()=>{
    const s=await database.examSessions.get(id)
    if(!s)throw new Error('考试记录不存在')
    if(s.status!=='submitted')throw new Error('仅交卷后可清除评分')
    if(!Object.prototype.hasOwnProperty.call(s.analysisScores,questionNo))return s
    const analysisScores={...s.analysisScores}
    delete analysisScores[questionNo]
    const next={...s,analysisScores,updatedAt:Date.now()}
    await database.examSessions.put(next)
    return next
  })
}

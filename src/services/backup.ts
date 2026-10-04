import { db, type Cs408Database } from '@/db/db'
import index from '@/content/index.json'
import papers from '@/content/papers/index.json'
import answerKeys from '@/content/papers/answer-keys.json'
import type { StudyProgress, StudyAttempt, PaperProgress, StudySettings, CorrectionFeedback, ExamSession, ExamAnswerKey, Quiz } from '@/types'

export interface StudyBackup {
  format: 'cs408-study-backup'
  version: 1
  exportedAt: number
  studyProgress: StudyProgress[]
  attempts: StudyAttempt[]
  paperProgress: PaperProgress[]
  settings: StudySettings[]
  feedback: CorrectionFeedback[]
  examSessions: ExamSession[]
}
const nodeIds = new Set(index.nodes.map(n => n.id)), years = new Set(papers.papers.map(p => p.year))
const fail = (): never => { throw new Error('备份格式或记录内容不合法；未写入任何数据。') }
function obj(value: unknown): Record<string,unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(); return value as Record<string,unknown> }
function str(value: unknown, max = 5000): string { if (typeof value !== 'string' || value.length > max) return fail(); return value }
function number(value: unknown, max = Number.MAX_SAFE_INTEGER): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) return fail(); return value }
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): number { const n = number(value,max); if (!Number.isInteger(n)) return fail(); return n }
function bool(value: unknown): boolean { if (typeof value !== 'boolean') return fail(); return value }
function one<T extends string>(value: unknown, options: readonly T[]): T { if (!options.includes(value as T)) return fail(); return value as T }
function nodeId(value: unknown): string { const s = str(value,80); if (!nodeIds.has(s) || !s.includes('-')) return fail(); return s }
function year(value: unknown): number { const y = integer(value); if (!years.has(y)) return fail(); return y }
function id(value: unknown): string { const s = str(value,120); if (!/^[\w-]+$/.test(s)) return fail(); return s }
function parseAttempt(value:unknown):StudyAttempt {
  const a=obj(value),n=nodeId(a.nodeId),qid=id(a.quizId),type=one(a.type,['choice','fill','analysis','recall'] as const)
  if(!qid.startsWith(n+'-'))return fail()
  const snapshot=a.quiz===undefined?undefined:quiz(a.quiz,n)
  if(snapshot&&(snapshot.id!==qid||snapshot.type!==type))return fail()
  if(type!=='recall'&&!snapshot)return fail()
  const createdAt=number(a.createdAt),updatedAt=number(a.updatedAt)
  if(updatedAt<createdAt)return fail()
  return {id:id(a.id),nodeId:n,quizId:qid,type,...(snapshot?{quiz:snapshot}:{}),selectedAnswer:str(a.selectedAnswer,1000),correct:bool(a.correct),selfAssessed:bool(a.selfAssessed),...(a.errorKind===undefined?{}:{errorKind:one(a.errorKind,['concept','condition','calculation','procedure','other'] as const)}),note:str(a.note),createdAt,updatedAt}
}
function parseSession(value:unknown):ExamSession{
  const s=obj(value),y=year(s.year),key=(answerKeys.keys as ExamAnswerKey[]).find(k=>k.year===y),answers:Record<string,string>={},referenceAnswers:Record<string,string>={},analysisScores:Record<string,number>={}
  const parseAnswers=(value:unknown,output:Record<string,string>)=>{for(const [k,v] of Object.entries(obj(value))){if(!/^([1-9]|[1-3]\d|40)$/.test(k))return fail();output[k]=one(v,['A','B','C','D'] as const)}}
  parseAnswers(s.answers,answers);if(s.referenceAnswers!==undefined)parseAnswers(s.referenceAnswers,referenceAnswers)
  for(const [k,v] of Object.entries(obj(s.analysisScores))){const max=key?.analysis.find(q=>q.questionNo===Number(k))?.maxScore;if(!/^4[1-7]$/.test(k)||max===undefined)return fail();analysisScores[k]=number(v,max)}
  const startedAt=number(s.startedAt),deadlineAt=number(s.deadlineAt),updatedAt=number(s.updatedAt)
  if(deadlineAt<=startedAt||deadlineAt-startedAt>4*3600000||updatedAt<startedAt)return fail()
  const status=one(s.status,['running','submitted'] as const),submittedAt=s.submittedAt===undefined?undefined:number(s.submittedAt)
  if((status==='submitted'&&submittedAt===undefined)||(submittedAt!==undefined&&submittedAt<startedAt))return fail()
  if(status==='running'&&(submittedAt!==undefined||Object.keys(analysisScores).length||Object.keys(referenceAnswers).length))return fail()
  return {id:id(s.id),year:y,status,startedAt,deadlineAt,answers,analysisScores,...(submittedAt===undefined?{}:{submittedAt}),...(s.referenceAnswers===undefined?{}:{referenceAnswers}),updatedAt}
}
function array<T>(value: unknown, parse: (value: unknown) => T, key: (value:T) => string|number, max=20000): T[] {
  if (!Array.isArray(value) || value.length>max) return fail()
  const rows = value.map(parse), keys=rows.map(key)
  if(new Set(keys).size!==keys.length) return fail()
  return rows
}
function quiz(value: unknown, expectedNode: string): Quiz {
  const q=obj(value), source=obj(q.source), qid=id(q.id)
  if (!qid.startsWith(expectedNode+'-Q')) return fail()
  const type=one(q.type,['choice','fill','analysis'] as const)
  const options = q.options===undefined ? undefined : array(q.options,v=>str(v,10000), v=>v,4)
  if(type==='choice' && (!options || options.length!==4 || !/^[A-D]$/.test(str(q.answer)))) return fail()
  const url = source.url === undefined ? undefined : str(source.url,2000)
  if(url && !/^https?:\/\//.test(url)) return fail()
  return { id:qid,type,question:str(q.question,30000),...(options?{options}:{}),answer:str(q.answer,30000),explanation:str(q.explanation,50000),
    source:{label:str(source.label,500),adapted:bool(source.adapted),...(url?{url}:{}),...(source.year===undefined?{}:{year:integer(source.year,2100)}),...(source.questionNo===undefined?{}:{questionNo:str(source.questionNo,100)})} }
}
/** 完整校验再写入。逐字段重建对象，不接受原型、脚本或未知表。 */
export function parseBackup(text: string): StudyBackup {
  if (text.length > 10_000_000) throw new Error('备份超过 10 MB，不能导入。')
  let raw: unknown
  try { raw=JSON.parse(text) } catch { throw new Error('文件不是有效 JSON；未写入任何数据。') }
  const b=obj(raw)
  if(b.format!=='cs408-study-backup' || b.version!==1) return fail()
  return {
    format:'cs408-study-backup',version:1,exportedAt:number(b.exportedAt),
    studyProgress:array(b.studyProgress,v=>{const p=obj(v);return {nodeId:nodeId(p.nodeId),status:one(p.status,['learning','review','mastered'] as const),visits:integer(p.visits),bookmarked:bool(p.bookmarked),note:str(p.note),lastStudiedAt:number(p.lastStudiedAt),lastReviewedAt:number(p.lastReviewedAt),nextReviewAt:number(p.nextReviewAt),intervalDays:number(p.intervalDays,90),streak:integer(p.streak),manualMastery:bool(p.manualMastery),updatedAt:number(p.updatedAt)}},p=>p.nodeId,400),
    attempts:array(b.attempts,parseAttempt,a=>a.id),
    paperProgress:array(b.paperProgress,v=>{const p=obj(v),y=year(p.year),paper=papers.papers.find(p=>p.year===y)!;const paperPage=integer(p.paperPage,paper.paper.pages),solutionPage=integer(p.solutionPage,paper.solution.pages);if(paperPage<1 || solutionPage<1) return fail();return {year:y,paperPage,solutionPage,completed:bool(p.completed),updatedAt:number(p.updatedAt)}},p=>p.year,6),
    settings:array(b.settings,v=>{const p=obj(v), review=integer(p.dailyReviewLimit,50);if(p.id!=='preferences'||review<1)return fail();return {id:'preferences' as const,dailyReviewLimit:review,dailyNewLimit:integer(p.dailyNewLimit,20),updatedAt:number(p.updatedAt)}},p=>p.id,1),
    feedback:array(b.feedback,v=>{const f=obj(v);return {id:id(f.id),nodeId:nodeId(f.nodeId),section:str(f.section,100),message:str(f.message,3000),createdAt:number(f.createdAt),updatedAt:number(f.updatedAt)}},f=>f.id,5000),
    examSessions:array(b.examSessions,parseSession,s=>s.id,1000),
  }
}
export async function exportBackup(database:Cs408Database=db):Promise<StudyBackup> {
  return database.transaction('r',[database.studyProgress,database.attempts,database.paperProgress,database.settings,database.feedback,database.examSessions],async()=>({
    format:'cs408-study-backup',version:1,exportedAt:Date.now(),studyProgress:await database.studyProgress.toArray(),attempts:await database.attempts.toArray(),paperProgress:await database.paperProgress.toArray(),settings:await database.settings.toArray(),feedback:await database.feedback.toArray(),examSessions:await database.examSessions.toArray(),
  }))
}
export async function importBackup(backup:StudyBackup,database:Cs408Database=db):Promise<number> {
  // 即使调用方绕过预览，也执行同一校验；事务失败全部回滚。
  const safe=parseBackup(JSON.stringify(backup));let changed=0
  await database.transaction('rw',[database.studyProgress,database.attempts,database.paperProgress,database.settings,database.feedback,database.examSessions],async()=>{
    for(const key of ['studyProgress','attempts','paperProgress','settings','feedback','examSessions'] as const){
      const table=database.table(key)
      for(const row of safe[key]){
        const primary=key==='studyProgress'?(row as StudyProgress).nodeId:key==='paperProgress'?(row as PaperProgress).year:(row as {id:string}).id
        const old=await table.get(primary)
        if(!old || row.updatedAt>old.updatedAt){await table.put(row);changed++}
      }
    }
  });return changed
}

import type { ExamSession, ExamAnswerKey, KnowledgeCategory } from '@/types'
export function questionSubject(no:number):KnowledgeCategory {
  if(no<=11||no===41||no===42)return 'DS'
  if(no<=22||no===43||no===44)return 'CS'
  if(no<=32||no===45||no===46)return 'OS'
  return 'NET'
}
export function remainingSeconds(session:ExamSession,now:number):number{return Math.max(0,Math.ceil((session.deadlineAt-now)/1000))}
export function gradeExam(session:ExamSession,key:ExamAnswerKey):{choiceScore:number;choiceGraded:number;analysisScore:number;total:number|null;subjects:Record<KnowledgeCategory,{score:number;graded:number;max:number}>}{
  const subjects={DS:{score:0,graded:0,max:22},CS:{score:0,graded:0,max:22},OS:{score:0,graded:0,max:20},NET:{score:0,graded:0,max:16}}
  let choiceScore=0,choiceGraded=0,analysisScore=0
  for(let n=1;n<=40;n++){const answer=key.choices[n-1]||session.referenceAnswers?.[n];if(!/^[A-D]$/.test(answer??''))continue;choiceGraded++;subjects[questionSubject(n)].graded++;if(session.answers[n]===answer){choiceScore+=2;subjects[questionSubject(n)].score+=2}}
  const complete=key.analysis.length===7&&key.analysis.every(item=>Number.isFinite(session.analysisScores[item.questionNo])&&session.analysisScores[item.questionNo]>=0&&session.analysisScores[item.questionNo]<=item.maxScore)
  for(const item of key.analysis){const score=session.analysisScores[item.questionNo];if(Number.isFinite(score)&&score>=0&&score<=item.maxScore)analysisScore+=score}
  return {choiceScore,choiceGraded,analysisScore,total:choiceGraded===40&&complete?choiceScore+analysisScore:null,subjects}
}

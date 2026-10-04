<script setup lang="ts">
import { computed,nextTick,onBeforeUnmount,onMounted,ref,watch } from 'vue'
import { useRoute,onBeforeRouteLeave,onBeforeRouteUpdate } from 'vue-router'
import PdfReader from '@/components/PdfReader.vue'
import paperIndex from '@/content/papers/index.json'
import answerKeys from '@/content/papers/answer-keys.json'
import { db } from '@/db/db'
import { paperAssetUrl } from '@/services/paperCache'
import { startExam,saveExamAnswers,submitExam,saveExamScoring,clearExamAnalysisScore } from '@/services/examRepository'
import { gradeExam,remainingSeconds,questionSubject } from '@/learning/exam'
import type { ExamPaper,ExamSession,ExamAnswerKey } from '@/types'
const route=useRoute(),session=ref<ExamSession>(),history=ref<ExamSession[]>([]),paperPage=ref(1),solutionPage=ref(1),showSolution=ref(false),error=ref(''),busy=ref(false),now=ref(Date.now()),saving=ref(0)
const paper=computed(()=>(paperIndex.papers as ExamPaper[]).find(p=>p.year===Number(route.params.year)))
const key=computed(()=>(answerKeys.keys as ExamAnswerKey[]).find(k=>k.year===paper.value?.year))
const grade=computed(()=>session.value&&key.value?gradeExam(session.value,key.value):undefined)
const seconds=computed(()=>session.value?remainingSeconds(session.value,now.value):0)
const timeText=computed(()=>`${String(Math.floor(seconds.value/3600)).padStart(2,'0')}:${String(Math.floor(seconds.value/60)%60).padStart(2,'0')}:${String(seconds.value%60).padStart(2,'0')}`)
// 草稿只属于当前会话。路由守卫先冲刷队列，换卷后不保留未保存项。
const pendingAnswers=ref<Record<string,string>>({})
const loading=ref(true)
// 页面内确认不占用浏览器原生对话框；绑定会话与加载批次，避免旧确认误交新卷。
const submitConfirmation=ref<{id:string;token:number}>()
const submitButton=ref<HTMLButtonElement>(),cancelSubmitButton=ref<HTMLButtonElement>()
let writeQueue=Promise.resolve(),interval:number|undefined,loadToken=0
const names={DS:'数据结构',CS:'计算机组成',OS:'操作系统',NET:'计算机网络'}
function isCurrent(id:string,token:number):boolean{return token===loadToken&&session.value?.id===id}
function remember(s:ExamSession):void{history.value=[s,...history.value.filter(h=>h.id!==s.id)].sort((a,b)=>b.startedAt-a.startedAt)}
async function load():Promise<void>{
  const token=++loadToken;submitConfirmation.value=undefined;loading.value=true;error.value='';showSolution.value=false;paperPage.value=1;session.value=undefined;pendingAnswers.value={}
  try{const rows=await db.examSessions.where('year').equals(Number(route.params.year)).toArray();if(token!==loadToken)return;history.value=rows.sort((a,b)=>b.startedAt-a.startedAt);session.value=rows.find(s=>s.status==='running')??history.value[0];now.value=Date.now();if(session.value?.status==='running'&&seconds.value===0)await finish(false)}catch{if(token===loadToken)error.value='无法读取考试记录，请检查本地存储。'}finally{if(token===loadToken)loading.value=false}
}
async function begin():Promise<void>{
  if(!paper.value||busy.value||loading.value)return
  if(Object.keys(pendingAnswers.value).length&&!window.confirm('有未保存草稿，开始新一轮会丢弃它。请先抄录，确认继续吗？'))return
  const token=loadToken,p=paper.value;busy.value=true;error.value=''
  try{const started=await startExam(p.year,p.durationMinutes);if(token!==loadToken)return;session.value=started;remember(started);pendingAnswers.value={};now.value=Date.now();showSolution.value=false}
  catch{if(token===loadToken)error.value='无法保存新的考试记录，请重试。'}finally{if(token===loadToken)busy.value=false}
}
function updateAnswer(n:number,event:Event):void{
  if(!session.value||session.value.status!=='running')return
  const answer=(event.target as HTMLSelectElement).value;if(!answer)return
  const id=session.value.id,changedAt=Date.now(),token=loadToken
  if(changedAt>=session.value.deadlineAt){error.value='已到截止时间，不能继续修改答案。';void finish(false);return}
  session.value.answers[n]=answer;pendingAnswers.value[n]=answer;saving.value++
  writeQueue=writeQueue.catch(()=>undefined).then(async()=>{
    try{
      const result=await saveExamAnswers(id,{[n]:answer},db,changedAt);if(!isCurrent(id,token))return
      const accepted=result.answers[n]===answer
      if(accepted&&pendingAnswers.value[n]===answer)delete pendingAnswers.value[n]
      const local={...session.value!.answers};session.value=result.status==='running'?{...result,answers:{...result.answers,...local}}:result
      remember(result)
      if(!accepted)error.value='这次选项未保存：试卷已锁定。下方保留草稿，不能追补原作答。'
      else if(!Object.keys(pendingAnswers.value).length)error.value=''
    }catch{if(isCurrent(id,token))error.value='答题卡保存失败。请重试保存，先不要关闭页面。'}finally{saving.value--}
  })
}
async function retry():Promise<void>{
  if(!session.value||busy.value)return;const id=session.value.id,token=loadToken;busy.value=true;await writeQueue
  try{
    const requested={...pendingAnswers.value},result=await saveExamAnswers(id,requested);if(!isCurrent(id,token))return
    session.value=result;remember(result)
    for(const [n,a]of Object.entries(requested))if(result.answers[n]===a&&pendingAnswers.value[n]===a)delete pendingAnswers.value[n]
    error.value=Object.keys(pendingAnswers.value).length?'试卷已锁定，草稿不能追补，请抄录后再离开。':''
  }catch{if(isCurrent(id,token))error.value='仍未保存，请检查浏览器存储。'}finally{if(token===loadToken)busy.value=false}
}
function closeSubmitConfirmation(restoreFocus=false):void{
  submitConfirmation.value=undefined
  if(restoreFocus)void nextTick(()=>submitButton.value?.focus())
}
function cancelSubmit():void{closeSubmitConfirmation(true)}
async function confirmSubmit():Promise<void>{
  const request=submitConfirmation.value
  closeSubmitConfirmation()
  if(request&&isCurrent(request.id,request.token))await finish(false)
}
function handleSubmitDialogKeydown(event:KeyboardEvent):void{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancelSubmit();return}
  if(event.key!=='Tab')return
  // 模态框只含两个操作；Tab/Shift+Tab 均在框内循环，背景同时设置 inert。
  const buttons=Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
  if(!buttons.length)return
  event.preventDefault()
  const current=buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next=current===-1?(event.shiftKey?buttons.length-1:0):(current+(event.shiftKey?-1:1)+buttons.length)%buttons.length
  buttons[next]?.focus()
}
async function finish(confirm:boolean):Promise<void>{
  if(!session.value||session.value.status!=='running'||busy.value)return
  if(confirm){
    submitConfirmation.value={id:session.value.id,token:loadToken}
    await nextTick();cancelSubmitButton.value?.focus();return
  }
  // 超时交卷无需人为确认，即使确认框已打开也按原期限自动交卷。
  closeSubmitConfirmation()
  const id=session.value.id,token=loadToken;busy.value=true;await writeQueue
  try{
    if(!isCurrent(id,token))return
    if(Object.keys(pendingAnswers.value).length&&Date.now()<session.value!.deadlineAt){
      const result=await saveExamAnswers(id,{...pendingAnswers.value})
      for(const [n,a]of Object.entries(pendingAnswers.value))if(result.answers[n]===a)delete pendingAnswers.value[n]
    }
    if(Object.keys(pendingAnswers.value).length&&Date.now()<session.value!.deadlineAt)throw new Error('还有未保存作答，请先重试保存。')
    const submitted=await submitExam(id);if(!isCurrent(id,token))return
    session.value=submitted;remember(submitted);showSolution.value=true
    error.value=Object.keys(pendingAnswers.value).length?'已到时，仅已保存部分交卷。未保存草稿列在下方，请抄录；不能补填原作答。':''
  }catch(e){if(isCurrent(id,token))error.value=e instanceof Error?e.message:'交卷失败，请重试。'}finally{if(token===loadToken)busy.value=false}
}
/** 按输入事件的顺序持久化评分/清除，路由守卫也会等待这条队列。 */
function queueScoring(id:string,token:number,operation:()=>Promise<ExamSession>,failed:()=>void):Promise<void>{
  saving.value++
  writeQueue=writeQueue.catch(()=>undefined).then(async()=>{
    try{const result=await operation();if(isCurrent(id,token)){session.value=result;remember(result);error.value=''}}
    catch{if(isCurrent(id,token))failed()}
    finally{saving.value--}
  })
  return writeQueue
}
async function score(no:number,event:Event):Promise<void>{
  if(!session.value||session.value.status!=='submitted'||!key.value||busy.value)return
  const input=event.target as HTMLInputElement,text=input.value.trim(),value=Number(text),max=key.value.analysis.find(q=>q.questionNo===no)?.maxScore
  const restoreInput=()=>{input.value=String(session.value?.analysisScores[no]??'')}
  // 某些浏览器的非法数值输入（例如未写完的指数）也会呈现空 value；
  // badInput 不能误当成用户主动清空，否则会意外删除之前的评分。
  if(input.validity.badInput||max===undefined||(text!==''&&(!Number.isFinite(value)||value<0||value>max))){
    error.value=`本题评分应为 0–${max??0}；清空输入可以删除该题已保存的评分。`;restoreInput();return
  }
  const id=session.value.id,token=loadToken,clear=text===''
  await queueScoring(id,token,
    ()=>clear?clearExamAnalysisScore(id,no):saveExamScoring(id,{analysisScores:{[no]:value}}),
    ()=>{restoreInput();error.value=clear?'清除评分未保存，原分数仍保留；请重新清空该题。':'评分未保存，原分数仍保留；请重新输入该题。'})
}
async function reference(no:number,event:Event):Promise<void>{
  if(!session.value||session.value.status!=='submitted'||busy.value)return;const a=(event.target as HTMLSelectElement).value;if(!a)return
  const id=session.value.id,token=loadToken
  await queueScoring(id,token,()=>saveExamScoring(id,{analysisScores:{},referenceAnswers:{[no]:a}}),()=>{error.value='参考答案未保存，请重新选择该题。'})
}
async function viewHistory(id:string):Promise<void>{
  if(busy.value||Object.keys(pendingAnswers.value).length)return;const token=loadToken;await writeQueue
  try{const item=await db.examSessions.get(id);if(item&&token===loadToken){session.value=item;showSolution.value=item.status==='submitted'}}catch{error.value='读取历史失败，请重试。'}
}
function jump(no:number):void{const link=paper.value?.questionLinks.find(q=>q.questionNo===no);if(link){paperPage.value=link.paperPage;showSolution.value=false}}
async function guardNavigation():Promise<boolean>{
  await writeQueue
  if(busy.value){error.value='正在保存或交卷，请完成后再切换页面。';return false}
  if(Object.keys(pendingAnswers.value).length)return window.confirm('有未保存作答草稿，确定离开吗？请先抄录，未保存内容会丢失。')
  return true
}
watch(()=>route.params.year,()=>void load())
onMounted(()=>{void load();interval=window.setInterval(()=>{now.value=Date.now();if(session.value?.status==='running'&&seconds.value===0&&!busy.value)void finish(false)},1000)})
onBeforeRouteLeave(guardNavigation)
onBeforeRouteUpdate(guardNavigation)
onBeforeUnmount(()=>{loadToken++;if(interval)clearInterval(interval)})
</script>
<template><main class="learning-page">
  <div :inert="submitConfirmation ? true : undefined">
  <RouterLink to="/papers">← 返回真题中心</RouterLink>
  <header class="learning-hero"><span class="section-kicker">FULL PAPER PRACTICE</span><h1>{{ paper?.year ?? '' }} 年 · 整卷自测</h1><p>计时按绝对截止时间保存，刷新不会重置。客观题自动核对第三方答案；综合题在纸上作答，交卷后对照解析自行评分。</p></header>
  <p v-if="error" class="error-text" role="alert">{{ error }} <button v-if="session?.status==='running' || Object.keys(pendingAnswers).length" class="secondary-button" :disabled="busy" @click="retry">重试保存</button></p>
  <p v-if="Object.keys(pendingAnswers).length && error" class="backup-summary">未保存草稿（请抄录）：{{ Object.entries(pendingAnswers).map(([n,a])=>`${n}=${a}`).join("，") }}</p>
  <p v-if="!paper">没有这一年的试卷。</p>
  <p v-else-if="loading" role="status">正在恢复本机考试记录…</p>
  <template v-else-if="!session"><section class="content-card learning-panel"><p>时长 {{ paper.durationMinutes }} 分钟，总分 {{ paper.totalScore }}。建议先在“离线与备份”完整下载该年份资料。</p><p v-if="!key?.choices.length" class="error-text">{{ key?.note }}</p><button class="primary-button" :disabled="busy || loading" @click="begin">开始并保存计时</button></section></template>
  <template v-else>
    <div class="learning-toolbar"><span>开始于 {{ new Date(session.startedAt).toLocaleString() }}</span><span>{{ session.status==='running'?'进行中':'已交卷' }}</span><span role="status">{{ saving?'考试记录保存中…':Object.keys(pendingAnswers).length?'有未保存草稿':'已保存的作答可刷新恢复' }}</span><button v-if="session.status==='submitted'" class="secondary-button" :disabled="busy" @click="begin">开始新一轮（历史保留）</button><select v-if="history.length>1 && session.status==='submitted'" :value="session.id" aria-label="查看历史考试" @change="viewHistory(($event.target as HTMLSelectElement).value)"><option v-for="s in history" :key="s.id" :value="s.id">{{ new Date(s.startedAt).toLocaleString() }} · {{ s.status==='running'?'进行中':'已交卷' }}</option></select></div>
    <div class="exam-layout">
      <section><div v-if="session.status==='submitted'" class="learning-toolbar"><button class="secondary-button" @click="showSolution=false">查看原卷</button><button class="secondary-button" @click="showSolution=true">查看参考解析</button></div><PdfReader v-if="showSolution && session.status==='submitted'" v-model="solutionPage" :src="paperAssetUrl(paper.solution.url)" :title="`${paper.year} 年参考解析`" /><PdfReader v-else v-model="paperPage" :src="paperAssetUrl(paper.paper.url)" :title="`${paper.year} 年原卷`" /></section>
      <aside class="exam-card"><template v-if="session.status==='running'"><div class="exam-timer" aria-live="off">{{ timeText }}</div><p class="muted">到时自动交卷；切换页面不会暂停。综合题先在纸上完成。</p></template><h2>选择题答题卡</h2><div class="answer-grid"><label v-for="n in 40" :key="n">{{ n }} · {{ names[questionSubject(n)] }}<select :value="session.answers[n]??''" :aria-label="`第 ${n} 题答案`" :disabled="session.status==='submitted'||busy||seconds===0" @change="updateAnswer(n,$event)"><option value="" disabled>未答</option><option v-for="a in ['A','B','C','D']" :key="a">{{ a }}</option></select></label></div>
        <p>{{ Object.keys(session.answers).length }} / 40 已答</p><button v-if="session.status==='running'" ref="submitButton" class="primary-button" :disabled="busy||saving>0" @click="finish(true)">交卷并查看解析</button>
        <details><summary>已关联题目定位</summary><p class="muted">只提供已核对的页面关联，不会猜测其他题的位置。</p><div class="learning-toolbar"><button v-for="link in paper.questionLinks" :key="link.questionNo" class="secondary-button" @click="jump(link.questionNo)">第 {{ link.questionNo }} 题</button></div></details>
      </aside>
    </div>
    <section v-if="session.status==='submitted'&&grade&&key" class="content-card learning-panel"><h2>本轮复盘</h2><p class="muted">{{ key.note }}</p><div class="learning-stats"><div><strong>{{ grade.choiceScore }} / 80</strong><span>客观题参考得分（已核对 {{ grade.choiceGraded }}/40）</span></div><div><strong>{{ grade.analysisScore }} / 70</strong><span>已录入的综合题自评分</span></div><div><strong>{{ grade.total===null?'待评完':grade.total+' / 150' }}</strong><span>总分（含手动评分，非正式判卷）</span></div><div><strong>{{ Math.ceil(((session.submittedAt??session.deadlineAt)-session.startedAt)/60000) }} 分</strong><span>作答用时</span></div></div>
      <div class="table-scroll"><table class="learning-table"><thead><tr><th>科目</th><th>选择题参考得分</th><th>已核对题数</th></tr></thead><tbody><tr v-for="(s,c) in grade.subjects" :key="c"><td>{{ names[c] }}</td><td>{{ s.score }} / {{ s.max }}</td><td>{{ s.graded }}</td></tr></tbody></table></div>
      <h3>逐题对照</h3><div class="table-scroll"><table class="learning-table"><thead><tr><th>题号</th><th>作答</th><th>参考</th><th>结果 / 回顾</th></tr></thead><tbody><tr v-for="n in 40" :key="n"><td>{{ n }}</td><td>{{ session.answers[n]??'未答' }}</td><td><template v-if="key.choices[n-1]">{{ key.choices[n-1] }}</template><select v-else :value="session.referenceAnswers?.[n]??''" :aria-label="`第 ${n} 题人工参考答案`" @change="reference(n,$event)"><option value="" disabled>对照 PDF 录入</option><option v-for="a in ['A','B','C','D']" :key="a">{{ a }}</option></select></td><td>{{ !(key.choices[n-1]||session.referenceAnswers?.[n])?'待核对':session.answers[n]===(key.choices[n-1]||session.referenceAnswers?.[n])?'正确':'错误 / 未答' }} <RouterLink v-for="id in paper.questionLinks.find(q=>q.questionNo===n)?.nodeIds" :key="id" :to="`/node/${id}`">{{ id }} → </RouterLink></td></tr></tbody></table></div>
      <h3>综合题评分（自己对照，不自动判卷）</h3><p v-if="key.analysis.length" class="muted">填写 0 表示已评分且得 0 分；清空输入并离开输入框，会删除该题自评分并恢复为未评分。</p><div class="learning-toolbar"><label v-for="q in key.analysis" :key="q.questionNo">第 {{ q.questionNo }} 题 / {{ q.maxScore }} 分<input :value="session.analysisScores[q.questionNo]??''" :disabled="busy" type="number" min="0" :max="q.maxScore" step="0.5" :aria-label="`第 ${q.questionNo} 题自评分`" @change="score(q.questionNo,$event)" /></label></div><p v-if="!key.analysis.length">原卷分值核对中，暂不录入总分。</p>
    </section>
  </template>
  </div>
  <div v-if="submitConfirmation" class="exam-submit-backdrop">
    <section class="exam-submit-dialog" role="dialog" aria-modal="true" aria-labelledby="exam-submit-title" aria-describedby="exam-submit-description" @keydown="handleSubmitDialogKeydown">
      <h2 id="exam-submit-title">确认交卷？</h2>
      <p id="exam-submit-description">未答选择题按 0 分计算，交卷后不能修改原作答。确认后将等待正在保存的作答完成，再交卷并打开解析。</p>
      <div class="exam-submit-actions"><button ref="cancelSubmitButton" class="secondary-button" @click="cancelSubmit">取消，继续作答</button><button class="primary-button" @click="confirmSubmit">确认交卷</button></div>
    </section>
  </div>
</main></template>

<style scoped>
.exam-submit-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:1.25rem;background:rgb(15 23 42 / 48%)}
.exam-submit-dialog{width:min(100%,32rem);padding:1.75rem;border-radius:1.25rem;background:#fff;color:#1e293b;box-shadow:0 24px 80px rgb(15 23 42 / 24%)}
.exam-submit-dialog h2{margin:0 0 1rem}
.exam-submit-dialog p{margin:0;line-height:1.8}
.exam-submit-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:.75rem;margin-top:1.5rem}
</style>

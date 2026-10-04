<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { db } from '@/db/db'
import { useLearningStore } from '@/stores/learning'
import { exportBackup, parseBackup, importBackup, type StudyBackup } from '@/services/backup'
import { inspectOffline, type OfflineInventory } from '@/services/offline'
import { downloadPaperForOffline, isPaperAvailableOffline, removePaperOffline } from '@/services/paperCache'
import paperIndex from '@/content/papers/index.json'
import type { ExamPaper, CorrectionFeedback } from '@/types'
const learning=useLearningStore(), inventory=ref<OfflineInventory>(), message=ref(''), busy=ref(false), downloading=ref<number>(), candidate=ref<StudyBackup>(), offlineYears=ref<number[]>([]), feedback=ref<CorrectionFeedback[]>([])
const papers=paperIndex.papers as ExamPaper[]
let fileReadToken=0
const readingBackup=ref(false)
function cancelPreview():void{fileReadToken++;readingBackup.value=false;candidate.value=undefined}
function mb(bytes:number):string{return (bytes/1024/1024).toFixed(1)+' MB'}
async function refresh():Promise<void>{
  try {inventory.value=await inspectOffline();offlineYears.value=(await Promise.all(papers.map(async p=>await isPaperAvailableOffline(p)?p.year:0))).filter(Boolean);feedback.value=await db.feedback.orderBy('createdAt').reverse().toArray()}
  catch(e){message.value='检查失败：'+(e instanceof Error?e.message:String(e))}
}
onMounted(()=>void refresh())
async function download(p:ExamPaper):Promise<void>{
  downloading.value=p.year;message.value='开始下载并校验原卷与解析…'
  try{await downloadPaperForOffline(p,(n,t)=>message.value=`${p.year} 年已校验 ${n}/${t} 份文件`);message.value=`${p.year} 年资料已完整校验并保存`;await refresh()}
  catch(e){message.value=e instanceof Error?e.message:'下载失败'}finally{downloading.value=undefined}
}
async function remove(p:ExamPaper):Promise<void>{
  if(!window.confirm(`仅删除 ${p.year} 年 PDF 离线副本？阅读和考试记录会保留，联网后可以重新下载。`))return
  try{await removePaperOffline(p);message.value='已删除 PDF 离线副本，可重新下载恢复。';await refresh()}catch(e){message.value=e instanceof Error?e.message:'删除失败'}
}
async function exportFile():Promise<void>{
  busy.value=true
  try{const data=await exportBackup(),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`408-study-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message.value='备份已导出。包含笔记、作答、考试和纠错，不包含 PDF。'}
  catch{message.value='导出失败，请检查本地存储。'}finally{busy.value=false}
}
async function chooseFile(event:Event):Promise<void>{
  const token=++fileReadToken;candidate.value=undefined;readingBackup.value=false;const file=(event.target as HTMLInputElement).files?.[0];if(!file)return
  readingBackup.value=true;message.value='正在读取并校验备份…'
  try{if(file.size>10_000_000)throw new Error('备份超过 10 MB');const parsed=parseBackup(await file.text());if(token!==fileReadToken)return;candidate.value=parsed;message.value='文件校验通过；请检查下方摘要后点击合并恢复。'}
  catch(e){if(token===fileReadToken)message.value=e instanceof Error?e.message:'无法读取备份'}finally{if(token===fileReadToken){readingBackup.value=false;(event.target as HTMLInputElement).value=''}}
}
async function restore():Promise<void>{
  if(!candidate.value || busy.value||readingBackup.value)return;const selected=candidate.value;busy.value=true
  try{const count=await importBackup(selected);await learning.reload();candidate.value=undefined;message.value=`已合并 ${count} 条较新记录，本机较新的记录没有被覆盖。`;await refresh()}
  catch(e){message.value=e instanceof Error?e.message:'恢复失败；事务已回滚'}finally{busy.value=false}
}
async function persist():Promise<void>{
  try{message.value=await navigator.storage?.persist()?'浏览器已允许持久存储；仍建议定期备份。':'浏览器未允许持久存储；清理网站数据仍可能删除记录，请定期导出。'}catch{message.value='此浏览器不支持持久存储申请。'}
}
async function copy(f:CorrectionFeedback):Promise<void>{
  try{await navigator.clipboard.writeText(`[${f.nodeId}] ${f.section}\n${f.message}`);message.value='纠错内容已复制，由你决定是否公开发送。'}catch{message.value='剪贴板不可用，请手动选取下方文字复制。'}
}
</script>
<template><main class="learning-page">
  <header class="learning-hero"><span class="section-kicker">LOCAL FIRST</span><h1>离线与备份</h1><p>知道哪些资料真正留在本机，也让复习记录有一份可带走的备份。</p></header>
  <p v-if="message" class="backup-summary" role="status">{{ message }}</p>
  <section class="content-card learning-panel"><h2>当前版本的离线清单</h2>
    <template v-if="inventory"><p>应用离线控制：<strong>{{ inventory.controlled?'Service Worker 已接管':'尚未接管；首次加载完成后刷新再检查' }}</strong></p><p>当前知识点资源缓存：<strong>{{ inventory.cachedNodes }} / {{ inventory.totalNodes }}</strong> · Dexie 阅读副本：{{ inventory.dbNodes }}</p><p>PDF 渲染模块：{{ inventory.cachedWorker?'已缓存':'未发现缓存，请先打开一份试卷并等待加载' }}</p><p v-if="inventory.storage">此站点已用 {{ mb(inventory.storage.usage??0) }} / 估算配额 {{ mb(inventory.storage.quota??0) }}</p></template>
    <p class="muted">知识点与应用资源由安装过程预缓存；大型 PDF 必须逐年下载。首次访问和更新需要能连到托管站点。缓存不能解决“别人首次访问连不上域名”，本机离线包则不依赖国外站点。</p>
    <div class="learning-toolbar"><button class="secondary-button" @click="refresh">重新检查</button><button class="secondary-button" @click="persist">申请持久存储</button></div>
  </section>
  <section class="content-card learning-panel"><h2>完整试卷离线下载</h2><p class="muted">原卷和解析均通过文件长度、PDF 签名和 SHA-256 校验后才算完成。下载失败不会把半份资料标成完整。</p>
    <div class="table-scroll"><table class="learning-table"><thead><tr><th>年份</th><th>大小</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="p in papers" :key="p.year"><td>{{ p.year }}</td><td>{{ mb(p.paper.bytes+p.solution.bytes) }}</td><td>{{ offlineYears.includes(p.year)?'已保存':downloading===p.year?'下载中…':'尚未完整缓存' }}</td><td><button class="secondary-button" :disabled="downloading!==undefined" @click="download(p)">{{ offlineYears.includes(p.year)?'重新校验下载':'下载原卷 + 解析' }}</button> <button v-if="offlineYears.includes(p.year)" class="secondary-button" :disabled="downloading!==undefined" @click="remove(p)">移除 PDF 副本</button></td></tr></tbody></table></div>
  </section>
  <section class="content-card learning-panel"><h2>复习数据备份</h2><p class="muted">备份包含个人笔记和考试记录，请只分享给可信的人。导入采用合并，不清空本机记录；相同记录只接收更新时间更晚的版本。PDF 文件不包含在 JSON 中。</p>
    <button class="primary-button" :disabled="busy" @click="exportFile">导出我的记录</button><label class="file-control">选择待恢复的 JSON <input type="file" accept="application/json,.json" :disabled="busy" @change="chooseFile" /></label>
    <div v-if="candidate" class="backup-summary"><p>备份时间：{{ new Date(candidate.exportedAt).toLocaleString() }}</p><p>{{ candidate.studyProgress.length }} 条进度 · {{ candidate.attempts.length }} 次作答 · {{ candidate.examSessions.length }} 次考试 · {{ candidate.feedback.length }} 条纠错</p><button class="primary-button" :disabled="busy || readingBackup" @click="restore">确认合并恢复</button> <button class="secondary-button" :disabled="busy" @click="cancelPreview">取消</button></div>
  </section>
  <section class="content-card learning-panel"><h2>我的纠错草稿</h2><p class="muted">这些内容只存在本机，没有自动提交。复制后可自行在 <a href="https://github.com/speaker-dot/408review/issues/new" target="_blank" rel="noopener noreferrer">GitHub 提交问题</a>，请勿包含隐私信息。</p><p v-if="!feedback.length">暂无纠错草稿。</p><article v-for="f in feedback" :key="f.id" class="feedback-row"><RouterLink :to="`/node/${f.nodeId}`">{{ f.nodeId }}</RouterLink> · {{ f.section }}<p>{{ f.message }}</p><button class="secondary-button" @click="copy(f)">复制纠错内容</button></article></section>
</main></template>

import { readFile,readdir,writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ds from './question-bank/ds.mjs'
import cs from './question-bank/cs.mjs'
import os from './question-bank/os.mjs'
import net from './question-bank/net.mjs'
const root=fileURLToPath(new URL('../src/content/',import.meta.url)),banks={ds,cs,os,net},rows=[]
for(const folder of Object.keys(banks))for(const file of (await readdir(path.join(root,folder))).filter(f=>f.endsWith('.json')).sort()){
  const target=path.join(root,folder,file),node=JSON.parse(await readFile(target,'utf8'));rows.push({folder,target,node})
}
const hash=rows=>createHash('sha256').update(JSON.stringify(rows.map(r=>[r.node.id,r.node.summary,r.node.details,r.node.study,r.node.traps]))).digest('hex'),before=hash(rows)
for(const {folder,node} of rows){
  const quizzes=banks[folder][node.id],leaf=!rows.some(r=>r.node.parentId===node.id)
  if(!Array.isArray(quizzes)||(leaf&&!quizzes.some(q=>q.type==='choice')))throw new Error(`题库遗漏：${node.id}`)
  for(const [i,q] of quizzes.entries()){
    if(q.id!==`${node.id}-Q${String(i+1).padStart(3,'0')}`||q.source.year||q.source.questionNo||q.source.adapted!==false)throw new Error(`题号或来源不合法：${q.id}`)
    if(/某同学在处理|最终数值相同，中间状态/.test(JSON.stringify(q)))throw new Error(`仍含万能模板：${q.id}`)
  }
  node.quizzes=quizzes
}
if(hash(rows)!==before)throw new Error('题库更新意外修改正文或易错点')
for(const {target,node} of rows)await writeFile(target,JSON.stringify(node,null,2)+'\n','utf8')
console.log(`QUESTIONS_OK nodes=${rows.length} quizzes=${rows.reduce((sum,r)=>sum+r.node.quizzes.length,0)} preservedContent=${before}`)

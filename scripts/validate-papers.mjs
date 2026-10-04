import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
const root=new URL('../',import.meta.url),index=JSON.parse(await readFile(new URL('src/content/papers/index.json',root),'utf8')),keys=JSON.parse(await readFile(new URL('src/content/papers/answer-keys.json',root),'utf8')).keys
const assert=(ok,why)=>{if(!ok)throw new Error(why)}
assert(keys.length===index.papers.length,'答案表年份覆盖不完整')
for(const key of keys){
  const p=index.papers.find(p=>p.year===key.year);assert(p,`未知年份${key.year}`)
  assert((key.choices.length===40||key.choices.length===0)&&key.choices.every(a=>/^[A-D]$/.test(a)),`${key.year}选择答案表格式错误`)
  assert(key.analysis.length===7&&key.analysis.every((q,i)=>q.questionNo===41+i&&Number.isInteger(q.maxScore)&&q.maxScore>0)&&key.analysis.reduce((sum,q)=>sum+q.maxScore,0)===70,`${key.year}综合题分值错误`)
  assert(key.solutionSha256===p.solution.sha256,`${key.year}答案表引用了不同版本PDF`)
  const numbers=key.choiceSections.flatMap(s=>Array.from({length:s.to-s.from+1},(_,i)=>s.from+i))
  assert(JSON.stringify(numbers)===JSON.stringify(Array.from({length:40},(_,i)=>i+1)),`${key.year}科目题号不是完整1–40分区`)
  for(const asset of [p.paper,p.solution]){
    const buffer=await readFile(new URL('public/'+asset.url,root));assert(buffer.length===asset.bytes&&buffer.subarray(0,5).toString()==='%PDF-'&&createHash('sha256').update(buffer).digest('hex')===asset.sha256.toLowerCase(),`${key.year} PDF校验失败：${asset.url}`)
  }
}
console.log(`PAPERS_OK years=${keys.length} verifiedChoices=${keys.reduce((sum,k)=>sum+k.choices.length,0)} analysisMaxima=${keys.reduce((sum,k)=>sum+k.analysis.length,0)} pdfs=${index.papers.length*2}`)

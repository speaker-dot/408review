import type { ExamPaper } from '@/types'

const PAPER_CACHE = 'exam-papers-v1'
const downloads = new Map<number, Promise<void>>()

/** 将索引中的相对路径转换为兼容 GitHub Pages 子目录的完整 URL。 */
export function paperAssetUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${base}/${path.replace(/^\//, '')}`
}

function paperUrls(paper: ExamPaper): string[] {
  return [
    paperAssetUrl(paper.paper.url),
    paperAssetUrl(paper.solution.url),
  ]
}

export async function isPaperAvailableOffline(
  paper: ExamPaper,
): Promise<boolean> {
  if (!('caches' in window)) return false

  const cache = await caches.open(PAPER_CACHE)
  const matches = await Promise.all(
    paperUrls(paper).map((url) => cache.match(url)),
  )
  const assets=[paper.paper,paper.solution],urls=paperUrls(paper)
  for(let i=0;i<matches.length;i++){
    const response=matches[i]
    if(!response)return false
    if(response.headers.get('X-408-Verified')===assets[i].sha256.toLowerCase())continue
    try{await cache.put(urls[i],await validatePaperResponse(response,assets[i]))}catch{return false}
  }
  return true
}

/**
 * 显式下载某一年的原卷和解析。
 * 逐个校验并写入缓存；只有两个文件都成功后，界面才显示“已离线”。
 */
export async function validatePaperResponse(response: Response, asset: ExamPaper['paper']): Promise<Response> {
  if (!response.ok) throw new Error(`资料下载失败（HTTP ${response.status}）`)
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength !== asset.bytes || new TextDecoder().decode(bytes.slice(0,5)) !== '%PDF-') throw new Error('下载文件不完整或不是 PDF，请重试。')
  if (!crypto.subtle) throw new Error('需要 HTTPS 或本机 localhost 才能验证资料完整性。')
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')
  if (hash !== asset.sha256.toLowerCase()) throw new Error('PDF 校验失败，请重新下载。')
  return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Length':String(bytes.byteLength),'X-408-Verified':hash}})
}
async function performDownload(
  paper: ExamPaper,
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
  if (!('caches' in window)) {
    throw new Error('当前浏览器不支持离线缓存')
  }

  const cache = await caches.open(PAPER_CACHE)
  const urls = paperUrls(paper)

  const responses:Response[]=[]
  const assets=[paper.paper,paper.solution]
  for (let index = 0; index < urls.length; index += 1) {
    const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),120_000)
    try { responses.push(await validatePaperResponse(await fetch(`${urls[index]}?v=${assets[index].sha256.toLowerCase()}`,{signal:controller.signal,cache:'reload'}),assets[index])) }
    catch(e){ if(controller.signal.aborted)throw new Error('下载超时，已有完整资料未受影响。');throw e }
    finally{clearTimeout(timeout)}
    onProgress?.(index + 1, urls.length)
  }
  // 两份均通过大小、签名、哈希校验后才发布。写入失败恢复之前的副本。
  const old=await Promise.all(urls.map(url=>cache.match(url)))
  try { for(let i=0;i<urls.length;i++)await cache.put(urls[i],responses[i]) }
  catch(e){const restored=await Promise.allSettled(urls.map((url,i)=>old[i]?cache.put(url,old[i]!):cache.delete(url)));if(restored.some(r=>r.status==='rejected'))throw new Error('缓存写入失败且恢复未完全完成；请重新检查离线清单并下载，学习记录未受影响。');throw e}
}
export function downloadPaperForOffline(paper:ExamPaper,onProgress?:(completed:number,total:number)=>void):Promise<void>{
  const running=downloads.get(paper.year)
  if(running)return running
  const task=performDownload(paper,onProgress).finally(()=>downloads.delete(paper.year));downloads.set(paper.year,task);return task
}

export async function removePaperOffline(paper: ExamPaper): Promise<void> {
  if(downloads.has(paper.year))throw new Error('该年份正在下载，请完成后再删除。')
  if (!('caches' in window)) return

  const cache = await caches.open(PAPER_CACHE)
  await Promise.all(paperUrls(paper).map((url) => cache.delete(url)))
}

import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest'
import { downloadPaperForOffline,isPaperAvailableOffline,validatePaperResponse,removePaperOffline } from '@/services/paperCache'
import type { ExamPaper } from '@/types'
const bytes=new TextEncoder().encode('%PDF-example'),buffer=bytes.buffer
let paper:ExamPaper
const items=new Map<string,Response>()
const cache={match:vi.fn(async(k:string)=>items.get(k)?.clone()),put:vi.fn(async(k:string,r:Response)=>{items.set(k,r.clone())}),delete:vi.fn(async(k:string)=>items.delete(k))}
beforeEach(async()=>{
  items.clear();const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(x=>x.toString(16).padStart(2,'0')).join('')
  const asset={label:'test',url:'papers/2024/paper.pdf',pages:1,bytes:bytes.length,sha256:hash};paper={year:2024,paper:asset,solution:{...asset,url:'papers/2024/solution.pdf'}} as ExamPaper
  vi.stubGlobal('caches',{open:vi.fn(async()=>cache)});vi.stubGlobal('fetch',vi.fn(async()=>new Response(bytes)))
})
afterEach(()=>{vi.restoreAllMocks();cache.match.mockClear();cache.put.mockClear();cache.delete.mockClear()})
describe('verified PDF caching',()=>{
  it('validates a real PDF header, length and hash',async()=>{const result=await validatePaperResponse(new Response(bytes),paper.paper);expect(result.headers.get('X-408-Verified')).toBe(paper.paper.sha256);expect(result.headers.get('Content-Type')).toBe('application/pdf')})
  it('rejects HTTP errors, HTML fallback, truncated data and wrong hashes',async()=>{
    await expect(validatePaperResponse(new Response('bad',{status:404}),paper.paper)).rejects.toThrow('404')
    await expect(validatePaperResponse(new Response('<html>'),paper.paper)).rejects.toThrow('不完整')
    await expect(validatePaperResponse(new Response('%PDF-examplf'),paper.paper)).rejects.toThrow('校验失败')
  })
  it('publishes neither PDF if one download is invalid',async()=>{
    vi.mocked(fetch).mockResolvedValueOnce(new Response(bytes)).mockResolvedValueOnce(new Response('invalid'))
    await expect(downloadPaperForOffline(paper)).rejects.toThrow();expect(items.size).toBe(0);expect(await isPaperAvailableOffline(paper)).toBe(false)
  })
  it('marks a complete pair offline only after validating both',async()=>{await downloadPaperForOffline(paper);expect(items.size).toBe(2);expect(await isPaperAvailableOffline(paper)).toBe(true);await removePaperOffline(paper);expect(await isPaperAvailableOffline(paper)).toBe(false)})
  it('repairs valid legacy entries but does not call corrupt legacy data offline',async()=>{
    items.set('/papers/2024/paper.pdf',new Response(bytes));items.set('/papers/2024/solution.pdf',new Response('bad'))
    expect(await isPaperAvailableOffline(paper)).toBe(false)
    items.set('/papers/2024/solution.pdf',new Response(bytes));expect(await isPaperAvailableOffline(paper)).toBe(true)
  })
  it('restores previous entries when publishing hits quota',async()=>{
    items.set('/papers/2024/paper.pdf',new Response('old paper'));items.set('/papers/2024/solution.pdf',new Response('old solution'))
    cache.put.mockImplementationOnce(async(k,r)=>{items.set(k,r.clone())}).mockRejectedValueOnce(new Error('quota'))
    await expect(downloadPaperForOffline(paper)).rejects.toThrow('quota');expect(await items.get('/papers/2024/paper.pdf')!.text()).toBe('old paper');expect(await items.get('/papers/2024/solution.pdf')!.text()).toBe('old solution')
  })
  it('deduplicates concurrent downloads and refuses removal during download',async()=>{
    let release!:(value:Response)=>void;vi.mocked(fetch).mockImplementationOnce(()=>new Promise(r=>release=r));const first=downloadPaperForOffline(paper),second=downloadPaperForOffline(paper)
    expect(first).toBe(second);await expect(removePaperOffline(paper)).rejects.toThrow('正在下载');await Promise.resolve();release(new Response(bytes));await first;expect(fetch).toHaveBeenCalledTimes(2)
  })
})

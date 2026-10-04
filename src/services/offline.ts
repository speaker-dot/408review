import { db } from '@/db/db'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/** URL 清单随构建更新，统计的正是本版本所需文件，而不是旧缓存总量。 */
export const nodeUrls=Object.values(import.meta.glob<string>('../content/{ds,os,cs,net}/*.json',{eager:true,query:'?url',import:'default'}))
export interface OfflineInventory { controlled:boolean; cachedNodes:number; totalNodes:number; dbNodes:number; cachedWorker:boolean; storage?:StorageEstimate }
export async function inspectOffline():Promise<OfflineInventory>{
  const hasCaches=typeof caches!=='undefined'
  const found=hasCaches?await Promise.all(nodeUrls.map(url=>caches.match(url))):[]
  let cachedWorker=false
  if(hasCaches)cachedWorker=!!await caches.match(workerUrl)
  return {controlled:!!navigator.serviceWorker?.controller,cachedNodes:found.filter(Boolean).length,totalNodes:nodeUrls.length,dbNodes:await db.nodes.count(),cachedWorker,storage:await navigator.storage?.estimate()}
}

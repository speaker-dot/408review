import { lstat,mkdir,realpath,rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/** Windows 上既有构建未被清理时，会把旧哈希资源一起纳入预缓存。
 * 只处理本项目的生成目录 dist，并保留可恢复副本，不删除源文件。
 */
const root=await realpath(fileURLToPath(new URL('..',import.meta.url)))
const dist=path.resolve(root,'dist'),history=path.resolve(root,'.qa','build-history')
if(path.dirname(dist)!==root || !history.startsWith(root+path.sep))throw new Error('构建路径越界')
let info
try{info=await lstat(dist)}catch(e){if(e.code!=='ENOENT')throw e}
if(info){
  if(info.isSymbolicLink()||!info.isDirectory()||await realpath(dist)!==dist)throw new Error('dist 必须是本项目真实生成目录，不能是链接')
  await mkdir(history,{recursive:true})
  const target=path.join(history,new Date().toISOString().replace(/[:.]/g,'-'))
  if(path.dirname(target)!==history)throw new Error('备份路径越界')
  await rename(dist,target)
  console.log('旧构建已保留在 '+target+'；开始生成干净的新版本。')
}

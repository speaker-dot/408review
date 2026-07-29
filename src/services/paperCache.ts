import type { ExamPaper } from '@/types'

const PAPER_CACHE = 'exam-papers-v1'

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
  return matches.every(Boolean)
}

/**
 * 显式下载某一年的原卷和解析。
 * 逐个校验并写入缓存；只有两个文件都成功后，界面才显示“已离线”。
 */
export async function downloadPaperForOffline(
  paper: ExamPaper,
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
  if (!('caches' in window)) {
    throw new Error('当前浏览器不支持离线缓存')
  }

  const cache = await caches.open(PAPER_CACHE)
  const urls = paperUrls(paper)

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index]
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`资料下载失败（HTTP ${response.status}）`)
    }
    await cache.put(url, response.clone())
    onProgress?.(index + 1, urls.length)
  }
}

export async function removePaperOffline(paper: ExamPaper): Promise<void> {
  if (!('caches' in window)) return

  const cache = await caches.open(PAPER_CACHE)
  await Promise.all(paperUrls(paper).map((url) => cache.delete(url)))
}

import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const distRoot = path.resolve(projectRoot, 'dist')
const hostname = '127.0.0.1'
const port = Number.parseInt(process.env.PORT ?? '4173', 10)

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.pdf': 'application/pdf',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

if (!existsSync(path.join(distRoot, 'index.html'))) {
  console.error('没有找到 dist/index.html，请先执行 npm run build。')
  process.exit(1)
}

function resolveRequestPath(url = '/') {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname)
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const candidate = path.resolve(distRoot, relativePath)

  // 防止请求通过 ../ 跳出 dist 目录。
  if (candidate !== distRoot && !candidate.startsWith(`${distRoot}${path.sep}`)) {
    return null
  }
  return candidate
}

const server = createServer(async (request, response) => {
  let target
  try { target = resolveRequestPath(request.url) } catch { response.writeHead(400); response.end('Bad Request'); return }
  if (!target) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }

  try {
    const info = await stat(target)
    if (info.isDirectory()) target = path.join(target, 'index.html')
  } catch {
    // Hash 路由无需回退。丢失 worker/PDF 不能返回 HTML 假装成功。
    response.writeHead(404); response.end('Not Found'); return
  }

  const extension = path.extname(target).toLowerCase()
  response.writeHead(200, {
    'Content-Type': mimeTypes[extension] ?? 'application/octet-stream',
    'Cache-Control': /-[\w-]{8,}\./.test(path.basename(target)) ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  })
  createReadStream(target).on('error', () => response.destroy()).pipe(response)
})

server.listen(port, hostname, () => {
  console.log('408 MindMap 离线服务已启动：')
  console.log(`http://${hostname}:${port}/`)
  console.log('保持此窗口开启；按 Ctrl+C 可停止服务。')
})

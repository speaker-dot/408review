import { readFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * 本地和自有域名默认部署在根路径；GitHub Pages 构建时可通过
 * VITE_BASE_PATH=/仓库名/ 注入子路径，避免资源与 Service Worker 404。
 */
function normalizeBase(value: string | undefined): string {
  if (!value || value === '/') return '/'
  return `/${value.replace(/^\/+|\/+$/g, '')}/`
}

const base = normalizeBase(process.env.VITE_BASE_PATH)

/**
 * `src` 下未被代码直接导入的文件默认不会出现在 Vite 的构建产物中。
 * 导图索引需要在运行时通过固定 URL 读取，因此这里显式把它输出到 dist，
 * 同时保留 `/src/content/index.json` 这一约定路径。
 */
function emitContentIndex(): Plugin {
  const indexPath = fileURLToPath(
    new URL('./src/content/index.json', import.meta.url),
  )

  return {
    name: 'emit-content-index',
    apply: 'build',
    async buildStart() {
      this.emitFile({
        type: 'asset',
        fileName: 'src/content/index.json',
        source: await readFile(indexPath),
      })
    },
  }
}

export default defineConfig({
  base,
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  build: { emptyOutDir: true },
  plugins: [
    vue(),
    emitContentIndex(),
    VitePWA({
      base,
      scope: base,
      // 由 App.vue 监听新版本并触发接管、刷新，避免旧页面长期驻留。
      registerType: 'prompt',
      injectRegister: 'auto',
      manifest: {
        name: '408 MindMap PWA',
        short_name: '408 MindMap',
        description: '基于知识图谱导航的 408 考研离线学习工具',
        lang: 'zh-CN',
        theme_color: '#294d4c',
        background_color: '#f7f7f2',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // 预缓存应用外壳、构建后的静态资源，以及 emitContentIndex 输出的索引。
        globPatterns: [
          // PDF.js 的 Worker 由 Vite 输出为 `.mjs`。必须纳入预缓存，
          // 否则断网时主页面虽然能打开，PDF 渲染仍会因 Worker 请求失败。
          '**/*.{js,mjs,css,html,ico,png,svg,webp,woff,woff2,json}',
        ],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        clientsClaim: true,
        skipWaiting: false,
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            // 开发约定路径以及构建后可能生成的 JSON asset 都采用同一策略。
            urlPattern: /\/(?:src\/content|assets)\/.*\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'knowledge-content-v2',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // 真题 PDF 体积较大，不加入首次预缓存；阅读或主动下载后按年缓存。
            urlPattern: /\/papers\/\d{4}\/(?:paper|solution)\.pdf$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'exam-papers-v1',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        // 开发阶段也启用 Service Worker，便于验证断网行为。
        enabled: true,
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})

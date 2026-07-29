<script setup lang="ts">
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'

GlobalWorkerOptions.workerSrc = workerUrl

const props = withDefaults(
  defineProps<{
    src: string
    title: string
    modelValue?: number
  }>(),
  {
    modelValue: 1,
  },
)

const emit = defineEmits<{
  'update:modelValue': [page: number]
  loaded: [pages: number]
}>()

const viewportElement = ref<HTMLDivElement | null>(null)
const canvasElement = ref<HTMLCanvasElement | null>(null)
const totalPages = ref(0)
const pageInput = ref(props.modelValue)
const zoom = ref(1)
const loading = ref(true)
const progress = ref(0)
const errorMessage = ref('')

let pdfDocument: PDFDocumentProxy | undefined
let loadingTask: PDFDocumentLoadingTask | undefined
let renderTask: RenderTask | undefined
let resizeObserver: ResizeObserver | undefined
let resizeFrame = 0
let lastViewportWidth = 0
let renderRequestId = 0

const page = computed(() =>
  Math.min(Math.max(1, props.modelValue), Math.max(1, totalPages.value)),
)

function setPage(nextPage: number): void {
  const bounded = Math.min(
    Math.max(1, Math.round(nextPage)),
    Math.max(1, totalPages.value),
  )
  pageInput.value = bounded
  emit('update:modelValue', bounded)
}

function commitPageInput(): void {
  setPage(Number(pageInput.value) || 1)
}

async function renderCurrentPage(): Promise<void> {
  const requestId = ++renderRequestId
  const viewportHost = viewportElement.value
  const canvas = canvasElement.value
  if (!pdfDocument || !viewportHost || !canvas) return

  // PDF.js 不允许同一个 canvas 同时执行两个 render()。
  // 页码恢复、窗口缩放和模式切换可能在同一帧触发多次渲染，
  // 因此先取消并等待旧任务真正结束，再处理最后一次请求。
  if (renderTask) {
    renderTask.cancel()
    try {
      await renderTask.promise
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'RenderingCancelledException') {
        throw error
      }
    }
  }
  if (requestId !== renderRequestId || !pdfDocument) return

  const pdfPage = await pdfDocument.getPage(page.value)
  if (requestId !== renderRequestId) return
  const baseViewport = pdfPage.getViewport({ scale: 1 })
  const availableWidth = Math.max(280, viewportHost.clientWidth - 40)
  const fitScale = availableWidth / baseViewport.width
  const viewport = pdfPage.getViewport({
    scale: Math.min(2.4, fitScale * zoom.value),
  })
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const context = canvas.getContext('2d')
  if (!context) return

  canvas.width = Math.floor(viewport.width * pixelRatio)
  canvas.height = Math.floor(viewport.height * pixelRatio)
  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`

  const currentRenderTask = pdfPage.render({
    canvasContext: context,
    viewport,
    transform:
      pixelRatio === 1
        ? undefined
        : [pixelRatio, 0, 0, pixelRatio, 0, 0],
  })
  renderTask = currentRenderTask

  try {
    await currentRenderTask.promise
  } catch (error) {
    if (error instanceof Error && error.name === 'RenderingCancelledException') {
      return
    }
    throw error
  } finally {
    if (renderTask === currentRenderTask) renderTask = undefined
  }
}

async function loadDocument(): Promise<void> {
  ++renderRequestId
  loading.value = true
  progress.value = 0
  errorMessage.value = ''
  renderTask?.cancel()
  await loadingTask?.destroy()
  await pdfDocument?.destroy()
  pdfDocument = undefined

  try {
    loadingTask = getDocument({ url: props.src })
    loadingTask.onProgress = ({
      loaded,
      total,
    }: {
      loaded: number
      total?: number
    }) => {
      progress.value = total ? Math.round((loaded / total) * 100) : 0
    }
    pdfDocument = await loadingTask.promise
    totalPages.value = pdfDocument.numPages
    emit('loaded', pdfDocument.numPages)
    setPage(props.modelValue)
    loading.value = false
    await nextTick()
    await renderCurrentPage()
  } catch (error) {
    loading.value = false
    errorMessage.value =
      error instanceof Error ? error.message : 'PDF 加载失败，请稍后重试'
  }
}

function updateZoom(delta: number): void {
  zoom.value = Math.min(1.8, Math.max(0.7, zoom.value + delta))
}

onMounted(() => {
  void loadDocument()

  resizeObserver = new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width)
    if (!width || width === lastViewportWidth) return
    lastViewportWidth = width
    window.cancelAnimationFrame(resizeFrame)
    resizeFrame = window.requestAnimationFrame(() => {
      void renderCurrentPage()
    })
  })
  if (viewportElement.value) resizeObserver.observe(viewportElement.value)
})

watch(
  () => props.src,
  () => void loadDocument(),
)

watch(page, (nextPage) => {
  pageInput.value = nextPage
  void renderCurrentPage()
})

watch(zoom, () => void renderCurrentPage())

onBeforeUnmount(() => {
  window.cancelAnimationFrame(resizeFrame)
  resizeObserver?.disconnect()
  renderTask?.cancel()
  void loadingTask?.destroy()
  void pdfDocument?.destroy()
})
</script>

<template>
  <section class="pdf-reader" :aria-label="title">
    <header class="pdf-toolbar">
      <div class="pdf-title">
        <span class="pdf-dot" aria-hidden="true" />
        <strong>{{ title }}</strong>
      </div>

      <div class="pdf-controls">
        <button
          type="button"
          aria-label="上一页"
          :disabled="page <= 1"
          @click="setPage(page - 1)"
        >
          ←
        </button>
        <label>
          <span class="sr-only">当前页码</span>
          <input
            v-model.number="pageInput"
            type="number"
            min="1"
            :max="totalPages || 1"
            @change="commitPageInput"
          />
          <small>/ {{ totalPages || '—' }}</small>
        </label>
        <button
          type="button"
          aria-label="下一页"
          :disabled="page >= totalPages"
          @click="setPage(page + 1)"
        >
          →
        </button>
        <span class="toolbar-divider" />
        <button
          type="button"
          aria-label="缩小"
          :disabled="zoom <= 0.7"
          @click="updateZoom(-0.1)"
        >
          −
        </button>
        <small class="zoom-label">{{ Math.round(zoom * 100) }}%</small>
        <button
          type="button"
          aria-label="放大"
          :disabled="zoom >= 1.8"
          @click="updateZoom(0.1)"
        >
          +
        </button>
        <a :href="src" target="_blank" rel="noopener" title="在新窗口打开">
          ↗
        </a>
      </div>
    </header>

    <div ref="viewportElement" class="pdf-viewport">
      <div v-if="loading" class="pdf-state">
        <span class="pdf-loader" />
        <strong>正在加载 PDF</strong>
        <small>{{ progress ? `${progress}%` : '正在读取文件…' }}</small>
      </div>

      <div v-else-if="errorMessage" class="pdf-state is-error">
        <strong>无法显示 PDF</strong>
        <small>{{ errorMessage }}</small>
        <a :href="src" target="_blank" rel="noopener">直接打开文件</a>
      </div>

      <canvas
        v-show="!loading && !errorMessage"
        ref="canvasElement"
        class="pdf-canvas"
      />
    </div>
  </section>
</template>

<style scoped>
.pdf-reader {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #dfe5ee;
  border-radius: 1.15rem;
  background: #e8ecf1;
  box-shadow: 0 1rem 3rem rgba(30, 41, 59, 0.09);
}

.pdf-toolbar {
  position: relative;
  z-index: 2;
  display: flex;
  min-height: 3.8rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 0.8rem 0.7rem 1rem;
  border-bottom: 1px solid #dfe5ee;
  background: rgba(255, 255, 255, 0.96);
}

.pdf-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.55rem;
}

.pdf-title strong {
  overflow: hidden;
  color: #263247;
  font-size: 0.78rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pdf-dot {
  width: 0.5rem;
  height: 0.5rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #e7562c;
  box-shadow: 0 0 0 0.25rem rgba(231, 86, 44, 0.12);
}

.pdf-controls {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.28rem;
}

.pdf-controls button,
.pdf-controls > a {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border: 1px solid #dde3ec;
  border-radius: 0.52rem;
  background: #fff;
  color: #42516a;
  text-decoration: none;
  cursor: pointer;
}

.pdf-controls button:hover:not(:disabled),
.pdf-controls > a:hover {
  border-color: #94a9e3;
  color: #2746aa;
}

.pdf-controls button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.pdf-controls label {
  display: flex;
  align-items: center;
  gap: 0.28rem;
  padding: 0 0.4rem;
  color: #68758a;
  font-size: 0.72rem;
}

.pdf-controls input {
  width: 2.8rem;
  padding: 0.38rem 0.2rem;
  border: 1px solid #dde3ec;
  border-radius: 0.45rem;
  background: #f8fafc;
  color: #1f2a3d;
  text-align: center;
}

.toolbar-divider {
  width: 1px;
  height: 1.25rem;
  margin: 0 0.12rem;
  background: #dce2ea;
}

.zoom-label {
  min-width: 2.6rem;
  color: #68758a;
  font-size: 0.68rem;
  text-align: center;
}

.pdf-viewport {
  display: grid;
  height: min(72vh, 52rem);
  min-height: 38rem;
  overflow: auto;
  align-items: start;
  justify-items: center;
  padding: 1.2rem;
  background:
    radial-gradient(circle at 50% 0, rgba(255, 255, 255, 0.6), transparent 40%),
    #e8ecf1;
}

.pdf-canvas {
  display: block;
  max-width: none;
  background: #fff;
  box-shadow: 0 0.8rem 2.2rem rgba(15, 23, 42, 0.16);
}

.pdf-state {
  display: grid;
  min-height: 30rem;
  place-content: center;
  justify-items: center;
  gap: 0.7rem;
  color: #445168;
  text-align: center;
}

.pdf-state small {
  max-width: 24rem;
  color: #7a8699;
}

.pdf-state a {
  color: #3157d5;
  font-weight: 700;
}

.pdf-loader {
  width: 2rem;
  height: 2rem;
  border: 3px solid #cbd5e1;
  border-top-color: #3157d5;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.is-error {
  color: #a53f2b;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .pdf-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .pdf-controls {
    width: 100%;
    overflow-x: auto;
  }

  .pdf-viewport {
    min-height: 32rem;
    padding: 0.65rem;
  }
}
</style>

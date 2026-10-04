import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import NodeView from '@/views/NodeView.vue'
import type { KnowledgeNode } from '@/types'

const mocks = vi.hoisted(() => ({
  getNode: vi.fn(), saveNode: vi.fn(), visit: vi.fn(),
}))
vi.mock('@/db/db', () => ({ getNode: mocks.getNode, saveNode: mocks.saveNode }))
vi.mock('@/stores/learning', () => ({ useLearningStore: () => ({ visit: mocks.visit }) }))
vi.mock('@/components/KnowledgeCard.vue', () => ({
  default: {
    name: 'KnowledgeCard', props: ['node'],
    template: '<article data-test="knowledge-card">{{ node.id }} | {{ node.details }}</article>',
  },
}))

const A = 'CS-03-03-001'
const B = 'CS-03-03-002'
function node(id = A, details = 'current static content'): KnowledgeNode {
  return { id, name: id, category: 'CS', parentId: 'CS-03-03', difficulty: 3,
    summary: 'summary', details, traps: [], quizzes: [] }
}
function response(content: KnowledgeNode, status = 200, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(content), { status, headers: { 'Content-Type': contentType } })
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const mounted: VueWrapper[] = []
async function screen(id = A) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/node/:id', component: NodeView },
    { path: '/', component: { template: '<p>home</p>' } },
  ] })
  await router.push(`/node/${encodeURIComponent(id)}`)
  await router.isReady()
  const wrapper = mount(NodeView, { global: { plugins: [router] } })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  mocks.getNode.mockReset().mockResolvedValue(undefined)
  mocks.saveNode.mockReset().mockResolvedValue(A)
  mocks.visit.mockReset().mockResolvedValue(undefined)
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unavailable'))
})
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  vi.restoreAllMocks()
})

describe('node view current-route loading', () => {
  it('uses current static JSON online rather than returning a stale DB copy', async () => {
    mocks.getNode.mockResolvedValue(node(A, 'old DB copy'))
    vi.mocked(fetch).mockResolvedValue(response(node(A, 'fresh static content')))
    const { wrapper } = await screen()
    expect(wrapper.get('[data-test="knowledge-card"]').text()).toContain('fresh static content')
    expect(wrapper.text()).not.toContain('old DB copy')
    expect(mocks.saveNode).toHaveBeenCalledWith(node(A, 'fresh static content'))
    expect(mocks.visit).toHaveBeenCalledWith(A)
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(`${A}.json`)
  })

  it('keeps reading current static JSON when the IndexedDB read is unavailable', async () => {
    mocks.getNode.mockRejectedValue(new Error('IDB disabled'))
    vi.mocked(fetch).mockResolvedValue(response(node()))
    const { wrapper } = await screen()
    expect(wrapper.get('[data-test="knowledge-card"]').text()).toContain('current static content')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(mocks.saveNode).toHaveBeenCalledOnce()
  })

  it('keeps the newer content when saving it fails, without downgrading to the cached copy', async () => {
    mocks.getNode.mockResolvedValue(node(A, 'stale explanation'))
    mocks.saveNode.mockRejectedValue(new Error('storage quota exceeded'))
    vi.mocked(fetch).mockResolvedValue(response(node(A, 'new explanation')))
    const { wrapper } = await screen()
    expect(wrapper.get('[data-test="knowledge-card"]').text()).toContain('new explanation')
    expect(wrapper.text()).not.toContain('stale explanation')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('does not make reading depend on storing learning evidence', async () => {
    mocks.visit.mockRejectedValue(new Error('learning storage disabled'))
    vi.mocked(fetch).mockResolvedValue(response(node()))
    const { wrapper } = await screen()
    expect(wrapper.get('[data-test="knowledge-card"]').text()).toContain(A)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('falls back to the node DB copy when offline static-resource fetching fails', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    mocks.getNode.mockResolvedValue(node(A, 'cached offline explanation'))
    const { wrapper } = await screen()
    expect(wrapper.get('[data-test="knowledge-card"]').text()).toContain('cached offline explanation')
    expect(mocks.saveNode).not.toHaveBeenCalled()
    expect(mocks.visit).toHaveBeenCalledWith(A)
  })

  it('still prefers the current precached static JSON even if navigator reports offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    mocks.getNode.mockResolvedValue(node(A, 'old database content'))
    vi.mocked(fetch).mockResolvedValue(response(node(A, 'current service-worker response')))
    const { wrapper } = await screen()
    expect(wrapper.get('[data-test="knowledge-card"]').text()).toContain('current service-worker response')
    expect(wrapper.text()).not.toContain('old database content')
  })

  it('reports a network error if neither static JSON nor a cached node is available', async () => {
    const { wrapper } = await screen()
    expect(wrapper.get('[role="alert"]').text()).toContain('network unavailable')
    expect(wrapper.find('[data-test="knowledge-card"]').exists()).toBe(false)
    expect(mocks.visit).not.toHaveBeenCalled()
  })

  it.each([
    [() => response(node(), 404), 'HTTP 404'],
    [() => response(node(), 200, 'text/html'), '返回格式不正确'],
    [() => response(node(B)), '当前路由不匹配'],
    [() => response({ ...node(), category: 'DS' }), '当前路由不匹配'],
  ])('does not display an invalid static response %#', async (makeResponse, error) => {
    vi.mocked(fetch).mockResolvedValue(makeResponse())
    const { wrapper } = await screen()
    expect(wrapper.get('[role="alert"]').text()).toContain(error)
    expect(wrapper.find('[data-test="knowledge-card"]').exists()).toBe(false)
    expect(mocks.saveNode).not.toHaveBeenCalled()
  })

  it('rejects malformed IDs before constructing a resource URL or reading the DB', async () => {
    const { wrapper } = await screen('CS-../../private')
    expect(wrapper.get('[role="alert"]').text()).toContain('ID 格式不正确')
    expect(mocks.getNode).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows an invalid-ID error even if the previous valid route was still loading', async () => {
    const pending = deferred<Response>()
    vi.mocked(fetch).mockReturnValue(pending.promise)
    const { wrapper, router } = await screen()
    expect(wrapper.text()).toContain('正在加载')
    await router.push('/node/not-a-node')
    await flushPromises()
    pending.reject(new DOMException('navigation abort', 'AbortError'))
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('ID 格式不正确')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('a late abort of the old fetch cannot replace the new route with an old cached node', async () => {
    const oldFetch = deferred<Response>()
    mocks.getNode.mockImplementation((id: string) => Promise.resolve(id === A ? node(A, 'old fallback') : undefined))
    vi.mocked(fetch).mockReturnValueOnce(oldFetch.promise).mockResolvedValueOnce(response(node(B, 'new route content')))
    const { wrapper, router } = await screen()
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal as AbortSignal
    await router.push(`/node/${B}`)
    await flushPromises()
    expect(signal.aborted).toBe(true)
    expect(wrapper.get('[data-test="knowledge-card"]').text()).toContain(B)
    oldFetch.reject(new DOMException('old request aborted', 'AbortError'))
    await flushPromises()
    expect(wrapper.get('[data-test="knowledge-card"]').text()).toContain('new route content')
    expect(wrapper.text()).not.toContain('old fallback')
    expect(mocks.visit).not.toHaveBeenCalledWith(A)
  })

  it('a late old DB read is discarded before fetching its old static resource', async () => {
    const oldRead = deferred<KnowledgeNode | undefined>()
    mocks.getNode.mockImplementation((id: string) => id === A ? oldRead.promise : Promise.resolve(undefined))
    vi.mocked(fetch).mockResolvedValue(response(node(B, 'new route content')))
    const { wrapper, router } = await screen()
    await router.push(`/node/${B}`)
    await flushPromises()
    oldRead.resolve(node(A, 'late cache result'))
    await flushPromises()
    expect(wrapper.get('[data-test="knowledge-card"]').text()).toContain('new route content')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(`${B}.json`)
  })

  it('a late old cache write cannot publish its node after switching to another route', async () => {
    const oldWrite = deferred<string>()
    mocks.saveNode.mockImplementation((record: KnowledgeNode) => record.id === A ? oldWrite.promise : Promise.resolve(B))
    vi.mocked(fetch).mockResolvedValueOnce(response(node(A, 'old remote content'))).mockResolvedValueOnce(response(node(B, 'new route content')))
    const { wrapper, router } = await screen()
    expect(mocks.saveNode).toHaveBeenCalledWith(node(A, 'old remote content'))
    await router.push(`/node/${B}`)
    await flushPromises()
    oldWrite.resolve(A)
    await flushPromises()
    expect(wrapper.get('[data-test="knowledge-card"]').text()).toContain('new route content')
    expect(mocks.visit).not.toHaveBeenCalledWith(A)
  })

  it('unmount aborts an outstanding request without publishing a stale node', async () => {
    const pending = deferred<Response>()
    vi.mocked(fetch).mockReturnValueOnce(pending.promise)
    const { wrapper } = await screen()
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal as AbortSignal
    wrapper.unmount()
    mounted.splice(mounted.indexOf(wrapper), 1)
    expect(signal.aborted).toBe(true)
    pending.reject(new DOMException('component unmounted', 'AbortError'))
    await flushPromises()
    expect(mocks.visit).not.toHaveBeenCalled()
  })
})

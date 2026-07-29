<script setup lang="ts">
import { TreeChart, type TreeSeriesOption } from 'echarts/charts'
import {
  TooltipComponent,
  type TooltipComponentOption,
} from 'echarts/components'
import { init, use, type ComposeOption, type EChartsType } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { MindMapLink, MindMapNode } from '@/types'

// 使用树图而不是力导向图，确保知识层级始终稳定地从左向右展开。
// 所有依赖均随应用打包，离线访问时不需要加载 CDN。
use([TreeChart, TooltipComponent, CanvasRenderer])

type MindMapOption = ComposeOption<TreeSeriesOption | TooltipComponentOption>

interface MindMapTreeNode {
  id: string
  name: string
  value: string
  children?: MindMapTreeNode[]
  symbol: 'circle' | 'roundRect'
  symbolSize: number | number[]
  cursor: 'pointer'
  itemStyle: {
    color: string
    borderColor: string
    borderWidth: number
    shadowBlur: number
    shadowColor: string
  }
  label: {
    show: boolean
    formatter: string
    color: string
    fontSize: number
    fontWeight: number
    lineHeight: number
    padding: number[]
    backgroundColor: string
    borderRadius: number
    borderColor: string
    borderWidth: number
    shadowBlur: number
    shadowColor: string
    position: 'inside' | 'right'
    align: 'center' | 'left'
    verticalAlign: 'middle'
    distance: number
  }
}

const props = defineProps<{
  nodes: MindMapNode[]
  links: MindMapLink[]
}>()

const emit = defineEmits<{
  /** 只向父组件暴露稳定的业务 ID，不泄漏 ECharts 点击事件对象。 */
  'node-click': [nodeId: string]
}>()

const viewportElement = ref<HTMLDivElement | null>(null)
const chartElement = ref<HTMLDivElement | null>(null)
const chartWidth = ref(1200)
const overviewMode = ref(false)
const expandedMode = ref(false)
let chart: EChartsType | undefined
let resizeObserver: ResizeObserver | undefined
let resizeFrame = 0
let lastChartSize = { width: 0, height: 0 }
let lastNodeClick = { id: '', time: 0 }

const subjectColors: Record<string, string> = {
  DS: '#2563eb',
  CS: '#7c3aed',
  OS: '#059669',
  NET: '#ea580c',
}

/** 根据 ID 前缀确定节点主题色，同时保留一个可预测的兜底色。 */
function getNodeColor(id: string): string {
  const subject = Object.keys(subjectColors).find((key) => id.startsWith(key))
  return subject ? subjectColors[subject] : '#64748b'
}

const activeColor = computed(() =>
  getNodeColor(props.nodes[0]?.id ?? 'DS'),
)

function emitNodeClick(nodeId: string): void {
  const now = Date.now()
  if (lastNodeClick.id === nodeId && now - lastNodeClick.time < 300) return
  lastNodeClick = { id: nodeId, time: now }
  emit('node-click', nodeId)
}

/**
 * 标题最多展示两行，防止较长的考点名称侵占相邻节点。
 * 完整标题仍会显示在 tooltip 中，因此这里的省略不会丢失信息。
 */
function wrapLabel(name: string, depth: number): string {
  const charactersPerLine = depth <= 1 ? 11 : depth === 2 ? 14 : 16
  if (name.length <= charactersPerLine) return name

  const firstLine = name.slice(0, charactersPerLine)
  const remaining = name.slice(charactersPerLine)
  if (remaining.length <= charactersPerLine) return `${firstLine}\n${remaining}`

  return `${firstLine}\n${remaining.slice(0, charactersPerLine - 1)}…`
}

function nodeSymbol(depth: number): {
  symbol: 'circle' | 'roundRect'
  symbolSize: number | number[]
} {
  if (depth === 0) return { symbol: 'roundRect', symbolSize: [150, 52] }
  if (depth === 1) return { symbol: 'roundRect', symbolSize: [154, 44] }
  if (depth === 2) return { symbol: 'circle', symbolSize: 14 }
  return { symbol: 'circle', symbolSize: 9 }
}

/**
 * 把扁平 nodes/links 转成 TreeChart 所需的嵌套数据。
 * 优先使用 node.parentId；links 作为兼容旧索引或外部数据的后备关系。
 */
const treeData = computed<MindMapTreeNode[]>(() => {
  const nodeById = new Map(props.nodes.map((node) => [node.id, node]))
  const parentFromLinks = new Map(
    props.links.map((link) => [link.target, link.source]),
  )
  const childrenByParent = new Map<string, MindMapNode[]>()
  const roots: MindMapNode[] = []

  for (const node of props.nodes) {
    const parentId = node.parentId ?? parentFromLinks.get(node.id)
    if (!parentId || !nodeById.has(parentId)) {
      roots.push(node)
      continue
    }

    const siblings = childrenByParent.get(parentId) ?? []
    siblings.push(node)
    childrenByParent.set(parentId, siblings)
  }

  function buildNode(node: MindMapNode, depth: number): MindMapTreeNode {
    const children = childrenByParent.get(node.id) ?? []
    const baseColor = getNodeColor(node.id)
    const cardNode = depth <= 1
    const visual = nodeSymbol(depth)

    return {
      id: node.id,
      name: node.name,
      value: node.id,
      symbol: visual.symbol,
      symbolSize: visual.symbolSize,
      cursor: 'pointer',
      itemStyle: {
        color: cardNode || depth === 2 ? baseColor : '#ffffff',
        borderColor: baseColor,
        borderWidth: cardNode ? 0 : 2,
        shadowBlur: cardNode ? 14 : 0,
        shadowColor: `${baseColor}35`,
      },
      label: {
        show: !overviewMode.value || depth <= 2,
        formatter: wrapLabel(node.name, depth),
        color: cardNode ? '#ffffff' : depth === 2 ? '#24324a' : '#475569',
        fontSize: depth === 0 ? 15 : depth === 1 ? 13 : 12,
        fontWeight: depth <= 1 ? 700 : 500,
        lineHeight: depth <= 1 ? 18 : 17,
        padding: cardNode ? [0, 0] : [5, 8],
        backgroundColor: cardNode ? 'transparent' : 'rgba(255, 255, 255, 0.96)',
        borderRadius: cardNode ? 0 : 7,
        borderColor: cardNode ? 'transparent' : `${baseColor}24`,
        borderWidth: cardNode ? 0 : 1,
        shadowBlur: cardNode ? 0 : 6,
        shadowColor: 'rgba(15, 23, 42, 0.07)',
        position: cardNode ? 'inside' : 'right',
        align: cardNode ? 'center' : 'left',
        verticalAlign: 'middle',
        distance: cardNode ? 0 : 8,
      },
      ...(children.length
        ? { children: children.map((child) => buildNode(child, depth + 1)) }
        : {}),
    }
  }

  return roots.map((root) => buildNode(root, 0))
})

function countLeaves(nodes: MindMapTreeNode[]): number {
  return nodes.reduce(
    (total, node) =>
      total +
      (node.children?.length ? countLeaves(node.children) : 1),
    0,
  )
}

// 阅读模式为每个叶子保留充足行距；概览模式隐藏叶子文字并将全图压进一屏。
const chartHeight = computed(() =>
  overviewMode.value
    ? 720
    : Math.max(760, countLeaves(treeData.value) * 58 + 160),
)

const chartStyle = computed(() => ({
  height: `${chartHeight.value}px`,
}))

const viewportStyle = computed(() => {
  if (overviewMode.value) return { height: '45rem' }
  if (expandedMode.value) return { height: `${chartHeight.value}px` }
  return undefined
})

const option = computed<MindMapOption>(() => ({
  tooltip: {
    trigger: 'item',
    confine: true,
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderWidth: 0,
    textStyle: {
      color: '#ffffff',
      fontSize: 13,
    },
    formatter: (params) => {
      if (Array.isArray(params)) return ''
      const data = params.data as MindMapTreeNode
      return `<strong>${data.name}</strong><br/><span style="opacity:.72">${data.id}</span>`
    },
  },
  series: [
    {
      type: 'tree',
      data: treeData.value,
      orient: 'LR',
      top: overviewMode.value ? 34 : 80,
      left: overviewMode.value ? 90 : 105,
      bottom: overviewMode.value ? 34 : 80,
      right: overviewMode.value ? 120 : 250,
      symbol: 'circle',
      edgeShape: 'curve',
      expandAndCollapse: false,
      initialTreeDepth: -1,
      // 概览本身已经完整适配视窗。关闭自由漫游可以避免滚轮、拖拽与
      // ResizeObserver 同时修改画布状态，并确保原生点击层始终和节点重合。
      roam: false,
      scaleLimit: {
        min: 0.65,
        max: 2.5,
      },
      animationDuration: overviewMode.value ? 0 : 420,
      animationDurationUpdate: overviewMode.value ? 0 : 320,
      label: {
        show: true,
        position: 'right',
        verticalAlign: 'middle',
        align: 'left',
        distance: 8,
      },
      leaves: {
        label: {
          show: true,
          position: 'right',
          verticalAlign: 'middle',
          align: 'left',
          distance: 7,
        },
      },
      emphasis: {
        focus: 'descendant',
        itemStyle: {
          shadowBlur: 14,
          shadowColor: 'rgba(37, 99, 235, 0.28)',
        },
        lineStyle: {
          width: 2.5,
        },
      },
      lineStyle: {
        color: activeColor.value,
        width: 1.45,
        opacity: 0.24,
        curveness: 0.52,
      },
    },
  ],
}))

function renderChart(): void {
  if (!chart) return

  // 数据变化时，等待动态高度先应用到 DOM，再重新计算画布尺寸。
  void nextTick(() => {
    resizeChartIfNeeded()
    chart?.setOption(option.value, { notMerge: true })
  })
}

/**
 * ECharts resize 会改写内部 Canvas。只有宿主元素宽高确实变化时才执行，
 * 避免 ResizeObserver → resize → 再次通知形成反馈循环。
 */
function resizeChartIfNeeded(): void {
  const element = chartElement.value
  if (!chart || !element) return

  const width = Math.round(element.clientWidth)
  const height = Math.round(element.clientHeight)
  if (
    width === lastChartSize.width &&
    height === lastChartSize.height
  ) {
    return
  }

  lastChartSize = { width, height }
  chartWidth.value = width
  chart.resize({ width, height })
}

function centerViewportOnRoot(): void {
  void nextTick(() => {
    const viewport = viewportElement.value
    if (!viewport) return

    // TreeChart 会把根节点放在整棵树的垂直中心。
    // 初次进入或切换科目时自动对准根节点，之后用户仍可上下浏览全部分支。
    viewport.scrollTo({
      top: Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2),
      left: 0,
    })
  })
}

interface PositionedTreeNode {
  node: MindMapTreeNode
  depth: number
  x: number
  y: number
}

/**
 * TreeChart 使用等距叶子布局。这里复现同一套坐标，用原生捕获事件扩大可点击范围：
 * 卡片、圆点以及右侧文字都可以命中，不再依赖 ECharts 的 dataType 字段。
 */
function getPositionedNodes(width: number): PositionedTreeNode[] {
  const roots = treeData.value
  const leaves = Math.max(1, countLeaves(roots))
  const top = overviewMode.value ? 34 : 80
  const bottom = overviewMode.value ? 34 : 80
  const left = overviewMode.value ? 90 : 105
  const right = overviewMode.value ? 120 : 250
  const usableHeight = chartHeight.value - top - bottom
  const leafStep = leaves > 1 ? usableHeight / (leaves - 1) : 0
  const positioned: PositionedTreeNode[] = []
  let leafIndex = 0
  let maxDepth = 0

  function measureDepth(nodes: MindMapTreeNode[], depth: number): void {
    maxDepth = Math.max(maxDepth, depth)
    for (const node of nodes) {
      if (node.children?.length) measureDepth(node.children, depth + 1)
    }
  }
  measureDepth(roots, 0)

  function positionNode(node: MindMapTreeNode, depth: number): number {
    let y: number
    if (node.children?.length) {
      const childPositions = node.children.map((child) =>
        positionNode(child, depth + 1),
      )
      y =
        childPositions.reduce((total, childY) => total + childY, 0) /
        childPositions.length
    } else {
      y = top + leafIndex * leafStep
      leafIndex += 1
    }

    const usableWidth = width - left - right
    const x = left + (maxDepth ? (depth / maxDepth) * usableWidth : 0)
    positioned.push({ node, depth, x, y })
    return y
  }

  for (const root of roots) positionNode(root, 0)
  return positioned
}

const nodeHitTargets = computed(() =>
  getPositionedNodes(chartWidth.value).map((positioned) => {
    const { depth, x, y } = positioned
    const overviewLeaf = overviewMode.value && depth >= 3
    const cardNode = depth <= 1
    const width = overviewLeaf ? 24 : cardNode ? 174 : 255
    const height = overviewLeaf ? 18 : cardNode ? 58 : depth === 2 ? 48 : 52

    return {
      ...positioned,
      style: {
        left: `${x - (overviewLeaf ? 12 : cardNode ? 87 : 12)}px`,
        top: `${y - height / 2}px`,
        width: `${width}px`,
        height: `${height}px`,
      },
    }
  }),
)

function handleChartCanvasClick(event: MouseEvent): void {
  const element = chartElement.value
  if (!element) return

  const bounds = element.getBoundingClientRect()
  const x = event.clientX - bounds.left
  const y = event.clientY - bounds.top
  const candidates = getPositionedNodes(element.clientWidth)

  const hit = candidates
    .filter(({ depth, x: nodeX, y: nodeY }) => {
      if (depth <= 1) {
        return Math.abs(x - nodeX) <= 82 && Math.abs(y - nodeY) <= 28
      }

      if (overviewMode.value && depth >= 3) {
        return Math.abs(x - nodeX) <= 10 && Math.abs(y - nodeY) <= 7
      }

      const verticalTolerance = depth === 2 ? 24 : 27
      return (
        x >= nodeX - 12 &&
        x <= nodeX + 235 &&
        Math.abs(y - nodeY) <= verticalTolerance
      )
    })
    .sort((a, b) => Math.abs(y - a.y) - Math.abs(y - b.y))[0]

  if (hit?.node.id) emitNodeClick(hit.node.id)
}

function toggleOverview(): void {
  overviewMode.value = !overviewMode.value
  if (overviewMode.value) expandedMode.value = false
}

function toggleExpanded(): void {
  expandedMode.value = !expandedMode.value
  if (expandedMode.value) overviewMode.value = false
}

onMounted(async () => {
  await nextTick()
  if (!chartElement.value) return

  chart = init(chartElement.value)
  lastChartSize = { width: 0, height: 0 }
  resizeChartIfNeeded()
  renderChart()
  centerViewportOnRoot()

  chart.on('click', (params) => {
    // TreeChart 的节点事件在不同 ECharts 小版本中不保证提供 dataType。
    // 业务 ID 才是可靠判断依据，不能沿用 GraphChart 的 dataType === "node" 条件。
    const node = params.data as Partial<MindMapTreeNode> | undefined
    if (node?.id) emitNodeClick(node.id)
  })

  // ResizeObserver 同时覆盖窗口缩放和父容器布局变化。
  resizeObserver = new ResizeObserver(() => {
    window.cancelAnimationFrame(resizeFrame)
    resizeFrame = window.requestAnimationFrame(resizeChartIfNeeded)
  })
  resizeObserver.observe(chartElement.value)
})

watch(option, () => {
  renderChart()
  if (!overviewMode.value) centerViewportOnRoot()
})

onBeforeUnmount(() => {
  window.cancelAnimationFrame(resizeFrame)
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = undefined
})
</script>

<template>
  <section
    class="mind-map-shell"
    :class="{ 'is-overview': overviewMode, 'is-expanded': expandedMode }"
    aria-label="408 知识图谱"
  >
    <div class="mind-map-toolbar">
      <div class="map-toolbar-copy">
        <span><i aria-hidden="true" /> 从左到右 · 按章节分层</span>
        <small v-if="overviewMode">全图概览：整张图谱适配当前视窗，悬停或点击查看考点</small>
        <small v-else>清晰阅读：滚动浏览全部名称，点击任意节点进入详情</small>
      </div>

      <div class="map-actions" aria-label="图谱显示控制">
        <button
          type="button"
          :class="{ active: overviewMode }"
          @click="toggleOverview"
        >
          {{ overviewMode ? '清晰阅读' : '全图概览' }}
        </button>
        <button
          v-if="!overviewMode"
          type="button"
          :class="{ active: expandedMode }"
          @click="toggleExpanded"
        >
          {{ expandedMode ? '收起视窗' : '完整展开' }}
        </button>
        <button type="button" @click="centerViewportOnRoot">回到根节点</button>
      </div>
    </div>

    <div
      ref="viewportElement"
      class="mind-map-viewport"
      :style="viewportStyle"
      tabindex="0"
    >
      <div
        ref="chartElement"
        class="mind-map"
        :style="chartStyle"
        role="img"
        aria-label="从左到右展开的 408 知识树；可滚动并点击节点查看详情"
        @click.capture="handleChartCanvasClick"
      />
      <div
        class="node-hit-layer"
        :style="{ width: `${chartWidth}px`, height: `${chartHeight}px` }"
        aria-label="知识图谱节点"
      >
        <button
          v-for="target in nodeHitTargets"
          :key="target.node.id"
          type="button"
          class="node-hit-target"
          :style="target.style"
          :aria-label="`打开${target.node.name}（${target.node.id}）`"
          :title="`${target.node.name} · ${target.node.id}`"
          @click.stop="emitNodeClick(target.node.id)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.mind-map-shell {
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1.65rem;
  background: #ffffff;
  box-shadow:
    0 1.6rem 4rem rgba(30, 41, 59, 0.07),
    0 0 0 1px rgba(255, 255, 255, 0.75) inset;
  transition: box-shadow 180ms ease;
}

.mind-map-toolbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1rem 0.9rem 1.15rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  background:
    linear-gradient(120deg, rgba(248, 250, 252, 0.98), rgba(241, 245, 249, 0.86));
  color: #334155;
  backdrop-filter: blur(14px);
}

.map-toolbar-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.25rem;
}

.map-toolbar-copy span {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.79rem;
  font-weight: 800;
  letter-spacing: 0.01em;
}

.map-toolbar-copy i {
  width: 0.48rem;
  height: 0.48rem;
  border-radius: 50%;
  background: #3157d5;
  box-shadow: 0 0 0 0.22rem rgba(49, 87, 213, 0.12);
}

.map-toolbar-copy small {
  color: #7b8798;
  font-size: 0.7rem;
  line-height: 1.5;
}

.map-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 0.42rem;
}

.map-actions button {
  padding: 0.5rem 0.7rem;
  border: 1px solid #dce3ed;
  border-radius: 0.62rem;
  background: rgba(255, 255, 255, 0.84);
  color: #516077;
  font-size: 0.69rem;
  font-weight: 720;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 0.25rem 0.7rem rgba(30, 41, 59, 0.035);
  transition: 150ms ease;
}

.map-actions button:hover {
  transform: translateY(-1px);
  border-color: #9aafe8;
  color: #2847ac;
}

.map-actions button.active {
  border-color: #3157d5;
  background: #3157d5;
  color: #ffffff;
}

.mind-map-viewport {
  position: relative;
  width: 100%;
  height: min(72vh, 52rem);
  min-height: 42rem;
  overflow: auto;
  outline: none;
  background:
    radial-gradient(circle at 8% 48%, rgba(49, 87, 213, 0.09), transparent 24%),
    radial-gradient(circle at 92% 18%, rgba(124, 58, 237, 0.045), transparent 22%),
    radial-gradient(circle, rgba(100, 116, 139, 0.13) 1px, transparent 1.1px),
    linear-gradient(145deg, #fbfdff, #f8fafc 60%, #ffffff);
  background-size: auto, auto, 24px 24px, auto;
  scrollbar-color: #aab8ca #edf1f6;
  scrollbar-width: auto;
}

.mind-map-viewport:focus-visible {
  box-shadow: inset 0 0 0 3px rgba(49, 87, 213, 0.2);
}

.mind-map {
  width: max(100%, 75rem);
  min-height: 45rem;
}

.node-hit-layer {
  position: absolute;
  z-index: 1;
  top: 0;
  left: 0;
  pointer-events: none;
}

.node-hit-target {
  position: absolute;
  padding: 0;
  border: 0;
  border-radius: 0.75rem;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
}

.node-hit-target:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.48);
  outline-offset: 2px;
  background: rgba(37, 99, 235, 0.07);
}

.mind-map-shell.is-overview .mind-map {
  width: 100%;
  min-width: 64rem;
  min-height: 0;
}

.mind-map-shell.is-overview .mind-map-viewport {
  overflow: hidden;
}

.mind-map-shell.is-expanded {
  overflow: visible;
}

.mind-map-shell.is-expanded .mind-map-toolbar {
  position: sticky;
  top: 5.2rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.9rem;
  box-shadow: 0 0.7rem 2rem rgba(30, 41, 59, 0.08);
}

.mind-map-shell.is-expanded .mind-map-viewport {
  min-height: 0;
  overflow: visible;
}

@media (max-width: 720px) {
  .mind-map-toolbar {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.65rem;
  }

  .map-actions {
    width: 100%;
    overflow-x: auto;
    padding-bottom: 0.15rem;
  }

  .mind-map-viewport {
    height: 38rem;
    min-height: 38rem;
  }

  .mind-map {
    width: 78rem;
  }

  .mind-map-shell.is-overview .mind-map {
    min-width: 58rem;
  }
}
</style>

<script setup lang="ts">
import { GraphChart } from 'echarts/charts'
import {
  TooltipComponent,
  type TooltipComponentOption,
} from 'echarts/components'
import { init, use, type ComposeOption, type EChartsType } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import type { GraphSeriesOption } from 'echarts/charts'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { MindMapLink, MindMapNode } from '@/types'

// 模块化引入可显著减小首屏包体；所有代码仍会被打包，离线时无需 CDN。
use([GraphChart, TooltipComponent, CanvasRenderer])

type MindMapOption = ComposeOption<GraphSeriesOption | TooltipComponentOption>

const props = defineProps<{
  nodes: MindMapNode[]
  links: MindMapLink[]
}>()

const emit = defineEmits<{
  /** 只向父组件暴露稳定的业务 ID，不泄漏 ECharts 点击事件对象。 */
  'node-click': [nodeId: string]
}>()

const chartElement = ref<HTMLDivElement | null>(null)
let chart: EChartsType | undefined
let resizeObserver: ResizeObserver | undefined

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

const option = computed<MindMapOption>(() => ({
  tooltip: {
    trigger: 'item',
    formatter: (params) => {
      if (Array.isArray(params)) return ''
      if (params.dataType !== 'node') return ''
      const data = params.data as MindMapNode
      return data.name
    },
  },
  series: [
    {
      type: 'graph',
      layout: 'force',
      roam: true,
      draggable: false,
      animationDurationUpdate: 450,
      force: {
        repulsion: 420,
        edgeLength: [90, 180],
        gravity: 0.08,
      },
      label: {
        show: true,
        position: 'right',
        color: '#0f172a',
        fontSize: 14,
        formatter: '{b}',
      },
      emphasis: {
        focus: 'adjacency',
        lineStyle: { width: 3 },
      },
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: 7,
      lineStyle: {
        color: '#94a3b8',
        curveness: 0.08,
        width: 1.5,
      },
      data: props.nodes.map((node) => ({
        ...node,
        value: node.id,
        symbolSize: node.symbolSize ?? (node.parentId ? 38 : 60),
        // 叶子节点数量较多：默认隐藏其常驻标签，悬停仍可查看并点击。
        label: {
          show: !/-\d{3}$/.test(node.id),
        },
        itemStyle: {
          color: getNodeColor(node.id),
          borderColor: '#ffffff',
          borderWidth: 2,
          shadowBlur: 8,
          shadowColor: 'rgba(15, 23, 42, 0.18)',
        },
      })),
      links: props.links,
    },
  ],
}))

function renderChart(): void {
  chart?.setOption(option.value, { notMerge: true })
}

onMounted(async () => {
  await nextTick()
  if (!chartElement.value) return

  chart = init(chartElement.value)
  renderChart()

  chart.on('click', (params) => {
    if (params.dataType !== 'node') return
    const node = params.data as MindMapNode
    if (node.id) emit('node-click', node.id)
  })

  // ResizeObserver 同时覆盖窗口缩放和父容器布局变化。
  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(chartElement.value)
})

watch(option, renderChart)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = undefined
})
</script>

<template>
  <div
    ref="chartElement"
    class="mind-map"
    role="img"
    aria-label="408 知识图谱；可缩放、拖动并点击节点查看详情"
  />
</template>

<style scoped>
.mind-map {
  width: 100%;
  min-height: 46rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1.5rem;
  background:
    radial-gradient(circle at 20% 20%, rgba(37, 99, 235, 0.06), transparent 28%),
    linear-gradient(rgba(148, 163, 184, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.07) 1px, transparent 1px),
    #ffffff;
  background-size: auto, 28px 28px, 28px 28px, auto;
}

@media (max-width: 640px) {
  .mind-map {
    min-height: 35rem;
  }
}
</style>

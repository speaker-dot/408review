<script setup lang="ts">
import DOMPurify from 'dompurify'
import katex from 'katex'
import MarkdownIt from 'markdown-it'
import { computed } from 'vue'

const props = defineProps<{
  content: string
}>()

const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: false,
  typographer: true,
})

interface MathToken {
  content: string
  displayMode: boolean
}

/**
 * 内容文件由项目自身提供，但仍先关闭 Markdown 原生 HTML 并经过 DOMPurify。
 * LaTeX 先替换为占位符，净化完成后再注入 KaTeX 产生的可信 HTML。
 */
const renderedContent = computed(() => {
  const mathTokens: MathToken[] = []
  const stash = (content: string, displayMode: boolean): string => {
    const index = mathTokens.push({ content, displayMode }) - 1
    return `@@MATH${index}@@`
  }

  let source = props.content.replace(/\$\$([\s\S]+?)\$\$/g, (_match, math: string) =>
    stash(math, true),
  )
  source = source.replace(/\$([^$\n]+?)\$/g, (_match, math: string) =>
    stash(math, false),
  )
  // 知识前置关系直接可点；Hash 路由在离线部署和 GitHub 子路径下均有效。
  source = source.replace(
    /\(参见 ID:\s*((?:DS|CS|OS|NET)(?:-\d{2}){1,2}(?:-\d{3})?)\)/g,
    (_match, id: string) => `(参见 [${id}](#/node/${id}))`,
  )

  const safeHtml = DOMPurify.sanitize(markdown.render(source), {
    USE_PROFILES: { html: true },
  })

  return safeHtml.replace(/@@MATH(\d+)@@/g, (_match, indexText: string) => {
    const token = mathTokens[Number(indexText)]
    if (!token) return ''

    return katex.renderToString(token.content, {
      displayMode: token.displayMode,
      throwOnError: false,
      strict: 'ignore',
      output: 'html',
    })
  })
})
</script>

<template>
  <div class="markdown-content" v-html="renderedContent" />
</template>

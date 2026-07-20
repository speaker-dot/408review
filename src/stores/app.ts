import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { KnowledgeCategory } from '@/types'

/** 仅保存跨页面需要保留的轻量 UI 状态，知识内容本身由 Dexie 管理。 */
export const useAppStore = defineStore('app', () => {
  const selectedCategory = ref<KnowledgeCategory>('DS')

  function selectCategory(category: KnowledgeCategory): void {
    selectedCategory.value = category
  }

  return { selectedCategory, selectCategory }
})

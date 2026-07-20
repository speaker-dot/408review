import Dexie, { type EntityTable } from 'dexie'

import type { KnowledgeNode } from '@/types'

/**
 * 408 MindMap 的浏览器本地数据库。
 *
 * `id` 是主键；其余字段建立索引，便于后续按科目、父节点或难度查询。
 * 版本升级时应新增 `version(n)`，不要修改已经发布过的 schema 版本。
 */
class Cs408Database extends Dexie {
  nodes!: EntityTable<KnowledgeNode, 'id'>

  constructor() {
    super('cs408-mindmap')

    this.version(1).stores({
      nodes: 'id, category, parentId, difficulty',
    })
  }
}

/** 全局共享同一个 Dexie 实例，避免重复打开 IndexedDB 连接。 */
export const db = new Cs408Database()

/**
 * 从本地数据库读取知识点。
 * 未命中时返回 undefined，调用方可继续向静态 JSON 发起请求。
 */
export async function getNode(
  id: string,
): Promise<KnowledgeNode | undefined> {
  return db.nodes.get(id)
}

/**
 * 新增或更新知识点缓存。
 * `put` 以 id 为主键执行 upsert，因此内容文件升级后可以安全覆盖旧缓存。
 */
export async function saveNode(node: KnowledgeNode): Promise<string> {
  return db.nodes.put(node)
}

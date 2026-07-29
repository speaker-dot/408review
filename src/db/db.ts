import Dexie, { type EntityTable } from 'dexie'

import type { KnowledgeNode, PaperProgress } from '@/types'

/**
 * 408 MindMap 的浏览器本地数据库。
 *
 * `id` 是主键；其余字段建立索引，便于后续按科目、父节点或难度查询。
 * 版本升级时应新增 `version(n)`，不要修改已经发布过的 schema 版本。
 */
class Cs408Database extends Dexie {
  nodes!: EntityTable<KnowledgeNode, 'id'>
  paperProgress!: EntityTable<PaperProgress, 'year'>

  constructor() {
    super('cs408-mindmap')

    this.version(1).stores({
      nodes: 'id, category, parentId, difficulty',
    })

    /**
     * 内容库 v2 对应 2026-07 的全量讲解与题库升级。
     * 旧版节点与新版共用相同主键，若不清理就会被永久优先读取；
     * 因此只在数据库从 v1 升级到 v2 时清空节点缓存，随后由带哈希的
     * 静态 JSON 或 Service Worker 离线缓存重新填充。
     */
    this.version(2)
      .stores({
        nodes: 'id, category, parentId, difficulty',
      })
      .upgrade((transaction) => transaction.table('nodes').clear())

    // v3 只新增真题阅读进度表，不触碰已经缓存的知识节点。
    this.version(3).stores({
      nodes: 'id, category, parentId, difficulty',
      paperProgress: 'year, updatedAt, completed',
    })
  }
}

/** 全局共享同一个 Dexie 实例，避免重复打开 IndexedDB 连接。 */
export const db = new Cs408Database()

/**
 * 从本地数据库读取知识点。
 * 未命中时返回 undefined。命中只代表存在离线副本，不代表它一定是
 * 服务器上的最新版本；在线状态下调用方仍应尝试获取新版内容。
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

export async function getPaperProgress(
  year: number,
): Promise<PaperProgress | undefined> {
  return db.paperProgress.get(year)
}

export async function savePaperProgress(
  progress: PaperProgress,
): Promise<number> {
  return db.paperProgress.put(progress)
}

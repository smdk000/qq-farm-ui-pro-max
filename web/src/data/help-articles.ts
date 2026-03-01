/**
 * 帮助中心文章内容数据 - 完整版（21 篇全部完成）
 * 
 * 数据结构说明：
 * - id: 文章唯一标识
 * - category: 所属分类
 * - title: 文章标题
 * - icon: 文章图标
 * - content: 文章内容（支持 HTML）
 * - tags: 搜索标签
 * - updatedAt: 最后更新时间
 * - version: 适用版本
 * - author: 作者
 * - reviewStatus: 审核状态 (draft | published | archived)
 */

export interface HelpArticle {
  id: string
  category: string
  title: string
  icon: string
  content: string
  tags: string[]
  updatedAt: string
  version: string
  author: string
  reviewStatus: 'draft' | 'published' | 'archived'
}

// 导入完整的文章内容
import { helpArticles as completeArticles, helpCategories, developmentProgress } from './help-articles-complete'

export { helpCategories, developmentProgress }

export const helpArticles: HelpArticle[] = completeArticles

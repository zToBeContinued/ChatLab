/**
 * 助手管理器
 * 负责助手配置的加载、CRUD、版本比对更新和内置助手同步
 *
 * 存储策略：
 * - 内置助手打包在 electron/main/ai/assistant/builtins/ 中
 * - 首次启动时复制到 {userData}/data/ai/assistants/
 * - 用户可修改，修改后标记 isUserModified = true
 * - 应用更新时，未被用户修改的内置助手自动更新为新版本
 */

import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import { getAiDataDir, ensureDir } from '../../paths'
import { aiLogger } from '../logger'
import type { AssistantConfig, AssistantSummary, AssistantSyncResult, AssistantSaveResult } from './types'

// 直接 import 内置助手 JSON（构建时嵌入 bundle，无需运行时文件系统读取）
import builtinGeneral from './builtins/general.json'
import builtinCommunityAnalyst from './builtins/community_analyst.json'
import builtinEmotionAnalyst from './builtins/emotion_analyst.json'
import builtinCustomerService from './builtins/customer_service.json'

const BUILTIN_CONFIGS: AssistantConfig[] = [
  builtinGeneral as AssistantConfig,
  builtinCommunityAnalyst as AssistantConfig,
  builtinEmotionAnalyst as AssistantConfig,
  builtinCustomerService as AssistantConfig,
]

const ASSISTANTS_DIR_NAME = 'assistants'

let cachedAssistants: Map<string, AssistantConfig> = new Map()
let initialized = false

/**
 * 获取用户助手配置目录
 */
function getAssistantsDir(): string {
  return path.join(getAiDataDir(), ASSISTANTS_DIR_NAME)
}

// ==================== 初始化与同步 ====================

/**
 * 初始化助手管理器
 * - 确保目录存在
 * - 同步内置助手到用户目录
 * - 加载所有助手配置
 */
export function initAssistantManager(): AssistantSyncResult {
  const assistantsDir = getAssistantsDir()
  ensureDir(assistantsDir)

  const syncResult = syncBuiltinAssistants()
  loadAllAssistants()

  initialized = true
  aiLogger.info('AssistantManager', 'Initialized', {
    total: cachedAssistants.size,
    ...syncResult,
  })

  return syncResult
}

/**
 * 同步内置助手到用户目录
 * - 新增的内置助手：复制到用户目录
 * - 已有且未修改：如果版本更高则更新
 * - 已有且已修改：跳过
 */
function syncBuiltinAssistants(): AssistantSyncResult {
  const result: AssistantSyncResult = { total: 0, added: 0, updated: 0, skipped: 0 }

  for (const builtinConfig of BUILTIN_CONFIGS) {
    try {
      if (!builtinConfig || !builtinConfig.id) continue

      const userFilePath = path.join(getAssistantsDir(), `${builtinConfig.id}.json`)

      if (!fs.existsSync(userFilePath)) {
        const configToWrite: AssistantConfig = {
          ...builtinConfig,
          builtinId: builtinConfig.id,
          isUserModified: false,
        }
        writeJsonFile(userFilePath, configToWrite)
        result.added++
      } else {
        const userConfig = readJsonFile<AssistantConfig>(userFilePath)
        if (!userConfig) continue

        if (userConfig.isUserModified) {
          result.skipped++
        } else if (builtinConfig.version > (userConfig.version || 0)) {
          const configToWrite: AssistantConfig = {
            ...builtinConfig,
            builtinId: builtinConfig.id,
            isUserModified: false,
          }
          writeJsonFile(userFilePath, configToWrite)
          result.updated++
        }
      }
    } catch (error) {
      aiLogger.warn('AssistantManager', `Failed to sync builtin: ${builtinConfig.id}`, { error: String(error) })
    }
  }

  result.total = BUILTIN_CONFIGS.length
  return result
}

/**
 * 从用户目录加载所有助手配置到内存缓存
 */
function loadAllAssistants(): void {
  cachedAssistants.clear()

  const assistantsDir = getAssistantsDir()
  if (!fs.existsSync(assistantsDir)) return

  const files = fs.readdirSync(assistantsDir).filter((f) => f.endsWith('.json'))

  for (const file of files) {
    try {
      const config = readJsonFile<AssistantConfig>(path.join(assistantsDir, file))
      if (config && config.id) {
        cachedAssistants.set(config.id, config)
      }
    } catch (error) {
      aiLogger.warn('AssistantManager', `Failed to load assistant: ${file}`, { error: String(error) })
    }
  }
}

// ==================== 查询 API ====================

/**
 * 获取所有助手的摘要列表（用于前端展示）
 * 按 order 排序，order 相同时按名称排序
 */
export function getAllAssistants(): AssistantSummary[] {
  ensureInitialized()

  return Array.from(cachedAssistants.values())
    .sort((a, b) => {
      const orderDiff = (a.order ?? 100) - (b.order ?? 100)
      if (orderDiff !== 0) return orderDiff
      return a.name.localeCompare(b.name)
    })
    .map(toSummary)
}

/**
 * 获取单个助手的完整配置
 */
export function getAssistantConfig(id: string): AssistantConfig | null {
  ensureInitialized()
  return cachedAssistants.get(id) ?? null
}

/**
 * 检查助手是否存在
 */
export function hasAssistant(id: string): boolean {
  ensureInitialized()
  return cachedAssistants.has(id)
}

// ==================== 修改 API ====================

/**
 * 更新助手配置（用于配置弹窗保存）
 */
export function updateAssistant(id: string, updates: Partial<AssistantConfig>): AssistantSaveResult {
  ensureInitialized()

  const existing = cachedAssistants.get(id)
  if (!existing) {
    return { success: false, error: `Assistant not found: ${id}` }
  }

  const updated: AssistantConfig = {
    ...existing,
    ...updates,
    id, // id 不可变
  }

  // 如果是内置助手被修改，标记 isUserModified
  if (existing.builtinId) {
    updated.isUserModified = true
  }

  return saveAssistantToDisk(updated)
}

/**
 * 创建自定义助手
 */
export function createAssistant(config: Omit<AssistantConfig, 'id' | 'version'>): AssistantSaveResult & { id?: string } {
  ensureInitialized()

  const id = `custom_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const newConfig: AssistantConfig = {
    ...config,
    id,
    version: 1,
    builtinId: undefined,
    isUserModified: undefined,
  }

  const result = saveAssistantToDisk(newConfig)
  return { ...result, id: result.success ? id : undefined }
}

/**
 * 删除助手
 * 内置助手不允许删除，只能重置
 */
export function deleteAssistant(id: string): AssistantSaveResult {
  ensureInitialized()

  const existing = cachedAssistants.get(id)
  if (!existing) {
    return { success: false, error: `Assistant not found: ${id}` }
  }

  if (existing.builtinId) {
    return { success: false, error: 'Cannot delete builtin assistant. Use resetAssistant() instead.' }
  }

  try {
    const filePath = path.join(getAssistantsDir(), `${id}.json`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    cachedAssistants.delete(id)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

/**
 * 重置内置助手为出厂默认
 */
export function resetAssistant(id: string): AssistantSaveResult {
  ensureInitialized()

  const existing = cachedAssistants.get(id)
  if (!existing?.builtinId) {
    return { success: false, error: 'Only builtin assistants can be reset' }
  }

  const builtinConfig = BUILTIN_CONFIGS.find((c) => c.id === existing.builtinId)
  if (!builtinConfig) {
    return { success: false, error: `Builtin config not found: ${existing.builtinId}` }
  }

  const resetConfig: AssistantConfig = {
    ...builtinConfig,
    builtinId: builtinConfig.id,
    isUserModified: false,
  }

  return saveAssistantToDisk(resetConfig)
}

// ==================== 提示词预设迁移 ====================

/**
 * 备份旧的提示词预设数据到 data/backup 目录
 * 由前端在首次检测到旧数据时调用
 */
export function backupOldPromptPresets(data: {
  customPresets?: unknown[]
  builtinOverrides?: Record<string, unknown>
  remotePresetIds?: string[]
}): { success: boolean; filePath?: string; error?: string } {
  try {
    const backupDir = path.join(getAiDataDir(), '..', 'backup')
    ensureDir(backupDir)

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filePath = path.join(backupDir, `prompt-presets-${timestamp}.json`)

    const backupContent = {
      backupTime: new Date().toISOString(),
      description: 'ChatLab 旧提示词预设系统备份（已被多助手系统替代）',
      ...data,
    }

    writeJsonFile(filePath, backupContent)
    aiLogger.info('AssistantManager', 'Old prompt presets backed up', { filePath })

    return { success: true, filePath }
  } catch (error) {
    aiLogger.error('AssistantManager', 'Failed to backup prompt presets', { error: String(error) })
    return { success: false, error: String(error) }
  }
}

// ==================== 内部工具函数 ====================

function ensureInitialized(): void {
  if (!initialized) {
    initAssistantManager()
  }
}

function toSummary(config: AssistantConfig): AssistantSummary {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    presetQuestions: config.presetQuestions,
    order: config.order,
    builtinId: config.builtinId,
    isUserModified: config.isUserModified,
    applicableChatTypes: config.applicableChatTypes,
    supportedLocales: config.supportedLocales,
  }
}

function saveAssistantToDisk(config: AssistantConfig): AssistantSaveResult {
  try {
    const filePath = path.join(getAssistantsDir(), `${config.id}.json`)
    writeJsonFile(filePath, config)
    cachedAssistants.set(config.id, config)
    return { success: true }
  } catch (error) {
    aiLogger.error('AssistantManager', `Failed to save assistant: ${config.id}`, { error: String(error) })
    return { success: false, error: String(error) }
  }
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

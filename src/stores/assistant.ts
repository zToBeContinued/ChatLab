/**
 * 助手管理 Store
 * 管理助手列表缓存、当前选中助手、配置 CRUD
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface AssistantSummary {
  id: string
  name: string
  description: string
  presetQuestions: string[]
  order?: number
  builtinId?: string
  isUserModified?: boolean
  applicableChatTypes?: ('group' | 'private')[]
  supportedLocales?: string[]
}

export interface AssistantConfigFull {
  id: string
  name: string
  description: string
  systemPrompt: string
  responseRules?: string
  presetQuestions: string[]
  allowedBuiltinTools?: string[]
  customSkills?: unknown[]
  version: number
  builtinId?: string
  isUserModified?: boolean
  order?: number
  applicableChatTypes?: ('group' | 'private')[]
  supportedLocales?: string[]
}

export const useAssistantStore = defineStore('assistant', () => {
  const assistants = ref<AssistantSummary[]>([])
  const selectedAssistantId = ref<string | null>(null)
  const isLoaded = ref(false)

  /** 当前过滤条件 */
  const currentChatType = ref<'group' | 'private'>('group')
  const currentLocale = ref<string>('zh-CN')

  const selectedAssistant = computed(() => {
    if (!selectedAssistantId.value) return null
    return assistants.value.find((a) => a.id === selectedAssistantId.value) ?? null
  })

  /** 根据聊天类型和语言过滤后的助手列表 */
  const filteredAssistants = computed(() => {
    return assistants.value.filter((a) => {
      const typeMatch =
        !a.applicableChatTypes?.length || a.applicableChatTypes.includes(currentChatType.value)
      const localeMatch =
        !a.supportedLocales?.length ||
        a.supportedLocales.some((l) => currentLocale.value.startsWith(l))
      return typeMatch && localeMatch
    })
  })

  /** 默认展示的前 N 个助手 */
  const defaultVisibleCount = 4

  const defaultAssistants = computed(() => filteredAssistants.value.slice(0, defaultVisibleCount))

  const moreAssistants = computed(() => filteredAssistants.value.slice(defaultVisibleCount))

  const hasMoreAssistants = computed(() => filteredAssistants.value.length > defaultVisibleCount)

  function setFilterContext(chatType: 'group' | 'private', locale: string): void {
    currentChatType.value = chatType
    currentLocale.value = locale
  }

  async function loadAssistants(): Promise<void> {
    try {
      assistants.value = await window.assistantApi.getAll()
      isLoaded.value = true
    } catch (error) {
      console.error('[AssistantStore] Failed to load assistants:', error)
    }
  }

  function selectAssistant(id: string): void {
    selectedAssistantId.value = id
  }

  function clearSelection(): void {
    selectedAssistantId.value = null
  }

  async function getAssistantConfig(id: string): Promise<AssistantConfigFull | null> {
    try {
      return await window.assistantApi.getConfig(id)
    } catch (error) {
      console.error('[AssistantStore] Failed to get config:', error)
      return null
    }
  }

  async function updateAssistant(
    id: string,
    updates: Partial<AssistantConfigFull>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await window.assistantApi.update(id, updates)
      if (result.success) {
        await loadAssistants()
      }
      return result
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async function resetAssistant(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await window.assistantApi.reset(id)
      if (result.success) {
        await loadAssistants()
      }
      return result
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  const promptMigrationDone = ref(false)

  /**
   * 检查并迁移旧提示词预设数据
   * 仅在首次检测到旧数据时执行，备份后标记为已完成
   */
  async function migrateOldPromptPresets(): Promise<void> {
    if (promptMigrationDone.value) return

    try {
      const raw = localStorage.getItem('prompt')
      if (!raw) {
        promptMigrationDone.value = true
        return
      }

      const data = JSON.parse(raw)
      const hasCustomPresets = Array.isArray(data.customPromptPresets) && data.customPromptPresets.length > 0
      const hasOverrides = data.builtinPresetOverrides && Object.keys(data.builtinPresetOverrides).length > 0
      const hasRemoteIds = Array.isArray(data.fetchedRemotePresetIds) && data.fetchedRemotePresetIds.length > 0

      if (!hasCustomPresets && !hasOverrides && !hasRemoteIds) {
        promptMigrationDone.value = true
        return
      }

      console.log('[AssistantStore] Backing up old prompt presets...')
      const result = await window.assistantApi.backupOldPresets({
        customPresets: data.customPromptPresets,
        builtinOverrides: data.builtinPresetOverrides,
        remotePresetIds: data.fetchedRemotePresetIds,
      })

      if (result.success) {
        console.log('[AssistantStore] Backup saved to:', result.filePath)
      } else {
        console.warn('[AssistantStore] Backup failed:', result.error)
      }

      promptMigrationDone.value = true
    } catch (error) {
      console.error('[AssistantStore] Migration check failed:', error)
      promptMigrationDone.value = true
    }
  }

  return {
    assistants,
    selectedAssistantId,
    selectedAssistant,
    isLoaded,
    currentChatType,
    currentLocale,
    filteredAssistants,
    defaultAssistants,
    moreAssistants,
    hasMoreAssistants,
    promptMigrationDone,
    loadAssistants,
    selectAssistant,
    clearSelection,
    setFilterContext,
    getAssistantConfig,
    updateAssistant,
    resetAssistant,
    migrateOldPromptPresets,
  }
})

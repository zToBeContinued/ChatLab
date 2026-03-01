/**
 * 助手模块入口
 */

export * from './types'
export {
  initAssistantManager,
  getAllAssistants,
  getAssistantConfig,
  hasAssistant,
  updateAssistant,
  createAssistant,
  deleteAssistant,
  resetAssistant,
  backupOldPromptPresets,
} from './manager'

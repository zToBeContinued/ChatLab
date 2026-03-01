/**
 * 助手系统类型定义
 * 定义助手配置、声明式 SQL 技能等核心类型
 */

// ==================== 助手配置 ====================

/**
 * 助手配置（JSON 配置文件的完整结构）
 *
 * 每个助手对应一个 JSON 文件，存储在 {userData}/data/ai/assistants/ 目录下。
 * 内置助手同时打包在应用 electron/main/ai/assistant/builtins/ 中，首次启动时复制到 userData。
 */
export interface AssistantConfig {
  /** 助手唯一标识 */
  id: string
  /** 助手显示名称 */
  name: string
  /** 助手简介 */
  description: string

  /** 系统提示词（替代旧的 PromptConfig.roleDefinition） */
  systemPrompt: string
  /** 回答要求（替代旧的 PromptConfig.responseRules，可选） */
  responseRules?: string

  /** 预设问题列表（前端展示，用户可点击直接发送） */
  presetQuestions: string[]

  /**
   * 允许使用的内置工具名称白名单
   * - undefined / 空数组 = 全部内置工具可用
   * - 非空数组 = 仅列出的工具可用
   */
  allowedBuiltinTools?: string[]

  /** 声明式 SQL 技能（Phase 2） */
  customSkills?: CustomSkillDef[]

  /** 配置版本号，用于内置助手的版本比对更新 */
  version: number
  /**
   * 内置助手来源标识
   * 非空 = 该配置派生自某个内置助手（值为内置助手的 id）
   */
  builtinId?: string
  /** 用户是否修改过内置助手的默认值（用于版本更新时判断是否可以覆盖） */
  isUserModified?: boolean
  /** 助手排序权重（越小越靠前，默认 100） */
  order?: number

  /**
   * 适用的聊天类型
   * - undefined / [] = 通用（群聊+私聊均适用）
   * - ['group'] = 仅群聊
   * - ['private'] = 仅私聊
   */
  applicableChatTypes?: ('group' | 'private')[]

  /**
   * 适用的语言/地区（前缀匹配，如 'zh' 匹配 'zh-CN'、'zh-TW'）
   * - undefined / [] = 全语言通用
   * - ['zh'] = 仅中文用户
   * - ['en'] = 仅英文用户
   */
  supportedLocales?: string[]
}

/**
 * 传递给前端的助手摘要信息（不含 systemPrompt 等大字段）
 */
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

// ==================== 声明式 SQL 技能（Phase 2） ====================

/**
 * 自定义 SQL 技能定义
 *
 * 每个技能在 LLM 眼中是一个 Function Calling 工具，
 * 执行时通过参数化 SQL 查询数据库，将结果格式化为文本返回给 LLM。
 */
export interface CustomSkillDef {
  /** 技能名称（作为 Function Calling 的 tool name） */
  name: string
  /** 技能描述（作为 Function Calling 的 tool description） */
  description: string
  /**
   * 参数定义（标准 JSON Schema 格式）
   *
   * 示例：
   * ```json
   * {
   *   "type": "object",
   *   "properties": {
   *     "days": { "type": "number", "description": "查询天数" }
   *   },
   *   "required": ["days"]
   * }
   * ```
   *
   * 运行时会通过 jsonSchemaToTypeBox() 转换为 TypeBox 格式，
   * 以满足 pi-agent-core AgentTool 的类型约束。
   */
  parameters: JsonSchemaObject

  /** 执行配置 */
  execution: SqlSkillExecution
}

/**
 * JSON Schema 对象类型（简化版，覆盖技能参数定义的常见场景）
 */
export interface JsonSchemaObject {
  type: 'object'
  properties: Record<string, JsonSchemaProperty>
  required?: string[]
}

/**
 * JSON Schema 属性定义
 */
export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean'
  description?: string
  default?: unknown
  enum?: unknown[]
}

/**
 * SQL 技能执行配置
 */
export interface SqlSkillExecution {
  /** 执行类型（目前仅支持 sqlite） */
  type: 'sqlite'
  /**
   * 参数化 SQL 查询语句
   * - 使用命名参数 @paramName（对应 parameters 中的属性名）
   * - 必须是只读查询（better-sqlite3 的 stmt.readonly 会强制检查）
   *
   * 示例：
   * ```sql
   * SELECT sender_name, COUNT(*) as msg_count
   * FROM message
   * WHERE ts > unixepoch('now', '-' || @days || ' days')
   * GROUP BY sender_name
   * ORDER BY msg_count DESC
   * LIMIT 10
   * ```
   */
  query: string
  /**
   * 行格式化模板，使用 {columnName} 占位符
   * 示例：'用户【{sender_name}】共发言 {msg_count} 次'
   */
  rowTemplate: string
  /** 可选的汇总模板，在所有行之前输出（支持 {rowCount} 占位符） */
  summaryTemplate?: string
  /** 查询结果为空时返回的文本 */
  fallback: string
}

// ==================== 助手管理器相关 ====================

/**
 * AssistantManager 初始化/同步的结果
 */
export interface AssistantSyncResult {
  /** 加载的助手总数 */
  total: number
  /** 新增的内置助手数 */
  added: number
  /** 自动更新的内置助手数（未被用户修改的） */
  updated: number
  /** 跳过更新的助手数（已被用户修改） */
  skipped: number
}

/**
 * 助手配置的保存/更新结果
 */
export interface AssistantSaveResult {
  success: boolean
  error?: string
}

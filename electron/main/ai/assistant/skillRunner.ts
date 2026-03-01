/**
 * 声明式 SQL 技能运行器
 *
 * 将 CustomSkillDef JSON 配置转换为可执行的 AgentTool，
 * 通过 pluginQuery 执行参数化 SQL 并格式化结果。
 */

import { Type, type TObject, type TProperties } from '@mariozechner/pi-ai'
import type { AgentTool } from '@mariozechner/pi-agent-core'
import type { ToolContext } from '../tools/types'
import type { CustomSkillDef, JsonSchemaObject, JsonSchemaProperty } from './types'
import * as workerManager from '../../worker/workerManager'

/**
 * 将简化 JSON Schema 对象转换为 TypeBox TObject
 *
 * 仅覆盖技能参数定义的常见类型（string / number / integer / boolean），
 * 足以满足声明式 SQL 技能的参数需求。
 */
export function jsonSchemaToTypeBox(schema: JsonSchemaObject): TObject<TProperties> {
  const props: TProperties = {}

  for (const [key, prop] of Object.entries(schema.properties)) {
    const isRequired = schema.required?.includes(key) ?? false
    const opts: Record<string, unknown> = {}
    if (prop.description) opts.description = prop.description
    if (prop.default !== undefined) opts.default = prop.default

    let typeBoxProp
    switch (prop.type) {
      case 'string':
        typeBoxProp = Type.String(opts)
        break
      case 'number':
        typeBoxProp = Type.Number(opts)
        break
      case 'integer':
        typeBoxProp = Type.Integer(opts)
        break
      case 'boolean':
        typeBoxProp = Type.Boolean(opts)
        break
      default:
        typeBoxProp = Type.String(opts)
    }

    props[key] = isRequired ? typeBoxProp : Type.Optional(typeBoxProp)
  }

  return Type.Object(props)
}

/**
 * 根据行格式化模板格式化单行数据
 * 模板使用 {columnName} 占位符
 */
function formatRow(template: string, row: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, col) => {
    const val = row[col]
    return val !== null && val !== undefined ? String(val) : ''
  })
}

/**
 * 从 CustomSkillDef 创建可执行的 AgentTool
 */
export function createSkillTool(skill: CustomSkillDef, context: ToolContext): AgentTool<any> {
  const schema = jsonSchemaToTypeBox(skill.parameters)

  return {
    name: skill.name,
    label: skill.name,
    description: skill.description,
    parameters: schema,
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      // 构建命名参数对象（添加 @ 前缀）
      const namedParams: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(params)) {
        namedParams[`@${key}`] = value
      }

      const rows = await workerManager.pluginQuery(
        context.sessionId,
        skill.execution.query,
        namedParams
      )

      if (!rows || rows.length === 0) {
        return { content: skill.execution.fallback }
      }

      const lines: string[] = []

      if (skill.execution.summaryTemplate) {
        lines.push(
          skill.execution.summaryTemplate.replace(/\{rowCount\}/g, String(rows.length))
        )
        lines.push('')
      }

      for (const row of rows) {
        lines.push(formatRow(skill.execution.rowTemplate, row as Record<string, unknown>))
      }

      return { content: lines.join('\n') }
    },
  }
}

/**
 * 从技能定义列表批量创建 AgentTool 数组
 */
export function createSkillTools(skills: CustomSkillDef[], context: ToolContext): AgentTool<any>[] {
  return skills.map((skill) => createSkillTool(skill, context))
}

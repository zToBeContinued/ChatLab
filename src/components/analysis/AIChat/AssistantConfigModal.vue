<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useToast } from '@nuxt/ui/runtime/composables/useToast.js'
import { useAssistantStore, type AssistantConfigFull } from '@/stores/assistant'

const props = defineProps<{
  open: boolean
  assistantId: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  saved: []
}>()

const toast = useToast()
const assistantStore = useAssistantStore()

const isLoading = ref(false)
const isSaving = ref(false)
const config = ref<AssistantConfigFull | null>(null)
const activeTab = ref<'basic' | 'skills'>('basic')

const chatTypeOptions = [
  { value: 'group', label: '群聊' },
  { value: 'private', label: '私聊' },
]

const localeOptions = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
]

interface SkillForm {
  name: string
  description: string
  parametersJson: string
  query: string
  rowTemplate: string
  summaryTemplate: string
  fallback: string
}

const form = ref({
  name: '',
  description: '',
  systemPrompt: '',
  responseRules: '',
  presetQuestions: [] as string[],
  applicableChatTypes: [] as string[],
  supportedLocales: [] as string[],
})

const skills = ref<SkillForm[]>([])
const newQuestion = ref('')
const expandedSkillIndex = ref<number | null>(null)

const hasSkills = computed(() => skills.value.length > 0)

watch(
  () => [props.open, props.assistantId],
  async ([visible, id]) => {
    if (visible && id) {
      activeTab.value = 'basic'
      await loadConfig(id as string)
    }
  },
  { immediate: true }
)

function skillDefToForm(skill: any): SkillForm {
  return {
    name: skill.name || '',
    description: skill.description || '',
    parametersJson: JSON.stringify(skill.parameters || { type: 'object', properties: {}, required: [] }, null, 2),
    query: skill.execution?.query || '',
    rowTemplate: skill.execution?.rowTemplate || '',
    summaryTemplate: skill.execution?.summaryTemplate || '',
    fallback: skill.execution?.fallback || '',
  }
}

function formToSkillDef(sf: SkillForm): any {
  let parameters: any
  try {
    parameters = JSON.parse(sf.parametersJson)
  } catch {
    parameters = { type: 'object', properties: {}, required: [] }
  }
  return {
    name: sf.name,
    description: sf.description,
    parameters,
    execution: {
      type: 'sqlite',
      query: sf.query,
      rowTemplate: sf.rowTemplate,
      summaryTemplate: sf.summaryTemplate || undefined,
      fallback: sf.fallback,
    },
  }
}

async function loadConfig(id: string) {
  isLoading.value = true
  try {
    config.value = await assistantStore.getAssistantConfig(id)
    if (config.value) {
      form.value = {
        name: config.value.name,
        description: config.value.description,
        systemPrompt: config.value.systemPrompt,
        responseRules: config.value.responseRules || '',
        presetQuestions: [...config.value.presetQuestions],
        applicableChatTypes: [...(config.value.applicableChatTypes || [])],
        supportedLocales: [...(config.value.supportedLocales || [])],
      }
      skills.value = (config.value.customSkills || []).map(skillDefToForm)
      expandedSkillIndex.value = null
    }
  } catch (error) {
    console.error('[AssistantConfigModal] Failed to load config:', error)
    toast.add({ title: '加载失败', description: String(error), color: 'error' })
  } finally {
    isLoading.value = false
  }
}

async function handleSave() {
  if (!props.assistantId) return

  isSaving.value = true
  try {
    const customSkills = skills.value
      .filter((s) => s.name.trim())
      .map(formToSkillDef)

    const result = await assistantStore.updateAssistant(props.assistantId, {
      name: form.value.name,
      description: form.value.description,
      systemPrompt: form.value.systemPrompt,
      responseRules: form.value.responseRules,
      presetQuestions: form.value.presetQuestions,
      applicableChatTypes: form.value.applicableChatTypes as ('group' | 'private')[],
      supportedLocales: form.value.supportedLocales,
      customSkills,
    })

    if (result.success) {
      toast.add({ title: '保存成功', color: 'success' })
      emit('saved')
      closeModal()
    } else {
      toast.add({ title: '保存失败', description: result.error || '未知错误', color: 'error' })
    }
  } catch (error) {
    console.error('[AssistantConfigModal] Save failed:', error)
    toast.add({ title: '保存失败', description: String(error), color: 'error' })
  } finally {
    isSaving.value = false
  }
}

async function handleReset() {
  if (!props.assistantId || !config.value?.builtinId) return

  isSaving.value = true
  try {
    const result = await assistantStore.resetAssistant(props.assistantId)
    if (result.success) {
      toast.add({ title: '已恢复默认', color: 'success' })
      await loadConfig(props.assistantId)
      emit('saved')
    } else {
      toast.add({ title: '恢复失败', description: result.error || '未知错误', color: 'error' })
    }
  } catch (error) {
    toast.add({ title: '恢复失败', description: String(error), color: 'error' })
  } finally {
    isSaving.value = false
  }
}

function addQuestion() {
  const q = newQuestion.value.trim()
  if (q && !form.value.presetQuestions.includes(q)) {
    form.value.presetQuestions.push(q)
    newQuestion.value = ''
  }
}

function removeQuestion(index: number) {
  form.value.presetQuestions.splice(index, 1)
}

function addSkill() {
  skills.value.push({
    name: '',
    description: '',
    parametersJson: JSON.stringify({ type: 'object', properties: {}, required: [] }, null, 2),
    query: '',
    rowTemplate: '',
    summaryTemplate: '',
    fallback: '未找到相关数据',
  })
  expandedSkillIndex.value = skills.value.length - 1
}

function removeSkill(index: number) {
  skills.value.splice(index, 1)
  if (expandedSkillIndex.value === index) {
    expandedSkillIndex.value = null
  } else if (expandedSkillIndex.value !== null && expandedSkillIndex.value > index) {
    expandedSkillIndex.value--
  }
}

function toggleSkill(index: number) {
  expandedSkillIndex.value = expandedSkillIndex.value === index ? null : index
}

function toggleChatType(value: string) {
  const idx = form.value.applicableChatTypes.indexOf(value)
  if (idx >= 0) {
    form.value.applicableChatTypes.splice(idx, 1)
  } else {
    form.value.applicableChatTypes.push(value)
  }
}

function toggleLocale(value: string) {
  const idx = form.value.supportedLocales.indexOf(value)
  if (idx >= 0) {
    form.value.supportedLocales.splice(idx, 1)
  } else {
    form.value.supportedLocales.push(value)
  }
}

function closeModal() {
  emit('update:open', false)
}
</script>

<template>
  <UModal :open="open" :ui="{ content: 'sm:max-w-2xl' }" @update:open="emit('update:open', $event)">
    <template #content>
      <div class="p-6">
        <!-- Header -->
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">助手配置</h2>
          <UButton icon="i-heroicons-x-mark" variant="ghost" size="sm" @click="closeModal" />
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-12">
          <UIcon name="i-heroicons-arrow-path" class="h-6 w-6 animate-spin text-gray-400" />
        </div>

        <!-- Tabs + Content -->
        <template v-else-if="config">
          <!-- Tab 切换 -->
          <div class="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
            <button
              class="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              :class="activeTab === 'basic'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'"
              @click="activeTab = 'basic'"
            >
              基础配置
            </button>
            <button
              class="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              :class="activeTab === 'skills'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'"
              @click="activeTab = 'skills'"
            >
              SQL 技能
              <span v-if="hasSkills" class="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary-100 text-[10px] text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                {{ skills.length }}
              </span>
            </button>
          </div>

          <div class="max-h-[500px] overflow-y-auto pr-1">
            <!-- 基础配置 Tab -->
            <div v-show="activeTab === 'basic'" class="space-y-5">
              <!-- 名称 -->
              <div>
                <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">名称</label>
                <UInput v-model="form.name" class="w-full" />
              </div>

              <!-- 描述 -->
              <div>
                <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">描述</label>
                <UInput v-model="form.description" class="w-full" />
              </div>

              <!-- 系统提示词 -->
              <div>
                <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">系统提示词</label>
                <UTextarea v-model="form.systemPrompt" :rows="5" autoresize class="w-full font-mono text-sm" />
              </div>

              <!-- 回答要求 -->
              <div>
                <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">回答要求</label>
                <UTextarea v-model="form.responseRules" :rows="4" autoresize class="w-full font-mono text-sm" />
              </div>

              <!-- 适用聊天类型 -->
              <div>
                <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">适用聊天类型</label>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="opt in chatTypeOptions"
                    :key="opt.value"
                    type="button"
                    class="rounded-lg border px-3 py-1.5 text-xs transition-colors"
                    :class="form.applicableChatTypes.includes(opt.value)
                      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-950/30 dark:text-primary-300'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'"
                    @click="toggleChatType(opt.value)"
                  >
                    {{ opt.label }}
                  </button>
                </div>
                <p class="mt-1 text-[10px] text-gray-400">不选 = 通用</p>
              </div>

              <!-- 适用语言 -->
              <div>
                <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">适用语言</label>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="opt in localeOptions"
                    :key="opt.value"
                    type="button"
                    class="rounded-lg border px-3 py-1.5 text-xs transition-colors"
                    :class="form.supportedLocales.includes(opt.value)
                      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-950/30 dark:text-primary-300'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'"
                    @click="toggleLocale(opt.value)"
                  >
                    {{ opt.label }}
                  </button>
                </div>
                <p class="mt-1 text-[10px] text-gray-400">不选 = 全语言</p>
              </div>

              <!-- 预设问题 -->
              <div>
                <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">预设问题</label>
                <div class="space-y-2">
                  <div v-for="(q, index) in form.presetQuestions" :key="index" class="flex items-center gap-2">
                    <UInput v-model="form.presetQuestions[index]" class="min-w-0 flex-1" size="sm" />
                    <UButton color="error" variant="ghost" icon="i-heroicons-trash" size="xs" class="shrink-0" @click="removeQuestion(index)" />
                  </div>
                  <div class="flex items-center gap-2">
                    <UInput
                      v-model="newQuestion"
                      placeholder="添加新问题..."
                      class="min-w-0 flex-1"
                      size="sm"
                      @keyup.enter="addQuestion"
                    />
                    <UButton color="primary" variant="soft" icon="i-heroicons-plus" size="xs" class="shrink-0" @click="addQuestion" />
                  </div>
                </div>
              </div>
            </div>

            <!-- SQL 技能 Tab -->
            <div v-show="activeTab === 'skills'" class="space-y-4">
              <p class="text-xs text-gray-500 dark:text-gray-400">
                SQL 技能会自动注册为 AI 工具。助手可通过 Function Calling 调用，执行参数化 SQL 查询并格式化结果。
              </p>

              <!-- 技能列表 -->
              <div v-for="(skill, index) in skills" :key="index" class="rounded-lg border border-gray-200 dark:border-gray-700">
                <!-- 技能标题行 -->
                <div
                  class="flex cursor-pointer items-center justify-between px-3 py-2"
                  @click="toggleSkill(index)"
                >
                  <span class="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {{ skill.name || `技能 ${index + 1}（未命名）` }}
                  </span>
                  <div class="flex items-center gap-1">
                    <UButton
                      color="error"
                      variant="ghost"
                      icon="i-heroicons-trash"
                      size="xs"
                      @click.stop="removeSkill(index)"
                    />
                    <UIcon
                      :name="expandedSkillIndex === index ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                      class="h-4 w-4 text-gray-400"
                    />
                  </div>
                </div>

                <!-- 技能编辑区 -->
                <div v-if="expandedSkillIndex === index" class="space-y-3 border-t border-gray-200 px-3 py-3 dark:border-gray-700">
                  <div>
                    <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">工具名称</label>
                    <UInput v-model="skill.name" size="sm" class="w-full" placeholder="如 top_active_members" />
                  </div>

                  <div>
                    <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">工具描述</label>
                    <UInput v-model="skill.description" size="sm" class="w-full" placeholder="查询最活跃成员排行" />
                  </div>

                  <div>
                    <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">参数定义（JSON Schema）</label>
                    <UTextarea v-model="skill.parametersJson" :rows="4" class="w-full font-mono text-xs" />
                  </div>

                  <div>
                    <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">SQL 查询（使用 @paramName 引用参数）</label>
                    <UTextarea v-model="skill.query" :rows="4" class="w-full font-mono text-xs" placeholder="SELECT sender_name, COUNT(*) as cnt FROM message WHERE ts > unixepoch('now', '-' || @days || ' days') GROUP BY sender_name ORDER BY cnt DESC LIMIT @limit" />
                  </div>

                  <div>
                    <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">行模板（{列名} 占位符）</label>
                    <UInput v-model="skill.rowTemplate" size="sm" class="w-full" placeholder="{sender_name}: {cnt} 条消息" />
                  </div>

                  <div>
                    <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">空结果提示</label>
                    <UInput v-model="skill.fallback" size="sm" class="w-full" placeholder="未找到相关数据" />
                  </div>

                  <div>
                    <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">汇总模板（可选，{rowCount} 为行数）</label>
                    <UInput v-model="skill.summaryTemplate" size="sm" class="w-full" placeholder="共找到 {rowCount} 条记录：" />
                  </div>
                </div>
              </div>

              <!-- 添加技能按钮 -->
              <button
                type="button"
                class="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 py-3 text-xs text-gray-500 transition-colors hover:border-primary-400 hover:text-primary-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-primary-500 dark:hover:text-primary-400"
                @click="addSkill"
              >
                <UIcon name="i-heroicons-plus" class="h-4 w-4" />
                添加 SQL 技能
              </button>
            </div>
          </div>

          <!-- Footer -->
          <div class="mt-6 flex items-center justify-between">
            <div>
              <UButton
                v-if="config?.builtinId"
                variant="outline"
                color="warning"
                :loading="isSaving"
                @click="handleReset"
              >
                恢复默认
              </UButton>
            </div>
            <div class="flex gap-2">
              <UButton variant="ghost" @click="closeModal">取消</UButton>
              <UButton color="primary" :loading="isSaving" @click="handleSave">保存</UButton>
            </div>
          </div>
        </template>
      </div>
    </template>
  </UModal>
</template>

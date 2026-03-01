<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAssistantStore } from '@/stores/assistant'
import AssistantCard from './AssistantCard.vue'

const props = defineProps<{
  chatType: 'group' | 'private'
  locale: string
}>()

const emit = defineEmits<{
  select: [id: string]
  configure: [id: string]
}>()

const assistantStore = useAssistantStore()
const { defaultAssistants, moreAssistants, hasMoreAssistants, isLoaded } = storeToRefs(assistantStore)

const showMore = ref(false)

watch(
  () => [props.chatType, props.locale],
  ([chatType, locale]) => {
    assistantStore.setFilterContext(chatType as 'group' | 'private', locale as string)
  },
  { immediate: true }
)

onMounted(async () => {
  if (!isLoaded.value) {
    await assistantStore.loadAssistants()
  }
  assistantStore.migrateOldPromptPresets()
})

function handleSelect(id: string) {
  emit('select', id)
}

function handleConfigure(id: string) {
  emit('configure', id)
}
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center p-8">
    <div class="w-full max-w-2xl">
      <!-- 标题 -->
      <div class="mb-8 text-center">
        <h2 class="mb-2 text-xl font-bold text-gray-900 dark:text-gray-100">
          选择一个助手开始对话
        </h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          每个助手擅长不同类型的分析任务，选择最适合你需求的助手
        </p>
      </div>

      <!-- 无可用助手提示 -->
      <div v-if="defaultAssistants.length === 0 && !hasMoreAssistants" class="py-8 text-center text-sm text-gray-400">
        当前场景暂无可用助手
      </div>

      <!-- 默认助手（前 4 个） -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AssistantCard
          v-for="assistant in defaultAssistants"
          :key="assistant.id"
          :assistant="assistant"
          @select="handleSelect"
          @configure="handleConfigure"
        />
      </div>

      <!-- 更多助手 -->
      <div v-if="hasMoreAssistants" class="mt-4">
        <button
          v-if="!showMore"
          class="mx-auto flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          @click="showMore = true"
        >
          <UIcon name="i-heroicons-chevron-down" class="h-4 w-4" />
          <span>更多助手 ({{ moreAssistants.length }})</span>
        </button>

        <Transition name="expand">
          <div v-if="showMore" class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AssistantCard
              v-for="assistant in moreAssistants"
              :key="assistant.id"
              :assistant="assistant"
              @select="handleSelect"
              @configure="handleConfigure"
            />
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease-out;
  overflow: hidden;
}
.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>

<script setup lang="ts">
defineProps<{
  questions: string[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [question: string]
}>()
</script>

<template>
  <div v-if="questions.length > 0" class="flex flex-wrap gap-2">
    <button
      v-for="(question, index) in questions"
      :key="index"
      class="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 transition-all hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-primary-600 dark:hover:bg-primary-950/30 dark:hover:text-primary-400"
      :disabled="disabled"
      @click="emit('select', question)"
    >
      {{ question }}
    </button>
  </div>
</template>

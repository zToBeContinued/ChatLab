<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWordFilterStore } from '@/stores/wordFilter'

const { t } = useI18n()
const wordFilterStore = useWordFilterStore()

const isOpen = computed({
  get: () => wordFilterStore.showWordFilterModal,
  set: (v) => (v ? wordFilterStore.openModal() : wordFilterStore.closeModal()),
})

const selectedSchemeId = ref<string | null>(null)
const editingName = ref('')
const newWordInput = ref('')
const nameInputRef = ref<HTMLInputElement | null>(null)

const selectedScheme = computed(() => {
  if (!selectedSchemeId.value) return null
  return wordFilterStore.getSchemeById(selectedSchemeId.value) ?? null
})

const isDefault = computed(() => {
  return selectedSchemeId.value === wordFilterStore.defaultSchemeId
})

watch(isOpen, (open) => {
  if (open) {
    if (wordFilterStore.schemes.length > 0 && !selectedSchemeId.value) {
      selectedSchemeId.value = wordFilterStore.schemes[0].id
    }
    syncEditingName()
  }
})

watch(selectedSchemeId, () => {
  syncEditingName()
  newWordInput.value = ''
})

function syncEditingName() {
  editingName.value = selectedScheme.value?.name ?? ''
}

function handleCreateScheme() {
  const scheme = wordFilterStore.createScheme(t('wordFilter.defaultSchemeName'))
  selectedSchemeId.value = scheme.id
  nextTick(() => {
    nameInputRef.value?.focus()
    nameInputRef.value?.select()
  })
}

function handleDeleteScheme() {
  if (!selectedSchemeId.value) return
  const idx = wordFilterStore.schemes.findIndex((s) => s.id === selectedSchemeId.value)
  wordFilterStore.deleteScheme(selectedSchemeId.value)
  if (wordFilterStore.schemes.length > 0) {
    const nextIdx = Math.min(idx, wordFilterStore.schemes.length - 1)
    selectedSchemeId.value = wordFilterStore.schemes[nextIdx].id
  } else {
    selectedSchemeId.value = null
  }
}

function handleNameChange() {
  if (!selectedSchemeId.value || !editingName.value.trim()) return
  wordFilterStore.updateScheme(selectedSchemeId.value, { name: editingName.value.trim() })
}

function handleToggleDefault() {
  if (!selectedSchemeId.value) return
  if (isDefault.value) {
    wordFilterStore.setDefaultScheme(null)
  } else {
    wordFilterStore.setDefaultScheme(selectedSchemeId.value)
  }
}

function handleAddWord() {
  if (!selectedSchemeId.value || !newWordInput.value.trim()) return
  const input = newWordInput.value.trim()
  const newWords = input
    .split(/[,，\n\r\t;；|、\s]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0)

  if (newWords.length === 0) return
  const scheme = selectedScheme.value
  if (!scheme) return

  const existingSet = new Set(scheme.words.map((w) => w.toLowerCase()))
  const uniqueNewWords = newWords.filter((w) => !existingSet.has(w.toLowerCase()))

  if (uniqueNewWords.length > 0) {
    wordFilterStore.updateScheme(selectedSchemeId.value, {
      words: [...scheme.words, ...uniqueNewWords],
    })
  }
  newWordInput.value = ''
}

function handleRemoveWord(word: string) {
  if (!selectedSchemeId.value) return
  const scheme = selectedScheme.value
  if (!scheme) return
  wordFilterStore.updateScheme(selectedSchemeId.value, {
    words: scheme.words.filter((w) => w !== word),
  })
}

function handleClearAllWords() {
  if (!selectedSchemeId.value) return
  wordFilterStore.updateScheme(selectedSchemeId.value, { words: [] })
}
</script>

<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'max-w-3xl z-50' }">
    <template #content>
      <div class="flex flex-col" style="height: 520px">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-white/5">
          <div class="flex items-center gap-3">
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-pink-400 to-pink-600">
              <UIcon name="i-heroicons-funnel" class="h-4.5 w-4.5 text-white" />
            </div>
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ t('wordFilter.title') }}
            </h2>
          </div>
          <UButton icon="i-heroicons-x-mark" variant="ghost" color="neutral" size="sm" @click="isOpen = false" />
        </div>

        <!-- Body: left-right split -->
        <div class="flex flex-1 overflow-hidden">
          <!-- Left: scheme list -->
          <div class="flex w-[200px] shrink-0 flex-col border-r border-gray-200 dark:border-white/5">
            <div class="flex items-center justify-between px-3 py-2">
              <span class="text-xs font-medium text-gray-500 dark:text-gray-400">
                {{ t('wordFilter.schemeList') }}
              </span>
              <UButton icon="i-heroicons-plus" size="xs" variant="ghost" color="primary" @click="handleCreateScheme" />
            </div>
            <div class="flex-1 overflow-y-auto px-2 pb-2">
              <div
                v-for="scheme in wordFilterStore.schemes"
                :key="scheme.id"
                class="group mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 transition-colors"
                :class="
                  selectedSchemeId === scheme.id
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5'
                "
                @click="selectedSchemeId = scheme.id"
              >
                <UIcon
                  v-if="scheme.id === wordFilterStore.defaultSchemeId"
                  name="i-heroicons-star-solid"
                  class="h-3.5 w-3.5 shrink-0 text-amber-500"
                />
                <span class="truncate text-sm">{{ scheme.name }}</span>
                <span class="ml-auto text-xs text-gray-400 dark:text-gray-500">{{ scheme.words.length }}</span>
              </div>
              <div
                v-if="wordFilterStore.schemes.length === 0"
                class="px-3 py-8 text-center text-xs text-gray-400 dark:text-gray-500"
              >
                {{ t('wordFilter.emptyScheme') }}
              </div>
            </div>
          </div>

          <!-- Right: scheme editor -->
          <div class="flex flex-1 flex-col overflow-hidden">
            <template v-if="selectedScheme">
              <div class="flex-1 space-y-4 overflow-y-auto p-5">
                <!-- Scheme name -->
                <div>
                  <label class="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    {{ t('wordFilter.schemeName') }}
                  </label>
                  <UInput
                    ref="nameInputRef"
                    v-model="editingName"
                    size="sm"
                    :placeholder="t('wordFilter.schemeNamePlaceholder')"
                    @blur="handleNameChange"
                    @keydown.enter="handleNameChange"
                  />
                </div>

                <!-- Actions -->
                <div class="flex items-center gap-2">
                  <UButton
                    size="xs"
                    :variant="isDefault ? 'solid' : 'soft'"
                    :color="isDefault ? 'warning' : 'neutral'"
                    :icon="isDefault ? 'i-heroicons-star-solid' : 'i-heroicons-star'"
                    @click="handleToggleDefault"
                  >
                    {{ isDefault ? t('wordFilter.isDefault') : t('wordFilter.setDefault') }}
                  </UButton>
                  <UButton size="xs" variant="soft" color="error" icon="i-heroicons-trash" @click="handleDeleteScheme">
                    {{ t('wordFilter.deleteScheme') }}
                  </UButton>
                </div>

                <!-- Add words -->
                <div>
                  <label class="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    {{ t('wordFilter.addWords') }}
                  </label>
                  <div class="flex gap-2">
                    <UInput
                      v-model="newWordInput"
                      size="sm"
                      class="flex-1"
                      :placeholder="t('wordFilter.addWordsPlaceholder')"
                      @keydown.enter="handleAddWord"
                    />
                    <UButton size="sm" color="primary" icon="i-heroicons-plus" @click="handleAddWord">
                      {{ t('wordFilter.add') }}
                    </UButton>
                  </div>
                </div>

                <!-- Word list -->
                <div>
                  <div class="mb-1.5 flex items-center justify-between">
                    <label class="text-xs font-medium text-gray-600 dark:text-gray-400">
                      {{ t('wordFilter.wordList') }}
                      <span class="ml-1 text-gray-400 dark:text-gray-500">({{ selectedScheme.words.length }})</span>
                    </label>
                    <UButton
                      v-if="selectedScheme.words.length > 0"
                      size="xs"
                      variant="ghost"
                      color="error"
                      @click="handleClearAllWords"
                    >
                      {{ t('wordFilter.clearAll') }}
                    </UButton>
                  </div>
                  <div
                    v-if="selectedScheme.words.length > 0"
                    class="flex max-h-[220px] flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-gray-200 p-3 dark:border-white/5"
                  >
                    <UBadge
                      v-for="word in selectedScheme.words"
                      :key="word"
                      color="neutral"
                      variant="subtle"
                      class="group/badge cursor-default gap-1 pr-1"
                    >
                      {{ word }}
                      <UIcon
                        name="i-heroicons-x-mark"
                        class="h-3.5 w-3.5 cursor-pointer text-gray-400 transition-colors hover:text-red-500"
                        @click="handleRemoveWord(word)"
                      />
                    </UBadge>
                  </div>
                  <div
                    v-else
                    class="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-xs text-gray-400 dark:border-gray-600 dark:text-gray-500"
                  >
                    {{ t('wordFilter.emptyWords') }}
                  </div>
                </div>
              </div>
              <!-- Footer with close button -->
              <div class="flex shrink-0 justify-end border-t border-gray-200 px-5 py-3 dark:border-white/5">
                <UButton color="primary" variant="soft" @click="isOpen = false">
                  {{ t('wordFilter.close') }}
                </UButton>
              </div>
            </template>

            <!-- No scheme selected -->
            <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-500">
              <UIcon name="i-heroicons-funnel" class="h-10 w-10" />
              <p class="text-sm">{{ t('wordFilter.selectOrCreate') }}</p>
              <UButton size="sm" color="primary" variant="soft" icon="i-heroicons-plus" @click="handleCreateScheme">
                {{ t('wordFilter.createScheme') }}
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

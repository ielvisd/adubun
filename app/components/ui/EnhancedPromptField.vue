<template>
  <div class="space-y-3">
    <!-- Main Textarea -->
    <div class="relative">
      <UTextarea
        :model-value="modelValue"
        @update:model-value="handleInput"
        placeholder="Example: Energetic ad for AlaniNu energy drink targeting Gen-Z fitness enthusiasts"
        :rows="4"
        class="w-full"
        :disabled="disabled"
      />
      
      <!-- Quality Indicator -->
      <div v-if="modelValue.length >= minLength" class="absolute top-3 right-3">
        <div class="flex items-center gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-full text-xs font-medium">
          <UIcon name="i-heroicons-check-circle-solid" class="w-4 h-4" />
          <span>Good!</span>
        </div>
      </div>
    </div>

    <!-- Footer: Suggestions + Character Count -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <!-- Prompt Suggestions -->
      <div class="flex-1">
        <button
          v-if="!showSuggestions"
          type="button"
          @click="showSuggestions = true"
          class="text-sm text-secondary-600 dark:text-secondary-400 hover:text-secondary-700 dark:hover:text-secondary-300 font-medium flex items-center gap-1"
        >
          <UIcon name="i-heroicons-light-bulb" class="w-4 h-4" />
          <span>Need inspiration?</span>
        </button>
        
        <div v-else class="space-y-2">
          <p class="text-xs font-medium text-gray-700 dark:text-gray-300">Quick add:</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="suggestion in suggestions"
              :key="suggestion"
              type="button"
              @click="addSuggestion(suggestion)"
              class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md transition-colors"
            >
              + {{ suggestion }}
            </button>
          </div>
          <button
            type="button"
            @click="showSuggestions = false"
            class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            Hide
          </button>
        </div>
      </div>

      <!-- Character Count -->
      <div class="flex items-center gap-2 text-sm">
        <span
          :class="[
            'font-medium',
            characterStatus === 'good' ? 'text-green-600 dark:text-green-400' :
            characterStatus === 'warning' ? 'text-orange-600 dark:text-orange-400' :
            characterStatus === 'error' ? 'text-red-600 dark:text-red-400' :
            'text-gray-500 dark:text-gray-400'
          ]"
        >
          {{ modelValue.length }}
        </span>
        <span class="text-gray-400 dark:text-gray-500">/</span>
        <span class="text-gray-500 dark:text-gray-400">{{ maxLength }}</span>
        
        <!-- Status Icon -->
        <UIcon
          v-if="characterStatus === 'good'"
          name="i-heroicons-check-circle"
          class="w-4 h-4 text-green-600 dark:text-green-400"
        />
        <UIcon
          v-else-if="characterStatus === 'error'"
          name="i-heroicons-exclamation-circle"
          class="w-4 h-4 text-red-600 dark:text-red-400"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  disabled?: boolean
  minLength?: number
  maxLength?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const minLength = props.minLength || 50
const maxLength = props.maxLength || 1000

const showSuggestions = ref(false)

// Prompt suggestion options
const suggestions = [
  'targeting Gen-Z',
  'with luxury aesthetics',
  'fast-paced editing',
  'warm and inviting tone',
  'modern minimalist style',
  'featuring diverse people',
  'cinematic look',
  'vibrant colors',
]

const characterStatus = computed(() => {
  const length = props.modelValue.length
  if (length >= minLength && length <= maxLength) return 'good'
  if (length > maxLength) return 'error'
  if (length > 0 && length < minLength) return 'warning'
  return 'empty'
})

const handleInput = (value: string) => {
  emit('update:modelValue', value)
}

const addSuggestion = (suggestion: string) => {
  const currentValue = props.modelValue.trim()
  const newValue = currentValue
    ? `${currentValue} ${suggestion}`
    : suggestion
  emit('update:modelValue', newValue)
}
</script>


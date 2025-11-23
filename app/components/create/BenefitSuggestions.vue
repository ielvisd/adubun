<template>
  <div class="space-y-3">
    <!-- Suggestion Chips -->
    <div v-if="suggestions.length > 0" class="flex flex-wrap gap-2">
      <button
        v-for="(suggestion, index) in suggestions"
        :key="index"
        :class="[
          'px-4 py-2 rounded-full text-sm font-medium transition-all',
          'border-2',
          'active:scale-95',
          isSelected(suggestion)
            ? 'border-secondary-500 bg-secondary-50 dark:bg-secondary-900/20 text-secondary-700 dark:text-secondary-300'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300',
        ]"
        @click="handleSuggestionClick(suggestion)"
      >
        {{ suggestion }}
      </button>
    </div>

    <!-- Input Field with 4-word max enforcement -->
    <div>
      <UInput
        :model-value="modelValue"
        placeholder="Enter your magic benefit (4 words max)"
        class="w-full"
        :maxlength="maxLength"
        @update:model-value="handleInput"
        @keydown="handleKeydown"
      />
      <div class="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span v-if="wordCount > 0">
          {{ wordCount }} / 4 words
        </span>
        <span v-else class="text-gray-400">
          Maximum 4 words
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  suggestions: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const wordCount = computed(() => {
  if (!props.modelValue.trim()) return 0
  return props.modelValue.trim().split(/\s+/).length
})

const maxLength = computed(() => {
  // Estimate max length: ~10 chars per word * 4 words + 3 spaces = ~43 chars
  // But we'll enforce via word count, not character count
  return 100 // High limit, actual enforcement via word count
})

const isSelected = (suggestion: string) => {
  return props.modelValue.trim().toLowerCase() === suggestion.trim().toLowerCase()
}

const handleSuggestionClick = (suggestion: string) => {
  // Check if suggestion is 4 words or less
  const words = suggestion.trim().split(/\s+/)
  if (words.length <= 4) {
    emit('update:modelValue', suggestion)
  }
}

const handleInput = (value: string) => {
  const words = value.trim().split(/\s+/)
  
  // Strict enforcement: only allow up to 4 words
  if (words.length > 4) {
    // Take only first 4 words
    const truncated = words.slice(0, 4).join(' ')
    emit('update:modelValue', truncated)
  } else {
    emit('update:modelValue', value)
  }
}

const handleKeydown = (event: KeyboardEvent) => {
  const currentWords = props.modelValue.trim().split(/\s+/)
  
  // Prevent adding more words if already at 4 words
  // Allow backspace, delete, arrow keys, etc.
  const allowedKeys = [
    'Backspace',
    'Delete',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End',
    'Tab',
  ]
  
  if (allowedKeys.includes(event.key)) {
    return // Allow these keys
  }
  
  // If we're at 4 words and user tries to type a space or character
  if (currentWords.length >= 4 && currentWords[currentWords.length - 1] !== '') {
    // If it's a space, prevent it
    if (event.key === ' ') {
      event.preventDefault()
      return
    }
    // If it's a character and the last word exists, allow it (editing the last word)
    // But if last word is empty (trailing space), prevent adding new word
    if (event.key === ' ' && props.modelValue.endsWith(' ')) {
      event.preventDefault()
    }
  }
}
</script>



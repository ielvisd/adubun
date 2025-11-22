<template>
  <button
    v-if="isSupported"
    type="button"
    :class="[
      'inline-flex items-center justify-center rounded-md p-2 transition-all duration-200',
      'focus:outline-none focus:ring-2 focus:ring-offset-2',
      isListening
        ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 focus:ring-red-500 animate-pulse'
        : error
          ? 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 focus:ring-orange-500'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 focus:ring-gray-500'
    ]"
    :disabled="disabled"
    :aria-label="isListening ? 'Stop voice input' : 'Start voice input'"
    :title="isListening ? 'Stop voice input (Ctrl+Shift+V)' : 'Start voice input (Ctrl+Shift+V)'"
    @click="handleClick"
  >
    <UIcon
      v-if="error && !isListening"
      name="i-heroicons-exclamation-triangle"
      class="w-5 h-5"
    />
    <UIcon
      v-else
      name="i-heroicons-microphone"
      class="w-5 h-5"
    />
    <span v-if="error && !isListening" class="sr-only">{{ error }}</span>
  </button>
</template>

<script setup lang="ts">
interface Props {
  isSupported: boolean
  isListening: boolean
  error: string | null
  disabled?: boolean
}

interface Emits {
  (e: 'click'): void
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<Emits>()

const handleClick = () => {
  if (!props.disabled) {
    emit('click')
  }
}
</script>


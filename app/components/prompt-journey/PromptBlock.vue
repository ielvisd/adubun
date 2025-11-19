<template>
  <div class="prompt-block">
    <div class="flex items-center justify-between mb-2">
      <label class="text-sm font-semibold text-gray-700 dark:text-gray-300">
        {{ label }}
      </label>
      <div class="flex items-center gap-2">
        <UButton
          v-if="collapsible"
          size="xs"
          variant="ghost"
          color="gray"
          @click="isCollapsed = !isCollapsed"
        >
          <UIcon :name="isCollapsed ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-up'" />
          {{ isCollapsed ? 'Expand' : 'Collapse' }}
        </UButton>
        <UButton
          size="xs"
          variant="ghost"
          color="gray"
          @click="copyContent"
        >
          <UIcon :name="copied ? 'i-heroicons-check' : 'i-heroicons-clipboard'" />
          {{ copied ? 'Copied!' : 'Copy' }}
        </UButton>
      </div>
    </div>
    
    <div 
      v-show="!isCollapsed"
      :class="[
        'rounded-lg border p-4 font-mono text-sm overflow-x-auto',
        compact ? 'max-h-32' : 'max-h-96',
        'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700',
        'text-gray-800 dark:text-gray-200'
      ]"
    >
      <pre class="whitespace-pre-wrap break-words">{{ content }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  label: string
  content: string
  language?: string
  collapsible?: boolean
  compact?: boolean
}>()

const isCollapsed = ref(props.collapsible ? true : false)
const copied = ref(false)

const copyContent = async () => {
  try {
    await navigator.clipboard.writeText(props.content)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (error) {
    console.error('Failed to copy:', error)
  }
}
</script>



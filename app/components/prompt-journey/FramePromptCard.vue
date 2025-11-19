<template>
  <div class="frame-card">
    <div class="relative aspect-video bg-gray-200 dark:bg-gray-800 rounded-lg overflow-hidden mb-2">
      <img 
        v-if="frame.imageUrl" 
        :src="frame.imageUrl" 
        :alt="frame.label"
        class="w-full h-full object-cover"
      />
      <div v-else class="flex items-center justify-center h-full">
        <UIcon name="i-heroicons-photo" class="w-8 h-8 text-gray-400" />
      </div>
      <div class="absolute top-2 left-2">
        <UBadge color="gray" size="xs">{{ frame.label }}</UBadge>
      </div>
    </div>
    <div class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
      {{ frame.prompt || 'No prompt' }}
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  frame: {
    label: string
    prompt: string
    imageUrl?: string
  }
  index: number
}>()
</script>

<style scoped>
.frame-card {
  @apply p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow;
}
</style>


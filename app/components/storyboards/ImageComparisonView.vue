<template>
  <div class="space-y-4">
    <!-- Comparison Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Original Image -->
      <div class="space-y-2">
        <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300">
          Original
        </label>
        <div class="relative bg-black rounded-lg overflow-hidden border-2 border-gray-300 dark:border-gray-600" style="height: 400px;">
          <img
            :src="originalUrl"
            alt="Original image"
            class="w-full h-full object-contain"
          />
        </div>
      </div>

      <!-- Edited Image -->
      <div class="space-y-2">
        <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300">
          AI Edited
        </label>
        <div class="relative bg-black rounded-lg overflow-hidden border-2 border-primary-500 dark:border-primary-400" style="height: 400px;">
          <!-- Loading State -->
          <div v-if="loading" class="w-full h-full flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800">
            <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 text-primary-500 animate-spin mb-3" />
            <p class="text-sm text-gray-600 dark:text-gray-400">Generating edited image...</p>
          </div>
          
          <!-- Edited Image -->
          <img
            v-else-if="editedUrl"
            :src="editedUrl"
            alt="Edited image"
            class="w-full h-full object-contain"
          />
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
      <UButton
        color="red"
        variant="outline"
        size="lg"
        @click="$emit('reject')"
        :disabled="loading"
      >
        <UIcon name="i-heroicons-x-mark" class="mr-2" />
        Reject
      </UButton>
      <UButton
        color="green"
        variant="solid"
        size="lg"
        @click="$emit('accept')"
        :disabled="loading || !editedUrl"
      >
        <UIcon name="i-heroicons-check" class="mr-2" />
        Accept & Replace
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  originalUrl: string
  editedUrl: string | null
  loading: boolean
}>()

defineEmits<{
  accept: []
  reject: []
}>()
</script>


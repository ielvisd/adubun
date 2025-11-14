<template>
  <UCard>
    <template #header>
      <h3 class="text-xl font-semibold">Generated Assets</h3>
    </template>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="(asset, idx) in assets"
        :key="idx"
        class="border rounded-lg p-4"
      >
        <div class="aspect-video bg-gray-900 rounded mb-2 flex items-center justify-center">
          <UIcon
            v-if="asset.status === 'pending'"
            name="i-heroicons-clock"
            class="w-12 h-12 text-gray-400"
          />
          <UIcon
            v-else-if="asset.status === 'processing'"
            name="i-heroicons-arrow-path"
            class="w-12 h-12 text-accent-500 animate-spin"
          />
          <UIcon
            v-else-if="asset.status === 'failed'"
            name="i-heroicons-x-circle"
            class="w-12 h-12 text-error-500"
          />
          <video
            v-else-if="asset.videoUrl"
            :src="asset.videoUrl"
            class="w-full h-full object-cover rounded"
            controls
          />
        </div>
        <p class="text-sm font-medium">Segment {{ asset.segmentId + 1 }}</p>
        <UBadge :color="getStatusColor(asset.status)" size="sm" class="mt-1">
          {{ asset.status }}
        </UBadge>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { Asset } from '~/app/types/generation'

const props = defineProps<{
  assets: Asset[]
}>()

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    completed: 'success',
    failed: 'error',
    processing: 'accent',
    pending: 'neutral',
  }
  return colors[status] || 'neutral'
}
</script>


<template>
  <UCard class="letsignit-card">
    <template #header>
      <h3 class="text-2xl font-semibold text-black">Video Storyboard</h3>
    </template>

    <div class="space-y-4">
      <div
        v-for="(segment, idx) in storyboard.segments"
        :key="idx"
        class="flex gap-4 p-6 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow"
      >
        <div class="flex-shrink-0">
          <UBadge :color="getSegmentColor(segment.type)" size="lg">
            {{ segment.type }}
          </UBadge>
        </div>
        
        <div class="flex-1">
          <p class="font-medium">{{ segment.description }}</p>
          <p class="text-sm text-gray-500 mt-1">
            {{ segment.startTime }}s - {{ segment.endTime }}s
          </p>
        </div>

        <div class="flex-shrink-0">
          <UButton
            icon="i-heroicons-pencil"
            size="sm"
            variant="ghost"
            @click="editSegment(idx)"
          />
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { Storyboard } from '~/app/types/generation'

const props = defineProps<{
  storyboard: Storyboard
}>()

const emit = defineEmits<{
  edit: [index: number]
}>()

const getSegmentColor = (type: string) => {
  const colors: Record<string, string> = {
    hook: 'secondary',
    body: 'primary',
    cta: 'success',
  }
  return colors[type] || 'neutral'
}

const editSegment = (idx: number) => {
  emit('edit', idx)
}
</script>


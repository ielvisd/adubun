<template>
  <div 
    class="relative rounded-lg border border-gray-200 bg-white overflow-hidden transition-all hover:shadow-md"
    :class="{ 
      'border-blue-200 bg-blue-50': isLoading, 
      'border-red-200 bg-red-50': hasError 
    }"
  >
    <div class="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
      <div class="flex flex-col">
        <span class="text-xs font-semibold text-gray-900">{{ typeLabel }}</span>
        <span class="text-xs text-gray-500">{{ segmentLabel }}</span>
      </div>
      <UBadge :color="statusColor" variant="subtle" size="xs">
        {{ statusLabel }}
      </UBadge>
    </div>

    <div class="relative aspect-video bg-gray-100 flex items-center justify-center">
      <div v-if="isLoading" class="flex flex-col items-center justify-center p-6">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl" />
        <p class="text-sm text-gray-500 mt-2">Generating keyframe...</p>
      </div>

      <div v-else-if="hasError" class="flex flex-col items-center justify-center p-6">
        <UIcon name="i-heroicons-exclamation-triangle" class="text-2xl text-red-500" />
        <p class="text-sm text-red-600 mt-2">{{ error }}</p>
        <UButton v-if="onRetry" size="xs" color="red" variant="soft" @click="onRetry" class="mt-2">
          Retry
        </UButton>
      </div>

      <div v-else-if="imageUrl" class="relative w-full h-full group">
        <img 
          :src="imageUrl" 
          :alt="`${typeLabel} for ${segmentLabel}`"
          class="w-full h-full object-cover"
          @load="onImageLoad"
          @error="onImageError"
        />
        
        <!-- Enhanced prompt overlay (shows on hover) -->
        <div v-if="enhancedPrompt" class="absolute inset-0 bg-black bg-opacity-75 opacity-0 group-hover:opacity-100 transition-opacity p-4 overflow-auto">
          <div class="text-white">
            <h4 class="text-xs font-semibold mb-1">Enhanced Prompt</h4>
            <p class="text-xs opacity-90 line-clamp-3">{{ enhancedPrompt }}</p>
          </div>
        </div>
      </div>

      <div v-else class="flex flex-col items-center justify-center p-6">
        <UIcon name="i-heroicons-photo" class="text-3xl text-gray-400" />
        <p class="text-xs text-gray-500 mt-2">No keyframe generated</p>
      </div>
    </div>

    <div v-if="metadata" class="flex items-center gap-3 px-3 py-2 bg-gray-50 border-t border-gray-200 text-gray-600">
      <div class="flex items-center gap-1">
        <UIcon name="i-heroicons-clock" class="text-xs" />
        <span class="text-xs">{{ formattedTime }}</span>
      </div>
      <div v-if="metadata.resolution" class="flex items-center gap-1">
        <UIcon name="i-heroicons-photo" class="text-xs" />
        <span class="text-xs">{{ metadata.resolution }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface KeyframeMetadata {
  resolution?: string
  generatedAt?: number
  predictionId?: string
}

interface Props {
  /** Type of keyframe: first or last */
  type: 'first' | 'last'
  /** Segment type */
  segmentType: 'hook' | 'body' | 'cta'
  /** Segment index */
  segmentIndex: number
  /** Image URL */
  imageUrl?: string
  /** Enhanced prompt used for generation */
  enhancedPrompt?: string
  /** Current status */
  status?: 'pending' | 'generating' | 'completed' | 'failed'
  /** Error message if failed */
  error?: string
  /** Additional metadata */
  metadata?: KeyframeMetadata
  /** Retry callback */
  onRetry?: () => void
}

const props = withDefaults(defineProps<Props>(), {
  status: 'pending',
})

// Computed properties
const typeLabel = computed(() => {
  return props.type === 'first' ? 'First Frame' : 'Last Frame'
})

const segmentLabel = computed(() => {
  const types = {
    hook: 'Hook',
    body: 'Body',
    cta: 'CTA',
  }
  return `${types[props.segmentType]} ${props.segmentIndex + 1}`
})

const isLoading = computed(() => {
  return props.status === 'generating' || props.status === 'pending'
})

const hasError = computed(() => {
  return props.status === 'failed' || !!props.error
})

const statusColor = computed(() => {
  switch (props.status) {
    case 'completed':
      return 'green'
    case 'generating':
    case 'pending':
      return 'blue'
    case 'failed':
      return 'red'
    default:
      return 'gray'
  }
})

const statusLabel = computed(() => {
  switch (props.status) {
    case 'completed':
      return 'Ready'
    case 'generating':
      return 'Generating'
    case 'pending':
      return 'Pending'
    case 'failed':
      return 'Failed'
    default:
      return 'Unknown'
  }
})

const formattedTime = computed(() => {
  if (!props.metadata?.generatedAt) return 'N/A'
  const date = new Date(props.metadata.generatedAt)
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit',
  })
})

// Event handlers
function onImageLoad() {
  console.log('[KeyframePreview] Image loaded:', props.imageUrl)
}

function onImageError() {
  console.error('[KeyframePreview] Image failed to load:', props.imageUrl)
}
</script>


<template>
  <div class="keyframe-preview" :class="{ 'is-loading': isLoading, 'has-error': hasError }">
    <div class="keyframe-header">
      <div class="keyframe-label">
        <span class="keyframe-type">{{ typeLabel }}</span>
        <span class="keyframe-segment">{{ segmentLabel }}</span>
      </div>
      <UBadge :color="statusColor" variant="subtle" size="xs">
        {{ statusLabel }}
      </UBadge>
    </div>

    <div class="keyframe-image-container">
      <div v-if="isLoading" class="keyframe-loading">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl" />
        <p class="text-sm text-gray-500 mt-2">Generating keyframe...</p>
      </div>

      <div v-else-if="hasError" class="keyframe-error">
        <UIcon name="i-heroicons-exclamation-triangle" class="text-2xl text-red-500" />
        <p class="text-sm text-red-600 mt-2">{{ error }}</p>
        <UButton v-if="onRetry" size="xs" color="red" variant="soft" @click="onRetry" class="mt-2">
          Retry
        </UButton>
      </div>

      <div v-else-if="imageUrl" class="keyframe-image-wrapper">
        <img 
          :src="imageUrl" 
          :alt="`${typeLabel} for ${segmentLabel}`"
          class="keyframe-image"
          @load="onImageLoad"
          @error="onImageError"
        />
        
        <!-- Enhanced prompt overlay (shows on hover) -->
        <div v-if="enhancedPrompt" class="keyframe-overlay">
          <div class="keyframe-overlay-content">
            <h4 class="text-xs font-semibold mb-1">Enhanced Prompt</h4>
            <p class="text-xs opacity-90 line-clamp-3">{{ enhancedPrompt }}</p>
          </div>
        </div>
      </div>

      <div v-else class="keyframe-placeholder">
        <UIcon name="i-heroicons-photo" class="text-3xl text-gray-400" />
        <p class="text-xs text-gray-500 mt-2">No keyframe generated</p>
      </div>
    </div>

    <div v-if="metadata" class="keyframe-metadata">
      <div class="metadata-item">
        <UIcon name="i-heroicons-clock" class="text-xs" />
        <span class="text-xs">{{ formattedTime }}</span>
      </div>
      <div v-if="metadata.resolution" class="metadata-item">
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

<style scoped>
.keyframe-preview {
  @apply relative rounded-lg border border-gray-200 bg-white overflow-hidden transition-all;
}

.keyframe-preview:hover {
  @apply shadow-md;
}

.keyframe-preview.is-loading {
  @apply border-blue-200 bg-blue-50;
}

.keyframe-preview.has-error {
  @apply border-red-200 bg-red-50;
}

.keyframe-header {
  @apply flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200;
}

.keyframe-label {
  @apply flex flex-col;
}

.keyframe-type {
  @apply text-xs font-semibold text-gray-900;
}

.keyframe-segment {
  @apply text-xs text-gray-500;
}

.keyframe-image-container {
  @apply relative aspect-video bg-gray-100 flex items-center justify-center;
}

.keyframe-loading,
.keyframe-error,
.keyframe-placeholder {
  @apply flex flex-col items-center justify-center p-6;
}

.keyframe-image-wrapper {
  @apply relative w-full h-full group;
}

.keyframe-image {
  @apply w-full h-full object-cover;
}

.keyframe-overlay {
  @apply absolute inset-0 bg-black bg-opacity-75 opacity-0 group-hover:opacity-100 transition-opacity p-4 overflow-auto;
}

.keyframe-overlay-content {
  @apply text-white;
}

.keyframe-metadata {
  @apply flex items-center gap-3 px-3 py-2 bg-gray-50 border-t border-gray-200 text-gray-600;
}

.metadata-item {
  @apply flex items-center gap-1;
}
</style>


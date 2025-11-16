<template>
  <div class="keyframe-grid">
    <div class="keyframe-grid-header">
      <div>
        <h3 class="text-lg font-semibold text-gray-900">Keyframe Gallery</h3>
        <p class="text-sm text-gray-500 mt-1">
          {{ totalKeyframes }} keyframes • {{ completedCount }}/{{ totalKeyframes }} generated
        </p>
      </div>
      
      <div class="keyframe-grid-actions">
        <UButton 
          v-if="onGenerateAll && hasUngenerated"
          size="sm" 
          color="primary"
          :loading="isGeneratingAll"
          @click="onGenerateAll"
        >
          Generate All Keyframes
        </UButton>

        <UButton 
          v-if="onRefreshStatus"
          size="sm" 
          variant="soft"
          icon="i-heroicons-arrow-path"
          :loading="isRefreshing"
          @click="onRefreshStatus"
        >
          Refresh Status
        </UButton>
      </div>
    </div>

    <!-- Progress bar -->
    <div v-if="showProgress" class="keyframe-progress">
      <div class="progress-bar-container">
        <div 
          class="progress-bar" 
          :style="{ width: `${progressPercentage}%` }"
        />
      </div>
      <span class="text-xs text-gray-600">{{ progressPercentage }}% complete</span>
    </div>

    <!-- Grid view -->
    <div class="keyframe-grid-content" :class="gridLayoutClass">
      <div 
        v-for="(segment, segmentIndex) in segments" 
        :key="`segment-${segmentIndex}`"
        class="segment-keyframes"
      >
        <div class="segment-header">
          <h4 class="text-sm font-semibold text-gray-700">
            {{ getSegmentLabel(segment.type, segmentIndex) }}
          </h4>
          <span class="text-xs text-gray-500">
            {{ segment.startTime }}s - {{ segment.endTime }}s
          </span>
        </div>

        <div class="keyframe-pair">
          <!-- First frame -->
          <KeyframePreview
            type="first"
            :segment-type="segment.type"
            :segment-index="segmentIndex"
            :image-url="segment.firstFrameUrl"
            :enhanced-prompt="segment.enhancedPrompt"
            :status="segment.keyframeStatus"
            :error="segment.keyframeError"
            :metadata="{
              resolution: resolution,
              generatedAt: segment.keyframesGeneratedAt,
              predictionId: segment.firstFramePredictionId,
            }"
            :on-retry="() => onRetrySegment(segmentIndex, 'first')"
          />

          <!-- Last frame -->
          <KeyframePreview
            type="last"
            :segment-type="segment.type"
            :segment-index="segmentIndex"
            :image-url="segment.lastFrameUrl"
            :enhanced-prompt="segment.enhancedPrompt"
            :status="segment.keyframeStatus"
            :error="segment.keyframeError"
            :metadata="{
              resolution: resolution,
              generatedAt: segment.keyframesGeneratedAt,
              predictionId: segment.lastFramePredictionId,
            }"
            :on-retry="() => onRetrySegment(segmentIndex, 'last')"
          />
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="segments.length === 0" class="keyframe-empty">
      <UIcon name="i-heroicons-photo" class="text-4xl text-gray-400" />
      <h4 class="text-base font-semibold text-gray-700 mt-3">No Segments Yet</h4>
      <p class="text-sm text-gray-500 mt-1">
        Generate a storyboard first to see keyframes here
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import KeyframePreview from './KeyframePreview.vue'
import type { Segment } from '~/types/generation'

interface Props {
  /** Array of segments with keyframe data */
  segments: Segment[]
  /** Target resolution for keyframes */
  resolution?: '1K' | '2K' | '4K'
  /** Grid layout: compact or comfortable */
  layout?: 'compact' | 'comfortable'
  /** Show progress bar */
  showProgress?: boolean
  /** Is generating all keyframes */
  isGeneratingAll?: boolean
  /** Is refreshing status */
  isRefreshing?: boolean
  /** Callback to generate all keyframes */
  onGenerateAll?: () => void
  /** Callback to refresh status */
  onRefreshStatus?: () => void
  /** Callback to retry a specific keyframe */
  onRetrySegment?: (segmentIndex: number, type: 'first' | 'last') => void
}

const props = withDefaults(defineProps<Props>(), {
  resolution: '2K',
  layout: 'comfortable',
  showProgress: true,
  isGeneratingAll: false,
  isRefreshing: false,
})

// Computed properties
const totalKeyframes = computed(() => props.segments.length * 2)

const completedCount = computed(() => {
  return props.segments.filter(s => s.keyframeStatus === 'completed').length * 2
})

const progressPercentage = computed(() => {
  if (totalKeyframes.value === 0) return 0
  return Math.round((completedCount.value / totalKeyframes.value) * 100)
})

const hasUngenerated = computed(() => {
  return props.segments.some(s => 
    !s.keyframeStatus || 
    s.keyframeStatus === 'pending' || 
    s.keyframeStatus === 'failed'
  )
})

const gridLayoutClass = computed(() => {
  return props.layout === 'compact' ? 'grid-compact' : 'grid-comfortable'
})

// Helper functions
function getSegmentLabel(type: 'hook' | 'body' | 'cta', index: number): string {
  const labels = {
    hook: 'Hook',
    body: 'Body',
    cta: 'CTA',
  }
  return `${labels[type]} ${index + 1}`
}
</script>

<style scoped>
.keyframe-grid {
  @apply space-y-4;
}

.keyframe-grid-header {
  @apply flex items-start justify-between gap-4 pb-4 border-b border-gray-200;
}

.keyframe-grid-actions {
  @apply flex items-center gap-2;
}

.keyframe-progress {
  @apply flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200;
}

.progress-bar-container {
  @apply flex-1 h-2 bg-blue-100 rounded-full overflow-hidden;
}

.progress-bar {
  @apply h-full bg-blue-500 transition-all duration-300 ease-out;
}

.keyframe-grid-content {
  @apply space-y-6;
}

.keyframe-grid-content.grid-comfortable {
  @apply space-y-6;
}

.keyframe-grid-content.grid-compact {
  @apply space-y-4;
}

.segment-keyframes {
  @apply space-y-3;
}

.segment-header {
  @apply flex items-center justify-between;
}

.keyframe-pair {
  @apply grid grid-cols-1 md:grid-cols-2 gap-4;
}

.keyframe-empty {
  @apply flex flex-col items-center justify-center py-12 text-center;
}
</style>


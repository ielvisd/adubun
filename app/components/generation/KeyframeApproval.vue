<template>
  <div class="space-y-8">
    <!-- Header -->
    <div class="text-center">
      <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        Review Scene Images
      </h2>
      <p class="text-lg text-gray-600 dark:text-gray-400">
        Preview the generated keyframes for each scene before proceeding to video generation
      </p>
    </div>

    <!-- Keyframe Grid -->
    <div class="space-y-6">
      <div
        v-for="(segment, idx) in segments"
        :key="idx"
        class="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden"
      >
        <!-- Segment Header -->
        <div class="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ getSegmentTitle(segment.type) }} ({{ (segment.endTime - segment.startTime).toFixed(1) }}s)
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {{ segment.description }}
              </p>
            </div>
            <div v-if="segment.keyframeStatus === 'completed'" class="flex items-center text-green-600 dark:text-green-400">
              <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
              </svg>
              <span class="text-sm font-medium">Generated</span>
            </div>
            <div v-else-if="segment.keyframeStatus === 'pending'" class="flex items-center text-blue-600 dark:text-blue-400">
              <svg class="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span class="text-sm font-medium">Generating...</span>
            </div>
            <div v-else-if="segment.keyframeStatus === 'failed'" class="flex items-center text-red-600 dark:text-red-400">
              <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
              </svg>
              <span class="text-sm font-medium">Failed</span>
            </div>
          </div>
        </div>

        <!-- Keyframe Images -->
        <div v-if="segment.keyframeStatus === 'completed'" class="p-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- First Frame -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  First Frame
                </h4>
                <span class="text-xs text-gray-500 dark:text-gray-400">
                  Start of scene
                </span>
              </div>
              <div class="aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-600">
                <img
                  v-if="segment.firstFrameUrl"
                  :src="segment.firstFrameUrl"
                  :alt="`First frame for ${getSegmentTitle(segment.type)}`"
                  class="w-full h-full object-cover"
                  @error="handleImageError"
                />
                <div v-else class="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                  <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            </div>

            <!-- Last Frame -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  Last Frame
                </h4>
                <span class="text-xs text-gray-500 dark:text-gray-400">
                  End of scene
                </span>
              </div>
              <div class="aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-600">
                <img
                  v-if="segment.lastFrameUrl"
                  :src="segment.lastFrameUrl"
                  :alt="`Last frame for ${getSegmentTitle(segment.type)}`"
                  class="w-full h-full object-cover"
                  @error="handleImageError"
                />
                <div v-else class="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                  <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <!-- Enhanced Prompt (Optional Expand) -->
          <div v-if="segment.enhancedPrompt" class="mt-4">
            <details class="group">
              <summary class="cursor-pointer text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors list-none flex items-center gap-2">
                <svg class="w-4 h-4 transition-transform group-open:rotate-90" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                </svg>
                View Enhanced Prompt
              </summary>
              <p class="mt-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                {{ segment.enhancedPrompt }}
              </p>
            </details>
          </div>
        </div>

        <!-- Loading State -->
        <div v-else-if="segment.keyframeStatus === 'pending'" class="p-6">
          <div class="flex items-center justify-center py-12">
            <div class="text-center">
              <svg class="animate-spin h-12 w-12 text-blue-600 dark:text-blue-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p class="text-sm text-gray-600 dark:text-gray-400">Generating keyframes...</p>
            </div>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="segment.keyframeStatus === 'failed'" class="p-6">
          <div class="flex items-center justify-center py-12">
            <div class="text-center">
              <svg class="h-12 w-12 text-red-600 dark:text-red-400 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
              </svg>
              <p class="text-sm text-red-600 dark:text-red-400 font-medium">Failed to generate keyframes</p>
              <p v-if="segment.keyframeError" class="text-xs text-gray-500 dark:text-gray-400 mt-2">{{ segment.keyframeError }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-700">
      <button
        type="button"
        @click="$emit('regenerate')"
        class="px-6 py-3 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
      >
        Regenerate Keyframes
      </button>
      
      <button
        type="button"
        @click="$emit('approve')"
        :disabled="!allKeyframesCompleted"
        class="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-semibold text-lg shadow-lg hover:shadow-xl"
      >
        {{ allKeyframesCompleted ? 'Proceed to Video Generation' : 'Waiting for keyframes...' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Segment } from '~/types/generation'

const props = defineProps<{
  segments: Array<Segment & { keyframeStatus?: string; keyframeError?: string }>
}>()

defineEmits<{
  approve: []
  regenerate: []
}>()

const allKeyframesCompleted = computed(() => {
  return props.segments.every(seg => seg.keyframeStatus === 'completed')
})

function getSegmentTitle(type: string): string {
  const titles: Record<string, string> = {
    hook: 'Hook',
    body: 'Body',
    cta: 'Call to Action',
  }
  return titles[type] || type.charAt(0).toUpperCase() + type.slice(1)
}

function handleImageError(event: Event) {
  const target = event.target as HTMLImageElement
  console.error('[KeyframeApproval] Failed to load image:', target.src)
  target.style.display = 'none'
}
</script>


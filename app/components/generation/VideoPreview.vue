<template>
  <UCard v-if="shouldShow" class="mt-8">
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-xl font-semibold">Video Composition Comparison</h3>
        <div class="flex gap-2">
          <UButton
            v-if="originalVideoUrl || smartVideoUrl"
            icon="i-heroicons-arrow-path"
            size="sm"
            variant="ghost"
            @click="recompose"
            :disabled="composing"
          >
            Refresh
          </UButton>
        </div>
      </div>
    </template>

    <div class="space-y-6">
      <!-- Loading State -->
      <div v-if="composing" class="flex flex-col items-center justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 text-primary-500 animate-spin mb-4" />
        <p class="text-gray-600 dark:text-gray-400">Composing both video versions...</p>
        <p class="text-sm text-gray-500 mt-2">This may take 30-60 seconds</p>
      </div>

      <!-- Error State -->
      <UAlert
        v-else-if="error"
        color="red"
        variant="soft"
        :title="error"
        icon="i-heroicons-exclamation-triangle"
      />

      <!-- Dual Video Preview -->
      <div v-else-if="originalVideoUrl && smartVideoUrl" class="space-y-6">
        <!-- Version Selection Buttons -->
        <div class="flex gap-3 justify-center">
          <UButton
            @click="selectVersion('original')"
            :variant="selectedVersion === 'original' ? 'solid' : 'outline'"
            :color="selectedVersion === 'original' ? 'primary' : 'gray'"
            size="lg"
          >
            <template #leading>
              <UIcon name="i-heroicons-video-camera" />
            </template>
            Use Original
          </UButton>
          <UButton
            @click="selectVersion('smart')"
            :variant="selectedVersion === 'smart' ? 'solid' : 'outline'"
            :color="selectedVersion === 'smart' ? 'primary' : 'gray'"
            size="lg"
          >
            <template #leading>
              <UIcon name="i-heroicons-sparkles" />
            </template>
            Use Smart Stitch
          </UButton>
        </div>

        <!-- Side-by-Side Comparison -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Original Composition -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <h4 class="font-semibold text-lg">Original Composition</h4>
              <UBadge color="gray" variant="subtle">Standard</UBadge>
            </div>
            <div class="aspect-video bg-black rounded-lg overflow-hidden border-2" :class="selectedVersion === 'original' ? 'border-primary-500' : 'border-gray-200 dark:border-gray-700'">
              <video
                ref="originalVideoRef"
                :src="originalVideoUrl"
                class="w-full h-full object-contain"
                controls
                @loadedmetadata="onOriginalVideoLoaded"
              />
            </div>
            <div class="text-sm text-gray-600 dark:text-gray-400">
              <p>Standard concatenation of video segments</p>
              <p class="text-xs mt-1">Duration: {{ formatDuration(originalVideoDuration) }}</p>
            </div>
          </div>

          <!-- Smart Stitched Composition -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <h4 class="font-semibold text-lg">Smart Stitched</h4>
              <UBadge color="primary" variant="subtle">Frame-Matched</UBadge>
            </div>
            <div class="aspect-video bg-black rounded-lg overflow-hidden border-2" :class="selectedVersion === 'smart' ? 'border-primary-500' : 'border-gray-200 dark:border-gray-700'">
              <video
                ref="smartVideoRef"
                :src="smartVideoUrl"
                class="w-full h-full object-contain"
                controls
                @loadedmetadata="onSmartVideoLoaded"
              />
            </div>
            <div class="text-sm text-gray-600 dark:text-gray-400">
              <p>Optimized transitions using frame matching</p>
              <p class="text-xs mt-1">Duration: {{ formatDuration(smartVideoDuration) }}</p>
            </div>
          </div>
        </div>

        <!-- Stitch Adjustments Details -->
        <div v-if="stitchAdjustments && stitchAdjustments.length > 0" class="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-primary-500" />
            <h5 class="font-semibold">Smart Stitch Adjustments</h5>
          </div>
          <ul class="space-y-2 text-sm">
            <li v-for="(adj, idx) in stitchAdjustments" :key="idx" class="flex items-center justify-between">
              <span class="text-gray-700 dark:text-gray-300">{{ adj.transitionName }}</span>
              <div class="flex items-center gap-3">
                <span v-if="adj.trimmedSeconds > 0" class="text-green-600 dark:text-green-400 font-medium">
                  Trimmed {{ adj.trimmedSeconds.toFixed(2) }}s
                </span>
                <span v-else class="text-gray-500">No adjustment</span>
                <UBadge 
                  :color="adj.similarity >= 0.9 ? 'green' : adj.similarity >= 0.7 ? 'blue' : adj.similarity >= 0.5 ? 'yellow' : 'orange'" 
                  variant="subtle" 
                  size="xs"
                >
                  {{ (adj.similarity * 100).toFixed(1) }}% match
                </UBadge>
              </div>
            </li>
          </ul>
          <p class="text-xs text-gray-500 mt-3">
            Smart stitching analyzes the last 30 frames of each clip and always applies the best match found for seamless transitions.
          </p>
        </div>

        <!-- Info about selection -->
        <div v-if="selectedVersion" class="text-center text-sm text-gray-600 dark:text-gray-400">
          <p>
            <strong>{{ selectedVersion === 'original' ? 'Original' : 'Smart Stitched' }}</strong> version selected.
            This will be used for editing and export.
          </p>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="flex flex-col items-center justify-center py-12 text-gray-500">
        <UIcon name="i-heroicons-video-camera" class="w-12 h-12 mb-4 opacity-50" />
        <p>No video segments available to preview</p>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { ComposeVideoRequest } from '~/app/types/api'

interface StitchAdjustment {
  clipIndex: number
  originalEndTime: number
  adjustedEndTime: number
  trimmedSeconds: number
  similarity: number
  transitionName: string
}

const props = defineProps<{
  clips: Array<{
    videoUrl: string
    voiceUrl?: string
    startTime: number
    endTime: number
    type: string
  }>
  status: 'idle' | 'processing' | 'completed' | 'failed'
}>()

const emit = defineEmits<{
  'version-selected': [version: 'original' | 'smart', videoUrl: string, videoId: string]
}>()

const originalVideoRef = ref<HTMLVideoElement | null>(null)
const smartVideoRef = ref<HTMLVideoElement | null>(null)
const originalVideoUrl = ref<string | null>(null)
const smartVideoUrl = ref<string | null>(null)
const originalVideoId = ref<string | null>(null)
const smartVideoId = ref<string | null>(null)
const composing = ref(false)
const error = ref<string | null>(null)
const originalVideoDuration = ref(0)
const smartVideoDuration = ref(0)
const stitchAdjustments = ref<StitchAdjustment[]>([])
const selectedVersion = ref<'original' | 'smart' | null>(null)

const shouldShow = computed(() => {
  return props.status === 'completed' && props.clips.length > 0
})

const formatDuration = (seconds: number): string => {
  if (!isFinite(seconds) || isNaN(seconds) || seconds === 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const onOriginalVideoLoaded = () => {
  if (originalVideoRef.value) {
    originalVideoDuration.value = originalVideoRef.value.duration
  }
}

const onSmartVideoLoaded = () => {
  if (smartVideoRef.value) {
    smartVideoDuration.value = smartVideoRef.value.duration
  }
}

const selectVersion = (version: 'original' | 'smart') => {
  selectedVersion.value = version
  const videoUrl = version === 'original' ? originalVideoUrl.value : smartVideoUrl.value
  const videoId = version === 'original' ? originalVideoId.value : smartVideoId.value
  
  if (videoUrl && videoId) {
    emit('version-selected', version, videoUrl, videoId)
    console.log('[VideoPreview] Version selected:', version, videoUrl, videoId)
  }
}

const composeVideos = async () => {
  if (props.clips.length === 0) {
    error.value = 'No video clips available to compose'
    return
  }

  composing.value = true
  error.value = null
  stitchAdjustments.value = []

  try {
    // Format clips for composition API
    // Calculate cumulative start/end times for proper sequencing
    let currentStartTime = 0
    const formattedClips = props.clips.map((clip) => {
      const clipStart = currentStartTime
      const clipEnd = currentStartTime + (clip.endTime - clip.startTime)
      currentStartTime = clipEnd

      return {
        videoUrl: clip.videoUrl,
        voiceUrl: clip.voiceUrl || undefined,
        startTime: clipStart,
        endTime: clipEnd,
        type: clip.type || 'scene',
      }
    })

    const composeOptions = {
      transition: 'fade',
      musicVolume: 70,
      aspectRatio: '16:9', // Default aspect ratio, could be made configurable
    }

    // Compose both versions in parallel
    console.log('[VideoPreview] Starting parallel composition of both versions')
    const [originalResult, smartResult] = await Promise.all([
      $fetch<{ videoUrl: string; videoId: string }>('/api/compose-video', {
        method: 'POST',
        body: {
          clips: formattedClips,
          options: composeOptions,
        } as ComposeVideoRequest,
      }),
      $fetch<{ videoUrl: string; videoId: string; adjustments: StitchAdjustment[] }>('/api/compose-video-smart', {
        method: 'POST',
        body: {
          clips: formattedClips,
          options: composeOptions,
        } as ComposeVideoRequest,
      }),
    ])

    originalVideoUrl.value = originalResult.videoUrl
    originalVideoId.value = originalResult.videoId
    smartVideoUrl.value = smartResult.videoUrl
    smartVideoId.value = smartResult.videoId
    stitchAdjustments.value = smartResult.adjustments || []

    console.log('[VideoPreview] Both videos composed successfully')
    console.log('[VideoPreview] Original:', originalResult.videoUrl)
    console.log('[VideoPreview] Smart:', smartResult.videoUrl)
    console.log('[VideoPreview] Adjustments:', stitchAdjustments.value)

    // Auto-select smart version by default
    if (!selectedVersion.value) {
      selectVersion('smart')
    }
  } catch (err: any) {
    console.error('[VideoPreview] Error composing videos:', err)
    error.value = err.message || 'Failed to compose videos. Please try again.'
    originalVideoUrl.value = null
    smartVideoUrl.value = null
  } finally {
    composing.value = false
  }
}

const recompose = () => {
  originalVideoUrl.value = null
  smartVideoUrl.value = null
  selectedVersion.value = null
  composeVideos()
}

// Auto-compose when clips become available and status is completed
watch(
  () => [props.clips.length, props.status],
  ([clipsLength, status]) => {
    if (status === 'completed' && clipsLength > 0 && !originalVideoUrl.value && !composing.value) {
      composeVideos()
    }
  },
  { immediate: true }
)

// Re-compose when clips change (e.g., after regeneration)
watch(
  () => props.clips,
  (newClips, oldClips) => {
    if (
      props.status === 'completed' &&
      newClips.length > 0 &&
      JSON.stringify(newClips) !== JSON.stringify(oldClips)
    ) {
      // Only recompose if the clips actually changed
      if (oldClips && oldClips.length > 0) {
        recompose()
      } else if (!originalVideoUrl.value) {
        composeVideos()
      }
    }
  },
  { deep: true }
)
</script>


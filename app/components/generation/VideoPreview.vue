<template>
  <UCard v-if="shouldShow" class="mt-8">
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-xl font-semibold">Stitched Video Preview</h3>
        <UButton
          v-if="composedVideoUrl && !composing"
          icon="i-heroicons-arrow-path"
          size="sm"
          variant="ghost"
          @click="recompose"
        >
          Refresh
        </UButton>
      </div>
    </template>

    <div class="space-y-4">
      <!-- Loading State -->
      <div v-if="composing" class="flex flex-col items-center justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 text-primary-500 animate-spin mb-4" />
        <p class="text-gray-600 dark:text-gray-400">Composing video segments...</p>
      </div>

      <!-- Error State -->
      <UAlert
        v-else-if="error"
        color="red"
        variant="soft"
        :title="error"
        icon="i-heroicons-exclamation-triangle"
      />

      <!-- Video Player -->
      <div v-else-if="composedVideoUrl" class="space-y-4">
        <div class="aspect-video bg-black rounded-lg overflow-hidden">
          <video
            ref="videoRef"
            :src="composedVideoUrl"
            class="w-full h-full object-contain"
            controls
            @loadedmetadata="onVideoLoaded"
          />
        </div>
        <div class="text-sm text-gray-600 dark:text-gray-400">
          <p>Total duration: {{ formatDuration(videoDuration) }}</p>
          <p>Segments: {{ clips.length }}</p>
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

const videoRef = ref<HTMLVideoElement | null>(null)
const composedVideoUrl = ref<string | null>(null)
const composing = ref(false)
const error = ref<string | null>(null)
const videoDuration = ref(0)

const shouldShow = computed(() => {
  return props.status === 'completed' && props.clips.length > 0
})

const formatDuration = (seconds: number): string => {
  if (!isFinite(seconds) || isNaN(seconds) || seconds === 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const onVideoLoaded = () => {
  if (videoRef.value) {
    videoDuration.value = videoRef.value.duration
  }
}

const composeVideo = async () => {
  if (props.clips.length === 0) {
    error.value = 'No video clips available to compose'
    return
  }

  composing.value = true
  error.value = null

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

    const result = await $fetch<{ videoUrl: string; videoId: string }>('/api/compose-video', {
      method: 'POST',
      body: {
        clips: formattedClips,
        options: {
          transition: 'fade',
          musicVolume: 70,
          aspectRatio: '16:9', // Default aspect ratio, could be made configurable
        },
      } as ComposeVideoRequest,
    })

    composedVideoUrl.value = result.videoUrl
    console.log('[VideoPreview] Video composed successfully:', result.videoUrl)
  } catch (err: any) {
    console.error('[VideoPreview] Error composing video:', err)
    error.value = err.message || 'Failed to compose video. Please try again.'
    composedVideoUrl.value = null
  } finally {
    composing.value = false
  }
}

const recompose = () => {
  composedVideoUrl.value = null
  composeVideo()
}

// Auto-compose when clips become available and status is completed
watch(
  () => [props.clips.length, props.status],
  ([clipsLength, status]) => {
    if (status === 'completed' && clipsLength > 0 && !composedVideoUrl.value && !composing.value) {
      composeVideo()
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
      } else if (!composedVideoUrl.value) {
        composeVideo()
      }
    }
  },
  { deep: true }
)
</script>


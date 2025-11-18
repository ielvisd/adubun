<template>
  <div v-if="shouldShow" class="space-y-6 mt-8">
    <UCard class="bg-white dark:bg-gray-800 shadow-lg">
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white">Video Composition</h3>
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
        <!-- Timeline Visualization -->
        <div v-if="props.clips.length > 0" class="space-y-4">
          <div class="relative h-24 bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden">
            <div
              v-for="(clip, idx) in props.clips"
              :key="idx"
              :style="{
                left: `${(clip.startTime / totalDuration) * 100}%`,
                width: `${((clip.endTime - clip.startTime) / totalDuration) * 100}%`,
              }"
              class="absolute top-0 h-full bg-primary-600 dark:bg-primary-500 border-r-2 border-white dark:border-gray-800"
            >
              <div class="p-2 text-xs text-white truncate font-medium">
                {{ clip.type }}
              </div>
            </div>
          </div>
        </div>

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
        <div v-if="selectedVersion" class="text-center space-y-4">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            <strong>{{ selectedVersion === 'original' ? 'Original' : 'Smart Stitched' }}</strong> version selected.
            This will be used for editing and export.
          </p>
          <UButton
            color="primary"
            variant="solid"
            size="lg"
            :loading="sendingToEditor"
            @click="sendToEditor"
            class="bg-primary-500 hover:bg-primary-600 text-white font-semibold"
          >
            <UIcon name="i-heroicons-pencil-square" class="mr-2" />
            Open in Video Editor
          </UButton>
        </div>
      </div>

      <!-- Generate Button State -->
      <div v-else-if="props.clips.length > 0 && !originalVideoUrl && !smartVideoUrl" class="flex flex-col items-center justify-center py-12">
        <UIcon name="i-heroicons-film" class="w-16 h-16 text-primary-500 mb-4" />
        <h4 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Ready to Compose Videos</h4>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-6 text-center max-w-md">
          Generate both original and smart-stitched versions of your composed video for comparison.
        </p>
        <UButton
          size="xl"
          color="primary"
          variant="solid"
          :loading="composing"
          @click="composeVideos"
          class="bg-primary-500 hover:bg-primary-600 text-white font-semibold"
        >
          <UIcon name="i-heroicons-film" class="mr-2" />
          Generate Video Composition
        </UButton>
      </div>

      <!-- Empty State -->
      <div v-else class="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
        <UIcon name="i-heroicons-video-camera" class="w-12 h-12 mb-4 opacity-50" />
        <p>No video segments available to preview</p>
      </div>
      </div>
    </UCard>

    <!-- Cost Tracking at Bottom -->
    <UCard class="bg-white dark:bg-gray-800 shadow-lg">
      <template #header>
        <h4 class="text-xl font-semibold text-gray-900 dark:text-white">Cost Tracking</h4>
      </template>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Current Cost</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">${{ currentCost.toFixed(3) }}</p>
        </div>
        <div>
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Estimated Total</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">${{ estimatedTotal.toFixed(3) }}</p>
        </div>
      </div>
    </UCard>
  </div>
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
  currentCost?: number
  estimatedTotal?: number
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
const sendingToEditor = ref(false)

const shouldShow = computed(() => {
  return props.status === 'completed' && props.clips.length > 0
})

const totalDuration = computed(() => {
  if (props.clips.length === 0) return 0
  return Math.max(...props.clips.map((c) => c.endTime), 0)
})

const currentCost = computed(() => props.currentCost || 0)
const estimatedTotal = computed(() => props.estimatedTotal || 0)

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
      transition: 'none',
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

// Send selected video to editor
const sendToEditor = async () => {
  if (!selectedVersion.value) {
    error.value = 'Please select a video version first'
    return
  }

  const videoUrl = selectedVersion.value === 'original' ? originalVideoUrl.value : smartVideoUrl.value
  const videoId = selectedVersion.value === 'original' ? originalVideoId.value : smartVideoId.value
  if (!videoUrl || !videoId) {
    error.value = 'Video URL or ID not available'
    return
  }

  sendingToEditor.value = true
  error.value = null

  try {
    // Use videoId to download via server endpoint (avoids CORS issues)
    console.log('[VideoPreview] Downloading video for editor via videoId:', videoId)
    
    // Use $fetch with responseType: 'blob' to get the video file directly
    let videoBlob: Blob
    try {
      const blob = await $fetch<Blob>(`/api/download/${videoId}`, {
        responseType: 'blob',
      })
      videoBlob = blob
      console.log('[VideoPreview] Video downloaded via download endpoint, size:', videoBlob.size)
    } catch (downloadError: any) {
      console.warn('[VideoPreview] Download endpoint failed, trying watch endpoint:', downloadError)
      // Fallback to watch endpoint
      try {
        const blob = await $fetch<Blob>(videoUrl, {
          responseType: 'blob',
        })
        videoBlob = blob
        console.log('[VideoPreview] Video downloaded via watch endpoint, size:', videoBlob.size)
      } catch (watchError: any) {
        throw new Error(`Failed to download video: ${watchError.message || 'Unknown error'}`)
      }
    }
    
    // Get video duration from blob
    const videoDuration = await new Promise<number>((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src)
        resolve(video.duration)
      }
      video.onerror = () => reject(new Error('Failed to load video metadata'))
      video.src = URL.createObjectURL(videoBlob)
    })

    // Convert blob to base64 for storage
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64String = reader.result as string
        // Remove data URL prefix (data:video/mp4;base64,)
        const base64 = base64String.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(videoBlob)
    })

    // Create video data for editor
    const videoData = {
      file: {
        name: `composed-video-${selectedVersion.value}-${Date.now()}.mp4`,
        type: 'video/mp4',
        size: videoBlob.size,
        base64: base64Data,
      },
      duration: videoDuration,
      name: `Composed Video (${selectedVersion.value === 'original' ? 'Original' : 'Smart Stitched'})`,
    }

    // Store in sessionStorage for editor to pick up
    if (process.client) {
      sessionStorage.setItem('editorPendingVideo', JSON.stringify(videoData))
      console.log('[VideoPreview] Video data stored for editor')
    }

    // Navigate to editor
    await navigateTo('/editor')
  } catch (err: any) {
    console.error('[VideoPreview] Error sending video to editor:', err)
    error.value = err.message || 'Failed to send video to editor. Please try again.'
  } finally {
    sendingToEditor.value = false
  }
}

// No auto-compose - user must click button to generate
</script>


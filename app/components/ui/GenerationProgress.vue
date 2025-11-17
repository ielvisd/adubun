<template>
  <div class="space-y-6">
    <UCard class="letsignit-card">
      <template #header>
        <div class="flex justify-between items-center">
          <h3 class="text-2xl font-semibold text-black">Generating Assets</h3>
          <UBadge :color="statusColor" size="lg">{{ status }}</UBadge>
        </div>
      </template>

      <!-- Overall Progress -->
      <UProgress :value="overallProgress" class="mb-4" />

      <!-- Overall Error Message -->
      <div
        v-if="status === 'failed' && overallError"
        class="mb-4 p-4 bg-error-50 border border-error-200 rounded-lg"
      >
        <p class="text-sm font-medium text-error-800">Generation Failed:</p>
        <p class="text-sm text-error-600 mt-1">{{ overallError }}</p>
      </div>

      <!-- Segment Progress -->
      <div class="space-y-3">
        <template
          v-for="(segment, idx) in segments"
          :key="idx"
        >
          <div class="flex items-center gap-3">
            <UIcon
              :name="getStatusIcon(segment.status)"
              :class="getStatusClass(segment.status)"
              class="w-5 h-5"
            />
            <span class="flex-1">Segment {{ idx + 1 }}: {{ segment.type }}</span>
            <span class="text-sm text-gray-500">{{ segment.status }}</span>
          </div>
          <!-- Error Messages -->
          <div
            v-if="segment.status === 'failed' && segment.error"
            class="mt-2 p-3 bg-error-50 border border-error-200 rounded-lg"
          >
            <p class="text-sm font-medium text-error-800">Segment {{ idx + 1 }} Error:</p>
            <p class="text-sm text-error-600 mt-1">{{ segment.error }}</p>
            <UButton
              v-if="segment.metadata"
              size="xs"
              variant="outline"
              color="error"
              class="mt-2"
              @click="downloadMetadata(segment, idx)"
            >
              <UIcon name="i-heroicons-arrow-down-tray" class="mr-1" />
              Download Error Metadata
            </UButton>
          </div>
          
          <!-- Success Metadata with Audio Players -->
          <div
            v-if="segment.status === 'completed'"
            class="mt-2 p-3 bg-success-50 border border-success-200 rounded-lg space-y-4"
          >
            <!-- Audio Player -->
            <div v-if="getVoiceUrl(segment)" class="flex items-center gap-3 p-3 bg-white rounded-lg border border-success-200">
              <UButton
                :icon="getAudioPlayingState(idx) ? 'i-heroicons-pause' : 'i-heroicons-play'"
                color="primary"
                variant="solid"
                size="sm"
                square
                @click="toggleAudioPlay(idx, getVoiceUrl(segment))"
              />
              <div class="flex-1">
                <audio
                  :ref="el => setAudioRef(el, idx)"
                  :src="getAudioUrl(getVoiceUrl(segment))"
                  class="hidden"
                  @timeupdate="onAudioTimeUpdate(idx, $event)"
                  @ended="onAudioEnded(idx)"
                />
                <div class="flex items-center gap-2">
                  <USlider
                    :model-value="getAudioProgress(idx)"
                    :min="0"
                    :max="100"
                    :step="0.1"
                    color="primary"
                    size="sm"
                    class="flex-1"
                    @update:model-value="onAudioSeek(idx, $event)"
                  />
                  <span class="text-xs text-gray-500 min-w-[60px] text-right">
                    {{ formatAudioTime(idx) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Metadata Details (Collapsible) -->
            <div v-if="segment.metadata">
              <UButton
                size="xs"
                variant="ghost"
                color="success"
                @click="toggleMetadataExpanded(idx)"
                class="mb-2"
              >
                <UIcon :name="isMetadataExpanded(idx) ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="mr-1" />
                {{ isMetadataExpanded(idx) ? 'Hide' : 'Show' }} Metadata
              </UButton>
              <div v-if="isMetadataExpanded(idx)" class="text-xs text-success-700 space-y-1 mt-2">
                <p v-if="segment.metadata.predictionId">
                  <strong>Prediction ID:</strong> 
                  <code class="bg-success-100 px-1 rounded">{{ segment.metadata.predictionId }}</code>
                </p>
                <p v-if="segment.metadata.replicateVideoUrl">
                  <strong>Replicate Video URL:</strong>
                  <a 
                    :href="segment.metadata.replicateVideoUrl" 
                    target="_blank" 
                    class="text-blue-600 hover:underline ml-1"
                  >
                    View Video
                  </a>
                </p>
                <p v-if="segment.metadata.videoUrl">
                  <strong>Video URL:</strong> 
                  <code class="bg-success-100 px-1 rounded break-all">{{ segment.metadata.videoUrl }}</code>
                </p>
              </div>
              <UButton
                size="xs"
                variant="outline"
                color="success"
                class="mt-2"
                @click="downloadMetadata(segment, idx)"
              >
                <UIcon name="i-heroicons-arrow-down-tray" class="mr-1" />
                Download Metadata
              </UButton>
            </div>
          </div>
        </template>
      </div>
    </UCard>

    <!-- Cost Tracker -->
    <UCard class="letsignit-card">
      <template #header>
        <h4 class="text-xl font-semibold text-black">Cost Tracking</h4>
      </template>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-sm text-gray-500">Current Cost</p>
          <p class="text-2xl font-bold">${{ currentCost.toFixed(3) }}</p>
        </div>
        <div>
          <p class="text-sm text-gray-500">Estimated Total</p>
          <p class="text-2xl font-bold">${{ estimatedTotal.toFixed(3) }}</p>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { Asset } from '~/app/types/generation'

const props = defineProps<{
  segments: Array<{
    type: string
    status: string
    progress?: number
    error?: string
    metadata?: Asset['metadata']
    videoUrl?: string
    voiceUrl?: string
  }>
  overallProgress: number
  status: string
  currentCost: number
  estimatedTotal: number
  overallError?: string
}>()

// Audio player state
const audioRefs = ref<Record<number, HTMLAudioElement>>({})
const audioPlaying = ref<Record<number, boolean>>({})
const audioProgress = ref<Record<number, number>>({})
const audioCurrentTime = ref<Record<number, number>>({})
const audioDuration = ref<Record<number, number>>({})
const metadataExpanded = ref<Record<number, boolean>>({})

// Helper functions to get video/voice URLs
const getVideoUrl = (segment: any): string | null => {
  return segment.videoUrl || segment.metadata?.videoUrl || segment.metadata?.replicateVideoUrl || null
}

const getVoiceUrl = (segment: any): string | null => {
  return segment.voiceUrl || segment.metadata?.voiceUrl || null
}

// Get audio URL from voiceUrl path
const getAudioUrl = (voiceUrl: string | null): string => {
  if (!voiceUrl) return ''
  if (voiceUrl.startsWith('http')) return voiceUrl
  if (voiceUrl.startsWith('/api/')) return voiceUrl
  const filename = voiceUrl.split('/').pop() || voiceUrl
  return `/api/assets/${filename}`
}

// Set audio element ref
const setAudioRef = (el: any, segmentIdx: number) => {
  if (el) {
    audioRefs.value[segmentIdx] = el
    el.addEventListener('loadedmetadata', () => {
      audioDuration.value[segmentIdx] = el.duration
    })
  }
}

// Audio player functions
const getAudioPlayingState = (segmentIdx: number): boolean => {
  return audioPlaying.value[segmentIdx] || false
}

const getAudioProgress = (segmentIdx: number): number => {
  return audioProgress.value[segmentIdx] || 0
}

const formatAudioTime = (segmentIdx: number): string => {
  const current = audioCurrentTime.value[segmentIdx] || 0
  const duration = audioDuration.value[segmentIdx] || 0
  return `${formatTime(current)} / ${formatTime(duration)}`
}

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const toggleAudioPlay = (segmentIdx: number, voiceUrl: string | null) => {
  if (!voiceUrl) return
  const audio = audioRefs.value[segmentIdx]
  if (!audio) return

  // Pause all other audio players
  Object.keys(audioRefs.value).forEach((id) => {
    const otherId = Number(id)
    if (otherId !== segmentIdx && audioRefs.value[otherId]) {
      audioRefs.value[otherId].pause()
      audioPlaying.value[otherId] = false
    }
  })

  if (audio.paused) {
    audio.play().then(() => {
      audioPlaying.value[segmentIdx] = true
    }).catch((error) => {
      console.error('Error playing audio:', error)
    })
  } else {
    audio.pause()
    audioPlaying.value[segmentIdx] = false
  }
}

const onAudioTimeUpdate = (segmentIdx: number, event: Event) => {
  const audio = event.target as HTMLAudioElement
  if (audio) {
    audioCurrentTime.value[segmentIdx] = audio.currentTime
    const duration = audio.duration || 0
    if (duration > 0) {
      audioProgress.value[segmentIdx] = (audio.currentTime / duration) * 100
    }
  }
}

const onAudioEnded = (segmentIdx: number) => {
  audioPlaying.value[segmentIdx] = false
  audioProgress.value[segmentIdx] = 0
  audioCurrentTime.value[segmentIdx] = 0
}

const onAudioSeek = (segmentIdx: number, value: number) => {
  const audio = audioRefs.value[segmentIdx]
  if (audio && audio.duration) {
    audio.currentTime = (value / 100) * audio.duration
    audioProgress.value[segmentIdx] = value
    audioCurrentTime.value[segmentIdx] = audio.currentTime
  }
}

// Metadata expansion
const isMetadataExpanded = (segmentIdx: number): boolean => {
  return metadataExpanded.value[segmentIdx] || false
}

const toggleMetadataExpanded = (segmentIdx: number) => {
  metadataExpanded.value[segmentIdx] = !metadataExpanded.value[segmentIdx]
}

const downloadMetadata = (segment: any, index: number) => {
  const metadata = {
    segmentIndex: index,
    segmentType: segment.type,
    status: segment.status,
    error: segment.error,
    metadata: segment.metadata,
    timestamp: new Date().toISOString(),
  }
  
  const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `segment-${index + 1}-metadata-${Date.now()}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  
  console.log(`[GenerationProgress] Segment ${index + 1} Metadata:`, metadata)
}

const statusColor = computed(() => {
  if (props.status === 'completed') return 'success'
  if (props.status === 'failed') return 'error'
  return 'accent'
})

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return 'i-heroicons-check-circle'
    case 'failed':
      return 'i-heroicons-x-circle'
    case 'processing':
      return 'i-heroicons-arrow-path'
    default:
      return 'i-heroicons-clock'
  }
}

const getStatusClass = (status: string) => {
  switch (status) {
    case 'completed':
      return 'text-success-500'
    case 'failed':
      return 'text-error-500'
    case 'processing':
      return 'text-accent-500 animate-spin'
    default:
      return 'text-gray-400'
  }
}
</script>


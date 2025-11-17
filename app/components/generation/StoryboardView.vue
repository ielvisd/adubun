<template>
  <UCard class="letsignit-card">
    <template #header>
      <h3 class="text-2xl font-semibold text-black">Video Storyboard</h3>
    </template>

    <div class="space-y-4">
      <div
        v-for="(segment, idx) in storyboard.segments"
        :key="idx"
        class="p-6 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow"
      >
        <div class="flex gap-4">
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
            
            <!-- Visual Prompt Display -->
            <div class="mt-3">
              <p class="text-sm font-medium text-gray-700 mb-1">Visual Prompt:</p>
              <p class="text-sm text-gray-600 bg-gray-50 p-2 rounded">{{ getSelectedPrompt(segment) }}</p>
              
              <!-- Prompt Alternatives -->
              <div v-if="segment.visualPromptAlternatives && segment.visualPromptAlternatives.length > 0" class="mt-2">
                <p class="text-xs font-medium text-gray-600 mb-1">Alternative Prompts:</p>
                <div class="space-y-1">
                  <div
                    v-for="(altPrompt, altIdx) in segment.visualPromptAlternatives"
                    :key="altIdx"
                    class="text-xs text-gray-500 bg-gray-50 p-2 rounded cursor-pointer hover:bg-gray-100 transition-colors"
                    :class="{ 'ring-2 ring-primary-500': segment.selectedPromptIndex === altIdx + 1 }"
                    @click="selectPrompt(idx, altIdx + 1)"
                  >
                    <span class="font-medium">Option {{ altIdx + 1 }}:</span> {{ altPrompt }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="flex-shrink-0 flex gap-2">
            <UButton
              icon="i-heroicons-arrow-path"
              size="sm"
              variant="ghost"
              :loading="regeneratingSegments[idx]"
              :disabled="regeneratingSegments[idx] || !retrySegment"
              @click="handleRegenerate(idx)"
            />
            <UButton
              icon="i-heroicons-pencil"
              size="sm"
              variant="ghost"
              @click="editSegment(idx)"
            />
          </div>
        </div>

        <!-- Video Preview and Audio Player -->
        <div v-if="getAssetForSegment(idx)" class="mt-4 space-y-4">
          <!-- Video Preview -->
          <div v-if="getVideoUrl(idx)" class="mt-4">
            <p class="text-sm font-medium text-gray-700 mb-2">Video Preview:</p>
            <div class="aspect-video bg-black rounded-lg overflow-hidden">
              <video
                :ref="el => setVideoRef(el, idx)"
                :src="getVideoUrl(idx)"
                class="w-full h-full object-contain"
                controls
                @loadedmetadata="onVideoLoaded(idx)"
              />
            </div>
          </div>

          <!-- Audio Player -->
          <div v-if="getVoiceUrl(idx)" class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <UButton
              :icon="getAudioPlayingState(idx) ? 'i-heroicons-pause' : 'i-heroicons-play'"
              color="primary"
              variant="solid"
              size="sm"
              square
              @click="toggleAudioPlay(idx, getVoiceUrl(idx))"
            />
            <div class="flex-1">
              <audio
                :ref="el => setAudioRef(el, idx)"
                :src="getAudioUrl(getVoiceUrl(idx))"
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
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { Storyboard } from '~/app/types/generation'

const props = defineProps<{
  storyboard: Storyboard
  assets?: Array<{
    segmentId: number
    videoUrl?: string
    voiceUrl?: string
    metadata?: {
      videoUrl?: string
      replicateVideoUrl?: string
      voiceUrl?: string
    }
  }>
  retrySegment?: (segmentId: number) => Promise<void>
}>()

const emit = defineEmits<{
  edit: [index: number]
  'prompt-selected': [segmentIdx: number, promptIndex: number]
  regenerate: [segmentIdx: number]
}>()

// Audio player state
const audioRefs = ref<Record<number, HTMLAudioElement>>({})
const videoRefs = ref<Record<number, HTMLVideoElement>>({})
const audioPlaying = ref<Record<number, boolean>>({})
const audioProgress = ref<Record<number, number>>({})
const audioCurrentTime = ref<Record<number, number>>({})
const audioDuration = ref<Record<number, number>>({})

// Regeneration state
const regeneratingSegments = ref<Record<number, boolean>>({})
const toast = useToast()

// Watch for segment updates to clear regenerating state
watch(
  () => props.assets,
  (newAssets) => {
    if (newAssets) {
      newAssets.forEach((asset) => {
        // Clear regenerating state when segment is completed
        if (asset.videoUrl && regeneratingSegments.value[asset.segmentId]) {
          // Small delay to ensure UI updates
          setTimeout(() => {
            regeneratingSegments.value[asset.segmentId] = false
          }, 500)
        }
      })
    }
  },
  { deep: true }
)

// Get asset for a segment by index
const getAssetForSegment = (segmentIdx: number) => {
  if (!props.assets) return null
  return props.assets.find(asset => asset.segmentId === segmentIdx) || null
}

// Get video URL for a segment
const getVideoUrl = (segmentIdx: number): string | null => {
  const asset = getAssetForSegment(segmentIdx)
  if (!asset) return null
  return asset.videoUrl || asset.metadata?.videoUrl || asset.metadata?.replicateVideoUrl || null
}

// Get voice URL for a segment
const getVoiceUrl = (segmentIdx: number): string | null => {
  const asset = getAssetForSegment(segmentIdx)
  if (!asset) return null
  return asset.voiceUrl || asset.metadata?.voiceUrl || null
}

// Get audio URL from voiceUrl path
const getAudioUrl = (voiceUrl: string | null): string => {
  if (!voiceUrl) return ''
  if (voiceUrl.startsWith('http')) return voiceUrl
  if (voiceUrl.startsWith('/api/')) return voiceUrl
  const filename = voiceUrl.split('/').pop() || voiceUrl
  return `/api/assets/${filename}`
}

// Set video element ref
const setVideoRef = (el: any, segmentIdx: number) => {
  if (el) {
    videoRefs.value[segmentIdx] = el
  }
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

// Video loaded handler
const onVideoLoaded = (segmentIdx: number) => {
  console.log(`[StoryboardView] Video loaded for segment ${segmentIdx + 1}`)
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

const handleRegenerate = async (segmentIdx: number) => {
  if (!props.retrySegment) {
    toast.add({
      title: 'Error',
      description: 'Regeneration function not available',
      color: 'error',
    })
    return
  }

  regeneratingSegments.value[segmentIdx] = true
  emit('regenerate', segmentIdx)

  try {
    await props.retrySegment(segmentIdx)
    toast.add({
      title: 'Success',
      description: `Segment ${segmentIdx + 1} is being regenerated`,
      color: 'success',
    })
  } catch (error: any) {
    console.error(`[StoryboardView] Error regenerating segment ${segmentIdx}:`, error)
    toast.add({
      title: 'Regeneration Failed',
      description: error.message || 'Failed to regenerate segment. Please try again.',
      color: 'error',
    })
  } finally {
    // Keep loading state until the segment is actually updated via polling
    // The loading state will be cleared when the segment status updates
  }
}

// Get the selected prompt for a segment
const getSelectedPrompt = (segment: any): string => {
  if (segment.selectedPromptIndex === undefined || segment.selectedPromptIndex === 0) {
    return segment.visualPrompt
  }
  const altIndex = segment.selectedPromptIndex - 1
  if (segment.visualPromptAlternatives && segment.visualPromptAlternatives[altIndex]) {
    return segment.visualPromptAlternatives[altIndex]
  }
  return segment.visualPrompt
}

// Select a prompt variation
const selectPrompt = async (segmentIdx: number, promptIndex: number) => {
  // This will be handled by the parent component via emit or direct update
  // For now, we'll emit an event
  emit('prompt-selected', segmentIdx, promptIndex)
}
</script>


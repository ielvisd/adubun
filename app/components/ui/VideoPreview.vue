<template>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center">
        <h3 class="text-xl font-semibold">Your Video is Ready!</h3>
        <UBadge color="success" size="lg">
          <UIcon name="i-heroicons-check-circle" class="mr-1" />
          Completed
        </UBadge>
      </div>
    </template>

    <!-- Video Player -->
    <div 
      v-if="videoUrl"
      class="video-container mb-6 relative bg-black rounded-lg overflow-hidden aspect-video group"
      @mouseenter="showControls = true"
      @mouseleave="showControls = false"
      @touchstart="showControls = true"
    >
      <video
        ref="videoRef"
        :src="videoUrl"
        class="w-full h-full object-contain"
        @loadedmetadata="onVideoLoaded"
        @timeupdate="onTimeUpdate"
      />
      
      <!-- Custom Controls Overlay -->
      <div 
        class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 sm:p-4 transition-opacity duration-300 pointer-events-none"
        :class="showControls || !isPlaying ? 'opacity-100' : 'opacity-0'"
      >
          <!-- Progress Bar -->
          <div class="mb-3 pointer-events-auto">
            <USlider
              v-model="progressValue"
              :min="0"
              :max="videoDuration || 100"
              :step="0.1"
              color="primary"
              size="md"
              class="w-full"
              @update:model-value="onSeek"
            />
            <div class="flex justify-between text-xs text-white/90 mt-1">
              <span>{{ formatTime(currentTime) }}</span>
              <span>{{ formatTime(videoDuration || 0) }}</span>
            </div>
          </div>
        
        <!-- Control Buttons -->
        <div class="flex items-center gap-2 flex-wrap pointer-events-auto">
          <!-- Play/Pause Button -->
          <UButton
            :icon="isPlaying ? 'i-heroicons-pause' : 'i-heroicons-play'"
            color="neutral"
            variant="ghost"
            size="lg"
            square
            class="text-white hover:bg-white/20 shrink-0"
            @click="togglePlayComposable"
          />
          
          <!-- Volume Control -->
          <div class="flex items-center gap-2 flex-1 max-w-[120px] min-w-[80px] hidden sm:flex">
            <UButton
              :icon="volume > 0 ? 'i-heroicons-speaker-wave' : 'i-heroicons-speaker-x-mark'"
              color="neutral"
              variant="ghost"
              size="sm"
              square
              class="text-white hover:bg-white/20 shrink-0"
              @click="toggleMute"
            />
            <USlider
              v-model="volume"
              :min="0"
              :max="1"
              :step="0.01"
              color="primary"
              size="sm"
              class="flex-1"
              @update:model-value="onVolumeChange"
            />
          </div>
          
          <!-- Mobile Volume Button -->
          <UButton
            :icon="volume > 0 ? 'i-heroicons-speaker-wave' : 'i-heroicons-speaker-x-mark'"
            color="neutral"
            variant="ghost"
            size="lg"
            square
            class="text-white hover:bg-white/20 shrink-0 sm:hidden"
            @click="toggleMute"
          />
          
          <!-- Playback Speed -->
          <USelectMenu
            v-model="playbackRate"
            :options="playbackRateOptions"
            option-attribute="label"
            value-attribute="value"
            class="w-20 sm:w-24 shrink-0"
            size="sm"
            @update:model-value="onPlaybackRateChange"
          />
          
          <!-- Fullscreen Button -->
          <UButton
            icon="i-heroicons-arrows-pointing-out"
            color="neutral"
            variant="ghost"
            size="lg"
            square
            class="text-white hover:bg-white/20 shrink-0"
            @click="toggleFullscreen"
          />
        </div>
      </div>
    </div>
    
    <!-- Error message if videoUrl is missing -->
    <UAlert
      v-else
      color="error"
      variant="soft"
      title="Video not available"
      description="The video URL is missing. Please try generating the video again."
      class="mb-6"
    />

    <!-- Video Info -->
    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="text-center">
        <p class="text-sm text-gray-500">Duration</p>
        <p class="text-lg font-semibold">{{ duration }}s</p>
      </div>
      <div class="text-center">
        <p class="text-sm text-gray-500">Resolution</p>
        <p class="text-lg font-semibold">1080p</p>
      </div>
      <div class="text-center">
        <p class="text-sm text-gray-500">Cost</p>
        <p class="text-lg font-semibold">${{ cost.toFixed(2) }}</p>
      </div>
    </div>

    <!-- Script/Audio Section -->
    <div v-if="segments && segments.length > 0" class="mb-6">
      <UDivider class="mb-4" />
      <h4 class="text-lg font-semibold mb-4 flex items-center gap-2">
        <UIcon name="i-heroicons-speaker-wave" class="w-5 h-5" />
        Script & Audio
      </h4>
      <div class="space-y-4">
        <UCard
          v-for="segment in segments"
          :key="segment.segmentId"
          class="mb-4"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UBadge :color="getSegmentTypeColor(segment.type)" size="sm">
                  {{ segment.type.toUpperCase() }}
                </UBadge>
                <span class="text-sm text-gray-500">
                  Segment {{ segment.segmentId + 1 }}
                </span>
              </div>
              <span class="text-xs text-gray-500">
                {{ formatTime(segment.startTime) }} - {{ formatTime(segment.endTime) }}
              </span>
            </div>
          </template>

          <div class="space-y-3">
            <!-- Script Text -->
            <div>
              <p class="text-sm font-medium text-gray-700 mb-2">Script:</p>
              <p class="text-sm text-gray-600 leading-relaxed">{{ segment.audioNotes }}</p>
            </div>

            <!-- Audio Player -->
            <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <UButton
                :icon="getAudioPlayingState(segment.segmentId) ? 'i-heroicons-pause' : 'i-heroicons-play'"
                color="primary"
                variant="solid"
                size="sm"
                square
                @click="toggleAudioPlay(segment.segmentId, segment.voiceUrl)"
              />
              <div class="flex-1">
                <audio
                  :ref="el => setAudioRef(el, segment.segmentId)"
                  :src="getAudioUrl(segment.voiceUrl)"
                  class="hidden"
                  @timeupdate="onAudioTimeUpdate(segment.segmentId, $event)"
                  @ended="onAudioEnded(segment.segmentId)"
                />
                <div class="flex items-center gap-2">
                  <USlider
                    :model-value="getAudioProgress(segment.segmentId)"
                    :min="0"
                    :max="100"
                    :step="0.1"
                    color="primary"
                    size="sm"
                    class="flex-1"
                    @update:model-value="onAudioSeek(segment.segmentId, $event)"
                  />
                  <span class="text-xs text-gray-500 min-w-[60px] text-right">
                    {{ formatAudioTime(segment.segmentId) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-3">
      <UButton
        size="lg"
        class="flex-1"
        @click="downloadVideo"
      >
        <UIcon name="i-heroicons-arrow-down-tray" class="mr-2" />
        Download MP4
      </UButton>

      <UDropdown :items="exportOptions">
        <UButton variant="outline" size="lg">
          <UIcon name="i-heroicons-ellipsis-vertical" />
        </UButton>
      </UDropdown>

      <UButton
        variant="outline"
        size="lg"
        @click="regenerate"
      >
        <UIcon name="i-heroicons-arrow-path" class="mr-2" />
        Regenerate
      </UButton>
    </div>

    <!-- Share Options -->
    <UDivider class="my-6" />
    
    <div>
      <h4 class="font-semibold mb-3">Share Video</h4>
      <div class="flex gap-2">
        <UInput
          :value="shareUrl"
          readonly
          class="flex-1"
        />
        <UButton
          icon="i-heroicons-clipboard"
          @click="copyShareUrl"
        >
          Copy
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{
  videoUrl: string
  duration: number
  cost: number
  segments?: Array<{
    segmentId: number
    type: string
    audioNotes: string
    voiceUrl: string
    startTime: number
    endTime: number
  }>
}>()

const toast = useToast()

// Audio player state
const audioRefs = ref<Record<number, HTMLAudioElement>>({})
const audioPlaying = ref<Record<number, boolean>>({})
const audioProgress = ref<Record<number, number>>({})
const audioCurrentTime = ref<Record<number, number>>({})
const audioDuration = ref<Record<number, number>>({})

// Set audio element ref
const setAudioRef = (el: any, segmentId: number) => {
  if (el) {
    audioRefs.value[segmentId] = el
    // Load duration when metadata is available
    el.addEventListener('loadedmetadata', () => {
      audioDuration.value[segmentId] = el.duration
    })
  }
}

// Get audio URL from voiceUrl path
const getAudioUrl = (voiceUrl: string): string => {
  if (!voiceUrl) return ''
  // If it's already a full URL, return as is
  if (voiceUrl.startsWith('http')) return voiceUrl
  // If it starts with /api/, return as is
  if (voiceUrl.startsWith('/api/')) return voiceUrl
  // Otherwise, assume it's an asset path and convert to API URL
  const filename = voiceUrl.split('/').pop() || voiceUrl
  return `/api/assets/${filename}`
}

// Get segment type color
const getSegmentTypeColor = (type: string): string => {
  const colors: Record<string, string> = {
    hook: 'primary',
    body: 'secondary',
    cta: 'success',
  }
  return colors[type] || 'neutral'
}

// Get audio playing state
const getAudioPlayingState = (segmentId: number): boolean => {
  return audioPlaying.value[segmentId] || false
}

// Get audio progress percentage
const getAudioProgress = (segmentId: number): number => {
  return audioProgress.value[segmentId] || 0
}

// Format audio time
const formatAudioTime = (segmentId: number): string => {
  const current = audioCurrentTime.value[segmentId] || 0
  const duration = audioDuration.value[segmentId] || 0
  return `${formatTime(current)} / ${formatTime(duration)}`
}

// Toggle audio play/pause
const toggleAudioPlay = (segmentId: number, voiceUrl: string) => {
  const audio = audioRefs.value[segmentId]
  if (!audio) return

  // Pause all other audio players
  Object.keys(audioRefs.value).forEach((id) => {
    const otherId = Number(id)
    if (otherId !== segmentId && audioRefs.value[otherId]) {
      audioRefs.value[otherId].pause()
      audioPlaying.value[otherId] = false
    }
  })

  if (audio.paused) {
    audio.play().then(() => {
      audioPlaying.value[segmentId] = true
    }).catch((error) => {
      console.error('Error playing audio:', error)
      toast.add({
        title: 'Audio playback error',
        description: 'Failed to play audio',
        color: 'error',
      })
    })
  } else {
    audio.pause()
    audioPlaying.value[segmentId] = false
  }
}

// Handle audio time update
const onAudioTimeUpdate = (segmentId: number, event: Event) => {
  const audio = event.target as HTMLAudioElement
  if (audio) {
    audioCurrentTime.value[segmentId] = audio.currentTime
    const duration = audio.duration || 0
    if (duration > 0) {
      audioProgress.value[segmentId] = (audio.currentTime / duration) * 100
    }
  }
}

// Handle audio ended
const onAudioEnded = (segmentId: number) => {
  audioPlaying.value[segmentId] = false
  audioProgress.value[segmentId] = 0
  audioCurrentTime.value[segmentId] = 0
}

// Handle audio seek
const onAudioSeek = (segmentId: number, value: number) => {
  const audio = audioRefs.value[segmentId]
  if (audio && audio.duration) {
    audio.currentTime = (value / 100) * audio.duration
    audioProgress.value[segmentId] = value
    audioCurrentTime.value[segmentId] = audio.currentTime
  }
}

// Use the video player composable
const {
  videoRef,
  isPlaying,
  currentTime,
  duration: videoDuration,
  volume,
  play,
  pause,
  togglePlay: togglePlayComposable,
  seek,
  setVolume,
  setPlaybackRate,
} = useVideoPlayer()

// Local state for controls
const progressValue = ref(0)
const playbackRate = ref(1)
const showControls = ref(true)
const isSeeking = ref(false)
const playbackRateOptions = [
  { label: '0.5x', value: 0.5 },
  { label: '0.75x', value: 0.75 },
  { label: '1x', value: 1 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x', value: 1.5 },
  { label: '2x', value: 2 },
]

// Format time as MM:SS
const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Handle video metadata loaded
const onVideoLoaded = () => {
  if (videoRef.value) {
    console.log('[VideoPreview] Video metadata loaded, duration:', videoRef.value.duration)
  }
}

// Handle time update
const onTimeUpdate = () => {
  if (videoRef.value && !isSeeking.value) {
    progressValue.value = videoRef.value.currentTime
  }
}

// Handle seek
const onSeek = (value: number) => {
  isSeeking.value = true
  seek(value)
  // Reset seeking flag after a short delay
  setTimeout(() => {
    isSeeking.value = false
  }, 100)
}

// Handle volume change
const onVolumeChange = (value: number) => {
  setVolume(value)
}

// Handle playback rate change
const onPlaybackRateChange = (value: number) => {
  setPlaybackRate(value)
}

// Toggle mute
const toggleMute = () => {
  if (volume.value > 0) {
    setVolume(0)
  } else {
    setVolume(1)
  }
}

// Toggle fullscreen
const toggleFullscreen = () => {
  if (!videoRef.value) return
  
  if (!document.fullscreenElement) {
    videoRef.value.requestFullscreen().catch((err) => {
      console.error('Error attempting to enable fullscreen:', err)
    })
  } else {
    document.exitFullscreen()
  }
}

// Watch for video URL changes
watch(() => props.videoUrl, (newUrl) => {
  console.log('[VideoPreview] Video URL prop changed:', newUrl)
  if (videoRef.value) {
    console.log('[VideoPreview] Updating video element src to:', newUrl)
    videoRef.value.src = newUrl
    // Reset progress when URL changes
    progressValue.value = 0
  }
})

// Watch for currentTime changes from composable
watch(currentTime, (newTime) => {
  if (!isSeeking.value) {
    progressValue.value = newTime
  }
})

// Auto-hide controls when playing (after 3 seconds)
let controlsTimeout: ReturnType<typeof setTimeout> | null = null
watch(isPlaying, (playing) => {
  if (playing) {
    // Clear any existing timeout
    if (controlsTimeout) {
      clearTimeout(controlsTimeout)
    }
    // Hide controls after 3 seconds of playing
    controlsTimeout = setTimeout(() => {
      if (isPlaying.value) {
        showControls.value = false
      }
    }, 3000)
  } else {
    // Show controls when paused
    showControls.value = true
    if (controlsTimeout) {
      clearTimeout(controlsTimeout)
      controlsTimeout = null
    }
  }
})

// Watch for duration changes from composable
watch(videoDuration, (newDuration) => {
  console.log('[VideoPreview] Video duration updated:', newDuration)
})

// Watch for segments prop changes
watch(() => props.segments, (newSegments) => {
  console.log('[VideoPreview] Segments prop changed:', newSegments?.length || 0)
  if (newSegments && newSegments.length > 0) {
    console.log('[VideoPreview] Segments details:', JSON.stringify(newSegments, null, 2))
    newSegments.forEach((seg: any, idx: number) => {
      console.log(`[VideoPreview] Segment ${idx}:`, {
        segmentId: seg.segmentId,
        hasAudioNotes: !!seg.audioNotes,
        hasVoiceUrl: !!seg.voiceUrl,
        audioNotesLength: seg.audioNotes?.length || 0,
        voiceUrl: seg.voiceUrl,
      })
    })
  } else {
    console.warn('[VideoPreview] No segments provided or segments array is empty')
  }
}, { immediate: true })

onMounted(() => {
  console.log('[VideoPreview] Component mounted')
  console.log('[VideoPreview] Video URL prop:', props.videoUrl)
  console.log('[VideoPreview] Duration prop:', props.duration)
  console.log('[VideoPreview] Cost prop:', props.cost)
  console.log('[VideoPreview] Segments prop:', props.segments?.length || 0)
  
  // Validate videoUrl
  if (!props.videoUrl) {
    console.error('[VideoPreview] ERROR: videoUrl prop is empty')
    toast.add({
      title: 'Video URL missing',
      description: 'Video URL is not available. Please try again.',
      color: 'error',
    })
  }
  
  // Validate segments
  if (props.segments && props.segments.length > 0) {
    console.log('[VideoPreview] Segments will be displayed:', props.segments.length)
    props.segments.forEach((seg: any, idx: number) => {
      if (!seg.audioNotes) {
        console.warn(`[VideoPreview] WARNING: Segment ${idx} missing audioNotes`)
      }
      if (!seg.voiceUrl) {
        console.warn(`[VideoPreview] WARNING: Segment ${idx} missing voiceUrl`)
      }
    })
  } else {
    console.log('[VideoPreview] No segments to display (this is okay if no audio was generated)')
  }
  
  if (videoRef.value) {
    console.log('[VideoPreview] Video element found in DOM')
    console.log('[VideoPreview] Video element src:', videoRef.value.src)
    
    // Add error handling
    videoRef.value.addEventListener('error', (e) => {
      console.error('[VideoPreview] Video error event')
      console.error('[VideoPreview] Video error code:', videoRef.value?.error?.code)
      console.error('[VideoPreview] Video error message:', videoRef.value?.error?.message)
      
      toast.add({
        title: 'Video playback error',
        description: videoRef.value?.error?.message || 'Failed to load video',
        color: 'error',
      })
    })
    
    // Add loaded event
    videoRef.value.addEventListener('loadeddata', () => {
      console.log('[VideoPreview] Video loaded successfully')
    })
  } else {
    console.error('[VideoPreview] Video element not found in DOM')
  }
})

const shareUrl = computed(() => {
  if (process.client) {
    return `${window.location.origin}/watch/${props.videoUrl.split('/').pop()}`
  }
  return ''
})

const exportOptions = [
  [{
    label: 'Export as WebM',
    icon: 'i-heroicons-film',
    click: () => exportFormat('webm'),
  }],
  [{
    label: 'Export as GIF',
    icon: 'i-heroicons-gif',
    click: () => exportFormat('gif'),
  }],
  [{
    label: 'Generate HLS Stream',
    icon: 'i-heroicons-signal',
    click: () => exportFormat('hls'),
  }],
]

const downloadVideo = async () => {
  if (process.client) {
    const link = document.createElement('a')
    link.href = props.videoUrl
    link.download = `adubun-${Date.now()}.mp4`
    link.click()
  }
}

const copyShareUrl = () => {
  if (process.client) {
    navigator.clipboard.writeText(shareUrl.value)
    toast.add({
      title: 'Link copied!',
      icon: 'i-heroicons-check-circle',
    })
  }
}

const regenerate = () => {
  navigateTo('/generate', { state: { regenerate: true } })
}

const exportFormat = async (format: string) => {
  toast.add({
    title: 'Exporting...',
    description: `Converting to ${format.toUpperCase()}`,
  })
  
  try {
    await $fetch('/api/export-format', {
      method: 'POST',
      body: { videoUrl: props.videoUrl, format },
    })
    
    toast.add({
      title: 'Export completed!',
      color: 'success',
    })
  } catch (error) {
    toast.add({
      title: 'Export failed',
      color: 'error',
    })
  }
}
</script>


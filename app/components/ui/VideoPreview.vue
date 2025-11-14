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
}>()

const toast = useToast()

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

onMounted(() => {
  console.log('[VideoPreview] Component mounted')
  console.log('[VideoPreview] Video element ref:', videoRef.value)
  console.log('[VideoPreview] Video URL prop:', props.videoUrl)
  
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


<template>
  <div class="relative w-full h-full bg-black flex items-center justify-center">
    <video
      ref="videoPlayer"
      :src="currentClip?.sourceUrl"
      class="w-full h-full object-contain"
      @timeupdate="handleTimeUpdate"
      @loadedmetadata="handleLoadedMetadata"
      @click="handleVideoClick"
      @play="handlePlay"
      @pause="handlePause"
    />
    
    <div v-if="clips.length === 0" class="absolute inset-0 flex items-center justify-center text-gray-400">
      <div class="text-center">
        <UIcon name="i-heroicons-video-camera" class="w-16 h-16 mx-auto mb-4 opacity-50" />
        <p>Add videos to timeline to preview</p>
      </div>
    </div>

    <!-- Time Display -->
    <div class="absolute bottom-4 left-4 bg-black/70 text-white px-3 py-1 rounded text-sm font-mono">
      {{ formatTime(currentTime) }} / {{ formatTime(totalDuration) }}
    </div>

    <!-- Play/Pause Overlay -->
    <div
      v-if="!isPlaying && clips.length > 0"
      class="absolute inset-0 flex items-center justify-center cursor-pointer"
      @click="handlePlayClick"
    >
      <div class="bg-black/50 rounded-full p-4 hover:bg-black/70 transition-colors">
        <UIcon name="i-heroicons-play" class="w-12 h-12 text-white" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface EditorClip {
  id: string
  videoId: string
  sourceUrl: string
  originalDuration: number
  startOffset: number
  endOffset: number
  inTimelineStart: number
  name: string
}

const props = defineProps<{
  clips: EditorClip[]
  currentTime: number
  isPlaying: boolean
}>()

const emit = defineEmits<{
  'time-update': [time: number]
  'seek': [time: number]
  'play': []
  'pause': []
}>()

const videoPlayer = ref<HTMLVideoElement>()
const animationFrameId = ref<number | null>(null)
const lastEmittedTime = ref(0)

const totalDuration = computed(() => {
  return props.clips.reduce((sum, clip) => {
    return sum + (clip.originalDuration - clip.startOffset - clip.endOffset)
  }, 0)
})

const currentClip = computed(() => {
  for (const clip of props.clips) {
    const duration = clip.originalDuration - clip.startOffset - clip.endOffset
    if (props.currentTime >= clip.inTimelineStart && props.currentTime < clip.inTimelineStart + duration) {
      return clip
    }
  }
  return props.clips[0] || null
})

const currentVideoTime = computed(() => {
  if (!currentClip.value) return 0
  const relativeTime = props.currentTime - currentClip.value.inTimelineStart
  return currentClip.value.startOffset + relativeTime
})

const cancelAnimation = () => {
  if (animationFrameId.value !== null) {
    cancelAnimationFrame(animationFrameId.value)
    animationFrameId.value = null
  }
}

const emitTimelineTime = () => {
  if (!videoPlayer.value || !currentClip.value) return
  
  const clip = currentClip.value
  const videoTime = videoPlayer.value.currentTime
  
  const clipStart = clip.startOffset
  const clipEnd = clip.originalDuration - clip.endOffset
  
  if (videoTime < clipStart) {
    videoPlayer.value.currentTime = clipStart
    return
  }
  
  if (videoTime >= clipEnd) {
    videoPlayer.value.pause()
    videoPlayer.value.currentTime = clipEnd
    
    const currentClipIndex = props.clips.findIndex(c => c.id === clip.id)
    const nextClip = props.clips[currentClipIndex + 1]
    
    if (nextClip) {
      emit('seek', nextClip.inTimelineStart)
    } else {
      emit('pause')
      emit('time-update', totalDuration.value)
      cancelAnimation()
    }
    return
  }
  
  const relativeTime = videoTime - clip.startOffset
  const timelineTime = clip.inTimelineStart + relativeTime
  
  if (Math.abs(timelineTime - lastEmittedTime.value) > 0.001) {
    lastEmittedTime.value = timelineTime
    emit('time-update', timelineTime)
  }
}

const startSyncLoop = () => {
  cancelAnimation()
  const loop = () => {
    emitTimelineTime()
    animationFrameId.value = requestAnimationFrame(loop)
  }
  animationFrameId.value = requestAnimationFrame(loop)
}

const handleTimeUpdate = () => {
  emitTimelineTime()
}

const handleLoadedMetadata = () => {
  updateVideoTime()
}

const updateVideoTime = () => {
  if (videoPlayer.value && currentClip.value) {
    const targetTime = currentVideoTime.value
    const clip = currentClip.value
    
    // Ensure we're within clip bounds
    const clipStart = clip.startOffset
    const clipEnd = clip.originalDuration - clip.endOffset
    
    if (targetTime < clipStart) {
      videoPlayer.value.currentTime = clipStart
    } else if (targetTime >= clipEnd) {
      videoPlayer.value.currentTime = clipEnd - 0.1
    } else if (Math.abs(videoPlayer.value.currentTime - targetTime) > 0.05) {
      videoPlayer.value.currentTime = targetTime
    }
  }
}

const handleVideoClick = () => {
  if (videoPlayer.value) {
    if (videoPlayer.value.paused) {
      videoPlayer.value.play()
      emit('play')
    } else {
      videoPlayer.value.pause()
      emit('pause')
    }
  }
}

const handlePlayClick = () => {
  if (videoPlayer.value) {
    videoPlayer.value.play()
    emit('play')
    startSyncLoop()
  }
}

const handlePlay = () => {
  emit('play')
  startSyncLoop()
}

const handlePause = () => {
  emit('pause')
  cancelAnimation()
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

watch(() => props.currentTime, () => {
  if (!props.isPlaying) {
    updateVideoTime()
  }
})

watch(() => props.isPlaying, (playing) => {
  if (videoPlayer.value) {
    if (playing) {
      updateVideoTime()
      videoPlayer.value.play().then(() => {
        startSyncLoop()
      }).catch(() => {})
    } else {
      videoPlayer.value.pause()
      cancelAnimation()
    }
  }
})

watch(() => currentClip.value, (newClip, oldClip) => {
  if (newClip && newClip.sourceUrl !== oldClip?.sourceUrl) {
    if (videoPlayer.value) {
      videoPlayer.value.src = newClip.sourceUrl
      videoPlayer.value.load()
      if (props.isPlaying) {
        videoPlayer.value.play().then(() => {
          startSyncLoop()
        }).catch(() => {})
      }
    }
  }
}, { immediate: true })

onBeforeUnmount(() => {
  cancelAnimation()
})
</script>

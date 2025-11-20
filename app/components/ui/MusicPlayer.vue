<template>
  <div v-if="musicUrl" class="space-y-2 mt-3">
    <p class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Background Music</p>
    <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <UButton
        :icon="musicPlaying ? 'i-heroicons-pause' : 'i-heroicons-play'"
        color="primary"
        variant="solid"
        size="sm"
        square
        @click="toggleMusicPlay"
      />
      <div class="flex-1">
        <audio
          ref="musicAudioRef"
          :src="getMusicAudioUrl()"
          class="hidden"
          @timeupdate="onMusicTimeUpdate"
          @ended="onMusicEnded"
          @loadedmetadata="onMusicLoaded"
        />
        <div class="flex items-center gap-2">
          <USlider
            :model-value="musicProgress"
            :min="0"
            :max="100"
            :step="0.1"
            color="primary"
            size="sm"
            class="flex-1"
            @update:model-value="onMusicSeek"
          />
          <span class="text-xs text-gray-500 dark:text-gray-400 min-w-[80px] text-right">
            {{ formatMusicTime() }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  musicUrl: string | null | undefined
}>()

const musicAudioRef = ref<HTMLAudioElement>()
const musicPlaying = ref(false)
const musicProgress = ref(0)
const musicCurrentTime = ref(0)
const musicDuration = ref(0)

// Get music audio URL from musicUrl path
const getMusicAudioUrl = (): string => {
  if (!props.musicUrl) return ''
  if (props.musicUrl.startsWith('http')) return props.musicUrl
  if (props.musicUrl.startsWith('/api/')) return props.musicUrl
  const filename = props.musicUrl.split('/').pop() || props.musicUrl
  return `/api/assets/${filename}`
}

const toggleMusicPlay = () => {
  const audio = musicAudioRef.value
  if (!audio) return

  if (audio.paused) {
    audio.play().then(() => {
      musicPlaying.value = true
    }).catch((error) => {
      console.error('Error playing music:', error)
    })
  } else {
    audio.pause()
    musicPlaying.value = false
  }
}

const onMusicTimeUpdate = (event: Event) => {
  const audio = event.target as HTMLAudioElement
  if (audio) {
    musicCurrentTime.value = audio.currentTime
    const duration = audio.duration || 0
    if (duration > 0) {
      musicProgress.value = (audio.currentTime / duration) * 100
    }
  }
}

const onMusicEnded = () => {
  musicPlaying.value = false
  musicProgress.value = 0
  musicCurrentTime.value = 0
}

const onMusicLoaded = () => {
  const audio = musicAudioRef.value
  if (audio) {
    musicDuration.value = audio.duration || 0
  }
}

const onMusicSeek = (value: number) => {
  const audio = musicAudioRef.value
  if (audio && audio.duration) {
    audio.currentTime = (value / 100) * audio.duration
    musicProgress.value = value
    musicCurrentTime.value = audio.currentTime
  }
}

const formatMusicTime = (): string => {
  const current = musicCurrentTime.value || 0
  const duration = musicDuration.value || 0
  return `${formatDuration(current)} / ${formatDuration(duration)}`
}

const formatDuration = (seconds: number): string => {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Reset when musicUrl changes
watch(() => props.musicUrl, () => {
  musicPlaying.value = false
  musicProgress.value = 0
  musicCurrentTime.value = 0
  musicDuration.value = 0
  if (musicAudioRef.value) {
    musicAudioRef.value.pause()
    musicAudioRef.value.currentTime = 0
  }
})
</script>



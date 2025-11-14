export const useVideoPlayer = () => {
  const videoRef = ref<HTMLVideoElement | null>(null)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const volume = ref(1)

  const play = () => {
    if (videoRef.value) {
      videoRef.value.play()
      isPlaying.value = true
    }
  }

  const pause = () => {
    if (videoRef.value) {
      videoRef.value.pause()
      isPlaying.value = false
    }
  }

  const togglePlay = () => {
    if (isPlaying.value) {
      pause()
    } else {
      play()
    }
  }

  const seek = (time: number) => {
    if (videoRef.value) {
      videoRef.value.currentTime = time
      currentTime.value = time
    }
  }

  const setVolume = (vol: number) => {
    if (videoRef.value) {
      videoRef.value.volume = vol
      volume.value = vol
    }
  }

  const setPlaybackRate = (rate: number) => {
    if (videoRef.value) {
      videoRef.value.playbackRate = rate
    }
  }

  const onTimeUpdate = (handler: () => void) => {
    if (videoRef.value) {
      videoRef.value.addEventListener('timeupdate', handler)
    }
  }

  const onLoadedMetadata = (handler: () => void) => {
    if (videoRef.value) {
      videoRef.value.addEventListener('loadedmetadata', handler)
    }
  }

  // Watch for video element changes
  watch(videoRef, (newRef) => {
    if (newRef) {
      newRef.addEventListener('play', () => {
        isPlaying.value = true
      })
      newRef.addEventListener('pause', () => {
        isPlaying.value = false
      })
      newRef.addEventListener('timeupdate', () => {
        currentTime.value = newRef.currentTime
      })
      newRef.addEventListener('loadedmetadata', () => {
        duration.value = newRef.duration
      })
    }
  })

  return {
    videoRef,
    isPlaying,
    currentTime,
    duration,
    volume,
    play,
    pause,
    togglePlay,
    seek,
    setVolume,
    setPlaybackRate,
    onTimeUpdate,
    onLoadedMetadata,
  }
}


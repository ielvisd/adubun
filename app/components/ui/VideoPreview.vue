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
    <div class="video-container mb-6">
      <video
        ref="videoRef"
        :src="videoUrl"
        controls
        class="w-full h-full"
      />
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

const videoRef = ref<HTMLVideoElement>()
const toast = useToast()

console.log('[VideoPreview] Component created')
console.log('[VideoPreview] Props:', {
  videoUrl: props.videoUrl,
  duration: props.duration,
  cost: props.cost,
})

onMounted(() => {
  console.log('[VideoPreview] Component mounted')
  console.log('[VideoPreview] Video element ref:', videoRef.value)
  console.log('[VideoPreview] Video URL prop:', props.videoUrl)
  
  if (videoRef.value) {
    console.log('[VideoPreview] Video element found in DOM')
    console.log('[VideoPreview] Video element src:', videoRef.value.src)
    console.log('[VideoPreview] Video element currentSrc:', videoRef.value.currentSrc)
    
    // Add event listeners
    videoRef.value.addEventListener('loadstart', () => {
      console.log('[VideoPreview] Video loadstart event')
    })
    
    videoRef.value.addEventListener('loadedmetadata', () => {
      console.log('[VideoPreview] Video loadedmetadata event')
      console.log('[VideoPreview] Video duration:', videoRef.value?.duration)
      console.log('[VideoPreview] Video videoWidth:', videoRef.value?.videoWidth)
      console.log('[VideoPreview] Video videoHeight:', videoRef.value?.videoHeight)
    })
    
    videoRef.value.addEventListener('loadeddata', () => {
      console.log('[VideoPreview] Video loadeddata event')
    })
    
    videoRef.value.addEventListener('canplay', () => {
      console.log('[VideoPreview] Video canplay event - video is ready to play')
    })
    
    videoRef.value.addEventListener('canplaythrough', () => {
      console.log('[VideoPreview] Video canplaythrough event - video can play through without buffering')
    })
    
    videoRef.value.addEventListener('play', () => {
      console.log('[VideoPreview] Video play event')
    })
    
    videoRef.value.addEventListener('playing', () => {
      console.log('[VideoPreview] Video playing event')
    })
    
    videoRef.value.addEventListener('pause', () => {
      console.log('[VideoPreview] Video pause event')
    })
    
    videoRef.value.addEventListener('waiting', () => {
      console.warn('[VideoPreview] Video waiting event - buffering')
    })
    
    videoRef.value.addEventListener('stalled', () => {
      console.warn('[VideoPreview] Video stalled event - loading stalled')
    })
    
    videoRef.value.addEventListener('error', (e) => {
      console.error('[VideoPreview] Video error event')
      console.error('[VideoPreview] Video error code:', videoRef.value?.error?.code)
      console.error('[VideoPreview] Video error message:', videoRef.value?.error?.message)
      console.error('[VideoPreview] Video error details:', {
        code: videoRef.value?.error?.code,
        message: videoRef.value?.error?.message,
        MEDIA_ERR_ABORTED: videoRef.value?.error?.code === 1,
        MEDIA_ERR_NETWORK: videoRef.value?.error?.code === 2,
        MEDIA_ERR_DECODE: videoRef.value?.error?.code === 3,
        MEDIA_ERR_SRC_NOT_SUPPORTED: videoRef.value?.error?.code === 4,
      })
    })
    
    videoRef.value.addEventListener('abort', () => {
      console.warn('[VideoPreview] Video abort event')
    })
    
    videoRef.value.addEventListener('emptied', () => {
      console.warn('[VideoPreview] Video emptied event')
    })
  } else {
    console.error('[VideoPreview] Video element not found in DOM')
  }
})

watch(() => props.videoUrl, (newUrl) => {
  console.log('[VideoPreview] Video URL prop changed:', newUrl)
  if (videoRef.value) {
    console.log('[VideoPreview] Updating video element src to:', newUrl)
    videoRef.value.src = newUrl
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


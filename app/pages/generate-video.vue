<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 sm:py-12">
    <UContainer class="max-w-4xl px-4 sm:px-6">
      <!-- Loading/Progress State -->
      <div v-if="status !== 'completed'" class="space-y-6">
        <div class="text-center mb-8">
          <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Generating Your Video
          </h1>
          <p class="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
            This may take a few minutes...
          </p>
        </div>

        <!-- Progress Card -->
        <UCard class="bg-white dark:bg-gray-800 shadow-lg">
          <template #header>
            <div class="flex justify-between items-center">
              <h3 class="text-xl font-semibold text-gray-900 dark:text-white">Progress</h3>
              <UBadge :color="statusColor" size="lg" class="uppercase">{{ statusText }}</UBadge>
            </div>
          </template>

          <!-- Overall Progress -->
          <div class="space-y-4">
            <div>
              <div class="flex justify-between items-center mb-2">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Overall Progress</span>
                <span class="text-sm font-semibold text-gray-900 dark:text-white">{{ progress }}%</span>
              </div>
              <UProgress :value="progress" class="mb-4" />
            </div>

            <!-- Current Step -->
            <div class="flex items-center gap-3">
              <UIcon
                v-if="currentStep === 'generating-assets'"
                name="i-heroicons-arrow-path"
                class="w-6 h-6 text-secondary-500 animate-spin"
              />
              <UIcon
                v-else-if="currentStep === 'composing-video'"
                name="i-heroicons-film"
                class="w-6 h-6 text-secondary-500"
              />
              <UIcon
                v-else
                name="i-heroicons-clock"
                class="w-6 h-6 text-gray-400"
              />
              <span class="text-sm text-gray-700 dark:text-gray-300">
                {{ stepMessage }}
              </span>
            </div>

            <!-- Error Message -->
            <UAlert
              v-if="status === 'failed' && error"
              color="red"
              variant="soft"
              title="Generation Failed"
              :description="error"
              class="mt-4"
            >
              <template #actions>
                <UButton
                  variant="ghost"
                  color="red"
                  size="sm"
                  @click="retryGeneration"
                >
                  Retry
                </UButton>
              </template>
            </UAlert>
          </div>
        </UCard>
      </div>

      <!-- Completed State: Video Player -->
      <div v-else class="space-y-6">
        <div class="text-center mb-8">
          <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Your Video is Ready!
          </h1>
          <p class="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
            Review your generated video below
          </p>
        </div>

        <!-- Video Player -->
        <UCard class="bg-white dark:bg-gray-800 overflow-hidden">
          <div class="aspect-[9/16] w-full bg-black flex items-center justify-center">
            <video
              v-if="videoUrl"
              :src="videoUrl"
              controls
              class="w-full h-full object-contain"
              preload="metadata"
            >
              Your browser does not support the video tag.
            </video>
            <div v-else class="text-white text-center p-8">
              <UIcon name="i-heroicons-video-camera" class="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Video not available</p>
            </div>
          </div>
        </UCard>

        <!-- Action Buttons -->
        <div class="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
          <UButton
            v-if="videoUrl"
            color="secondary"
            variant="solid"
            size="lg"
            @click="downloadVideo"
            class="bg-secondary-500 hover:bg-secondary-600 text-white font-semibold min-h-[44px]"
          >
            <UIcon name="i-heroicons-arrow-down-tray" class="w-5 h-5 mr-2" />
            Download Video
          </UButton>
          <UButton
            variant="outline"
            color="gray"
            size="lg"
            @click="$router.push('/history')"
            class="min-h-[44px]"
          >
            View History
          </UButton>
          <UButton
            variant="outline"
            color="gray"
            size="lg"
            @click="$router.push('/')"
            class="min-h-[44px]"
          >
            Create Another
          </UButton>
        </div>
      </div>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

const status = ref<'processing' | 'completed' | 'failed'>('processing')
const progress = ref(0)
const currentStep = ref<'generating-assets' | 'composing-video' | 'completed'>('generating-assets')
const stepMessage = ref('Starting generation...')
const error = ref<string | null>(null)
const videoUrl = ref<string | null>(null)
const videoId = ref<string | null>(null)
const jobId = ref<string | null>(null)
const pollingInterval = ref<NodeJS.Timeout | null>(null)

// Computed properties
const statusColor = computed(() => {
  if (status.value === 'completed') return 'green'
  if (status.value === 'failed') return 'red'
  return 'blue'
})

const statusText = computed(() => {
  if (status.value === 'completed') return 'Completed'
  if (status.value === 'failed') return 'Failed'
  return 'Processing'
})

// Poll for video generation status
const pollStatus = async () => {
  if (!jobId.value) return

  try {
    const result = await $fetch(`/api/generate-video-status/${jobId.value}`) as {
      status: 'processing' | 'completed' | 'failed'
      progress: number
      step?: 'generating-assets' | 'composing-video' | 'completed'
      message?: string
      videoUrl?: string
      videoId?: string
      error?: string
    }

    status.value = result.status
    progress.value = result.progress
    currentStep.value = result.step || 'generating-assets'
    
    if (result.message) {
      stepMessage.value = result.message
    } else {
      stepMessage.value = getStepMessage(currentStep.value)
    }

    if (result.videoUrl) {
      videoUrl.value = result.videoUrl
      videoId.value = result.videoId || null
    }

    if (result.error) {
      error.value = result.error
    }

    // Stop polling if completed or failed
    if (result.status === 'completed' || result.status === 'failed') {
      if (pollingInterval.value) {
        clearInterval(pollingInterval.value)
        pollingInterval.value = null
      }

      if (result.status === 'completed') {
        toast.add({
          title: 'Video Generated!',
          description: 'Your video is ready to view and download.',
          color: 'green',
        })
      }
    }
  } catch (err: any) {
    console.error('[Generate Video] Error polling status:', err)
    error.value = err.message || 'Failed to check generation status'
    status.value = 'failed'
    
    if (pollingInterval.value) {
      clearInterval(pollingInterval.value)
      pollingInterval.value = null
    }
  }
}

// Get step message based on current step
const getStepMessage = (step: string): string => {
  switch (step) {
    case 'generating-assets':
      return 'Generating video assets and voiceover...'
    case 'composing-video':
      return 'Composing final video...'
    case 'completed':
      return 'Video generation complete!'
    default:
      return 'Processing...'
  }
}

// Start polling
const startPolling = () => {
  if (pollingInterval.value) {
    clearInterval(pollingInterval.value)
  }

  // Poll immediately, then every 2 seconds
  pollStatus()
  pollingInterval.value = setInterval(() => {
    pollStatus()
  }, 2000)
}

// Retry generation
const retryGeneration = async () => {
  if (!import.meta.client) return

  try {
    // Get storyboard and frames from sessionStorage
    const storyboardStr = sessionStorage.getItem('generateStoryboard')
    const framesStr = sessionStorage.getItem('generateFrames')

    if (!storyboardStr || !framesStr) {
      toast.add({
        title: 'Error',
        description: 'Cannot retry: missing storyboard or frames data',
        color: 'red',
      })
      return
    }

    const storyboard = JSON.parse(storyboardStr)
    const frames = JSON.parse(framesStr)

    // Reset state
    status.value = 'processing'
    progress.value = 0
    error.value = null
    videoUrl.value = null
    videoId.value = null

    // Start new generation
    const result = await $fetch('/api/generate-video', {
      method: 'POST',
      body: {
        storyboard,
        frames,
      },
    }) as { jobId: string }

    jobId.value = result.jobId
    sessionStorage.setItem('generateVideoJobId', result.jobId)

    // Start polling
    startPolling()

    toast.add({
      title: 'Retrying',
      description: 'Video generation has been restarted',
      color: 'blue',
    })
  } catch (err: any) {
    console.error('[Generate Video] Error retrying:', err)
    toast.add({
      title: 'Error',
      description: err.message || 'Failed to retry generation',
      color: 'red',
    })
  }
}

// Download video
const downloadVideo = async () => {
  if (!videoUrl.value) {
    toast.add({
      title: 'Error',
      description: 'Video URL not available',
      color: 'red',
    })
    return
  }

  try {
    const link = document.createElement('a')
    link.href = videoUrl.value
    link.download = `adubun-ad-${Date.now()}.mp4`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast.add({
      title: 'Download Started',
      description: 'Your video download has started',
      color: 'green',
    })
  } catch (err: any) {
    toast.add({
      title: 'Download Error',
      description: err.message || 'Failed to download video',
      color: 'red',
    })
  }
}

// Load jobId on mount
onMounted(async () => {
  if (!import.meta.client) return

  // Get jobId from route query or sessionStorage
  const routeJobId = route.query.jobId as string | undefined
  const storedJobId = sessionStorage.getItem('generateVideoJobId')

  jobId.value = routeJobId || storedJobId || null

  if (!jobId.value) {
    toast.add({
      title: 'Error',
      description: 'No video generation job found',
      color: 'red',
    })
    // Redirect to preview or home
    await router.push('/preview')
    return
  }

  // Start polling
  startPolling()
})

// Cleanup on unmount
onUnmounted(() => {
  if (pollingInterval.value) {
    clearInterval(pollingInterval.value)
    pollingInterval.value = null
  }
})
</script>


<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 sm:py-12">
    <UContainer class="max-w-4xl px-4 sm:px-6">
      <!-- Loading State -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-24">
        <UIcon name="i-heroicons-arrow-path" class="w-16 h-16 text-secondary-500 animate-spin mb-4" />
        <h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Loading Video</h2>
        <p class="text-gray-600 dark:text-gray-400 text-center">Preparing your ad video...</p>
      </div>

      <!-- Error State -->
      <UAlert
        v-else-if="error"
        color="red"
        variant="soft"
        :title="error"
        class="mb-6"
      >
        <template #actions>
          <UButton
            variant="ghost"
            color="red"
            @click="$router.push('/history')"
          >
            View History
          </UButton>
        </template>
      </UAlert>

      <!-- Video Preview -->
      <div v-else-if="videoData" class="space-y-6">
        <div class="text-center mb-8">
          <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Your Ad is Ready!
          </h1>
          <p class="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
            Review your generated ad video below
          </p>
        </div>

        <!-- Video Player -->
        <UCard class="bg-white dark:bg-gray-800 overflow-hidden">
          <div class="aspect-[9/16] w-full bg-black flex items-center justify-center">
            <video
              v-if="videoData.videoUrl"
              :src="videoData.videoUrl"
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
          
          <!-- Music Player -->
          <div class="p-4">
            <MusicPlayer :music-url="videoData.musicUrl" />
          </div>
        </UCard>

        <!-- Download Button -->
        <div class="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
          <UButton
            v-if="videoData.videoUrl"
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
        </div>

        <!-- Storyboard Summary -->
        <UCard v-if="videoData.storyboard" class="bg-white dark:bg-gray-800">
          <template #header>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Storyboard Summary</h2>
          </template>

          <div class="space-y-4">
            <div
              v-for="(segment, index) in videoData.storyboard.segments"
              :key="index"
              class="border-l-2 border-secondary-500 pl-4 py-2"
            >
              <div class="flex items-center justify-between mb-1">
                <span class="text-sm font-semibold text-gray-900 dark:text-white uppercase">
                  {{ segment.type === 'hook' ? 'Hook' : segment.type === 'cta' ? 'Call to Action' : 'Body' }}
                </span>
                <span class="text-xs text-gray-500 dark:text-gray-400">
                  {{ segment.startTime }}s - {{ segment.endTime }}s
                </span>
              </div>
              <p class="text-sm text-gray-700 dark:text-gray-300 mb-1">
                {{ segment.description }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400 italic">
                {{ segment.visualPrompt }}
              </p>
            </div>
          </div>
        </UCard>

        <!-- Voiceover Script -->
        <UCard v-if="videoData.voiceoverScript" class="bg-white dark:bg-gray-800">
          <template #header>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Voiceover Script</h2>
          </template>

          <div class="space-y-3">
            <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
              {{ videoData.voiceoverScript }}
            </p>
            <div
              v-if="videoData.voiceoverSegments && videoData.voiceoverSegments.length > 0"
              class="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-700"
            >
              <div
                v-for="(seg, index) in videoData.voiceoverSegments"
                :key="index"
                class="text-xs"
              >
                <span class="font-semibold text-gray-900 dark:text-white">
                  {{ seg.type === 'hook' ? 'Hook' : seg.type === 'cta' ? 'CTA' : 'Body' }}:
                </span>
                <span class="text-gray-600 dark:text-gray-400 ml-2">{{ seg.script }}</span>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
import type { Storyboard } from '~/types/generation'
import MusicPlayer from '~/components/ui/MusicPlayer.vue'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

const loading = ref(true)
const error = ref<string | null>(null)
const videoData = ref<{
  videoUrl: string
  storyboard?: Storyboard
  voiceoverScript?: string
  voiceoverSegments?: Array<{ type: string; script: string }>
  duration?: number
  cost?: number
  musicUrl?: string | null
} | null>(null)

onMounted(async () => {
  // Load video data from sessionStorage or route params
  if (process.client) {
    try {
      const storedData = sessionStorage.getItem('videoResult')
      if (storedData) {
        const data = JSON.parse(storedData)
        videoData.value = {
          videoUrl: data.videoUrl || '',
          storyboard: data.storyboard,
          voiceoverScript: data.voiceoverScript || data.script,
          voiceoverSegments: data.voiceoverSegments || data.segments,
          duration: data.duration,
          cost: data.cost,
          musicUrl: data.musicUrl || null,
        }
        sessionStorage.removeItem('videoResult')
      } else if (route.query.videoId) {
        // Load from API if videoId is provided
        try {
          const result = await $fetch(`/api/video/${route.query.videoId}`)
          videoData.value = {
            videoUrl: result.url || '',
            storyboard: result.storyboard,
            voiceoverScript: result.voiceoverScript,
            voiceoverSegments: result.voiceoverSegments,
            duration: result.duration,
            cost: result.generationCost,
            musicUrl: result.musicUrl || null,
          }
        } catch (err: any) {
          error.value = err.data?.message || err.message || 'Failed to load video'
        }
      } else {
        error.value = 'No video data found'
      }
      loading.value = false
    } catch (err: any) {
      console.error('Error loading video data:', err)
      error.value = err.message || 'Failed to load video data'
      loading.value = false
    }
  }
})

const downloadVideo = async () => {
  if (!videoData.value?.videoUrl) {
    toast.add({
      title: 'Error',
      description: 'Video URL not available',
      color: 'red',
    })
    return
  }

  try {
    // Create a temporary anchor element to trigger download
    const link = document.createElement('a')
    link.href = videoData.value.videoUrl
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
</script>

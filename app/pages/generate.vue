<template>
  <div class="py-12">
    <UContainer class="max-w-5xl">
      <!-- Loading state while planning storyboard -->
      <div v-if="planningStoryboard" class="flex flex-col items-center justify-center py-24">
        <UIcon name="i-heroicons-arrow-path" class="w-16 h-16 text-secondary-500 animate-spin mb-4" />
        <h2 class="text-2xl font-semibold text-gray-900 mb-2">Planning Your Storyboard</h2>
        <p class="text-gray-600 text-center">We're analyzing your prompt and creating a detailed storyboard...</p>
      </div>

      <!-- Storyboard content -->
      <template v-else>
        <div v-if="storyboard" class="mb-6">
          <UBadge 
            :color="storyboard.meta.mode === 'demo' ? 'yellow' : 'green'"
            variant="subtle"
            size="lg"
          >
            {{ storyboard.meta.mode === 'demo' ? 'Demo Mode' : 'Production Mode' }}
          </UBadge>
          <p v-if="storyboard.meta.mode === 'demo'" class="text-sm text-gray-600 mt-2">
            All scenes are shown in the storyboard, but only the first scene will be generated.
          </p>
          <div v-if="storyboard.meta.firstFrameImage || storyboard.meta.subjectReference" class="mt-4 text-sm text-gray-600">
            <p v-if="storyboard.meta.firstFrameImage" class="mb-1">
              <strong>Global First Frame:</strong> {{ storyboard.meta.firstFrameImage }}
            </p>
            <p v-if="storyboard.meta.subjectReference">
              <strong>Global Subject Reference:</strong> {{ storyboard.meta.subjectReference }}
            </p>
          </div>
        </div>

        <StoryboardView
          v-if="storyboard"
          :storyboard="storyboard"
          @edit="handleEditSegment"
        />

        <GenerationProgress
          v-if="generationStarted"
          :segments="segments"
          :overall-progress="overallProgress"
          :status="status"
          :current-cost="currentCost"
          :estimated-total="estimatedTotal"
          :overall-error="overallError"
        />

        <CompositionTimeline
          v-if="assetsReady"
          :clips="clips"
          :total-duration="totalDuration"
          @compose="handleCompose"
        />

        <UButton
          v-if="!generationStarted && storyboard"
          size="xl"
          color="secondary"
          variant="solid"
          class="w-full mt-8 bg-secondary-500 hover:bg-secondary-600 text-white font-semibold py-4 rounded-lg"
          @click="startGeneration"
        >
          Start Generation
        </UButton>
      </template>
    </UContainer>

    <SegmentEditModal
      v-model="editModalOpen"
      :segment="selectedSegment"
      :segment-index="selectedSegmentIndex"
      :total-duration="storyboard?.meta?.duration || 30"
      :all-segments="storyboard?.segments || []"
      @saved="handleSegmentSaved"
    />
  </div>
</template>

<script setup lang="ts">
import StoryboardView from '~/components/generation/StoryboardView.vue'
import GenerationProgress from '~/components/ui/GenerationProgress.vue'
import CompositionTimeline from '~/components/generation/CompositionTimeline.vue'
import SegmentEditModal from '~/components/generation/SegmentEditModal.vue'
import type { Segment, Storyboard } from '~/app/types/generation'

const route = useRoute()
// Get storyboard from sessionStorage (passed via navigateTo)
const storyboard = ref<Storyboard | null>(null)
const generationStarted = ref(false)
const assetsReady = ref(false)
const planningStoryboard = ref(false)

// Edit modal state
const editModalOpen = ref(false)
const selectedSegment = ref<Segment | null>(null)
const selectedSegmentIndex = ref<number | null>(null)

const { segments, overallProgress, status, overallError, startGeneration: startGen } = useGeneration()
const { currentCost, estimatedTotal, startPolling } = useCostTracking()

// Start cost polling and load storyboard
onMounted(async () => {
  startPolling()
  // Access state from sessionStorage
  if (process.client) {
    try {
      // Check if we have parsed prompt data (new flow)
      const parsedPromptData = sessionStorage.getItem('parsedPrompt')
      
      if (parsedPromptData) {
        // New flow: plan storyboard on generate page
        planningStoryboard.value = true
        
        try {
          const parsed = JSON.parse(parsedPromptData)
          
          // Call plan-storyboard API
          const storyboardResult = await $fetch('/api/plan-storyboard', {
            method: 'POST',
            body: { parsed },
          })
          
          storyboard.value = storyboardResult
          
          // Clear sessionStorage
          sessionStorage.removeItem('parsedPrompt')
        } catch (error: any) {
          console.error('Failed to plan storyboard:', error)
          const toast = useToast()
          toast.add({
            title: 'Error',
            description: error.message || 'Failed to plan storyboard. Please try again.',
            color: 'error',
          })
          navigateTo('/')
        } finally {
          planningStoryboard.value = false
        }
      } else {
        // Legacy flow: check for existing storyboard
        const stored = sessionStorage.getItem('storyboard')
        if (stored) {
          storyboard.value = JSON.parse(stored)
          // Clear after reading to avoid stale data
          sessionStorage.removeItem('storyboard')
        } else {
          // If no storyboard found, redirect back to home
          const toast = useToast()
          toast.add({
            title: 'No storyboard found',
            description: 'Please start a new generation from the home page',
            color: 'warning',
          })
          navigateTo('/')
        }
      }
    } catch (error) {
      console.error('Failed to load storyboard:', error)
      const toast = useToast()
      toast.add({
        title: 'Error',
        description: 'Failed to load storyboard. Please try again.',
        color: 'error',
      })
      navigateTo('/')
    }
  }
})

const startGeneration = async () => {
  if (!storyboard.value) return

  generationStarted.value = true
  try {
    await startGen(storyboard.value)

    // Wait for completion
    watch(status, (newStatus) => {
      if (newStatus === 'completed') {
        assetsReady.value = true
      }
    })
  } catch (error) {
    console.error('Generation failed:', error)
  }
}

const clips = computed(() => {
  if (!segments.value || segments.value.length === 0) {
    console.log('[Generate] No segments available for clips')
    return []
  }
  
  const filtered = segments.value.filter((s: any) => s.status === 'completed' && s.videoUrl)
  console.log('[Generate] Segments filtered for clips:', filtered.length, 'out of', segments.value.length)
  console.log('[Generate] Segment details:', JSON.stringify(filtered.map((s: any) => ({
    segmentId: s.segmentId,
    hasVideo: !!s.videoUrl,
    hasAudio: !!s.voiceUrl,
    videoUrl: s.videoUrl,
    voiceUrl: s.voiceUrl,
    startTime: s.startTime,
    endTime: s.endTime,
    type: s.type,
  })), null, 2))
  
  const result = filtered.map((s: any) => ({
    videoUrl: s.videoUrl!,
    voiceUrl: s.voiceUrl,
    startTime: s.startTime,
    endTime: s.endTime,
    type: s.type,
  }))
  
  const clipsWithAudio = result.filter(c => c.voiceUrl).length
  console.log('[Generate] Clips with audio:', clipsWithAudio, 'out of', result.length)
  
  return result
})

const totalDuration = computed(() => {
  return Math.max(...clips.value.map((c: any) => c.endTime), 0)
})

const handleCompose = async (options: any) => {
  try {
    console.log('[Generate] Starting video composition')
    console.log('[Generate] Clips to compose:', JSON.stringify(clips.value, null, 2))
    console.log('[Generate] Composition options:', JSON.stringify(options, null, 2))
    
    const result = await $fetch('/api/compose-video', {
      method: 'POST',
      body: {
        clips: clips.value,
        options,
      },
    })

    console.log('[Generate] Compose video API response:', JSON.stringify(result, null, 2))
    console.log('[Generate] Video URL from API:', result.videoUrl)
    console.log('[Generate] Video ID from API:', result.videoId)

    // Navigate with state instead of query params for better data passing
    await navigateTo({
      path: '/preview',
      state: {
        videoUrl: result.videoUrl,
        videoId: result.videoId,
        duration: totalDuration.value,
        cost: currentCost.value,
      },
    })
    console.log('[Generate] Navigation to preview completed')
  } catch (error: any) {
    console.error('[Generate] Composition error:', error.message)
    console.error('[Generate] Error stack:', error.stack)
    console.error('[Generate] Error details:', JSON.stringify(error, null, 2))
    
    const toast = useToast()
    toast.add({
      title: 'Composition failed',
      description: error.message,
      color: 'error',
    })
  }
}

const handleEditSegment = (index: number) => {
  if (!storyboard.value || !storyboard.value.segments[index]) {
    const toast = useToast()
    toast.add({
      title: 'Error',
      description: 'Segment not found',
      color: 'error',
    })
    return
  }

  selectedSegment.value = { ...storyboard.value.segments[index] }
  selectedSegmentIndex.value = index
  editModalOpen.value = true
}

const handleSegmentSaved = async (updatedSegment: Segment, index: number) => {
  if (!storyboard.value || index < 0) {
    return
  }

  try {
    // Handle file uploads if needed
    let segmentToSave = { ...updatedSegment }
    
    // If firstFrameImage is a File, upload it
    if (updatedSegment.firstFrameImage instanceof File) {
      const formData = new FormData()
      formData.append('file', updatedSegment.firstFrameImage)
      const uploadResult = await $fetch('/api/upload-brand-assets', {
        method: 'POST',
        body: formData,
      })
      if (uploadResult.files && uploadResult.files.length > 0) {
        segmentToSave.firstFrameImage = uploadResult.files[0]
      }
    }
    
    // If subjectReference is a File, upload it
    if (updatedSegment.subjectReference instanceof File) {
      const formData = new FormData()
      formData.append('file', updatedSegment.subjectReference)
      const uploadResult = await $fetch('/api/upload-brand-assets', {
        method: 'POST',
        body: formData,
      })
      if (uploadResult.files && uploadResult.files.length > 0) {
        segmentToSave.subjectReference = uploadResult.files[0]
      }
    }

    // Update local state optimistically
    const updatedSegments = [...storyboard.value.segments]
    updatedSegments[index] = segmentToSave

    // Update storyboard with new segments
    const updatedStoryboard = {
      ...storyboard.value,
      segments: updatedSegments,
    }

    // Save to backend
    await $fetch(`/api/storyboard/${storyboard.value.id}`, {
      method: 'PUT',
      body: {
        segments: updatedSegments,
      },
    })

    // Update local state
    storyboard.value = updatedStoryboard

    const toast = useToast()
    toast.add({
      title: 'Success',
      description: 'Segment updated successfully',
      color: 'success',
    })
  } catch (error: any) {
    console.error('Failed to save segment:', error)
    const toast = useToast()
    toast.add({
      title: 'Save Failed',
      description: error.message || 'Failed to save segment. Please try again.',
      color: 'error',
    })

    // Revert optimistic update by reloading from sessionStorage or refetching
    // For now, we'll just show the error - the user can try again
  }
}
</script>


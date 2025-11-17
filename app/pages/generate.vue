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
          <!-- Prominent Mode Display - Mendo Style -->
          <div class="bg-black dark:bg-gray-800 text-white py-4 px-6 mb-4">
            <div class="flex items-center gap-4">
              <div class="text-lg sm:text-xl font-bold uppercase tracking-wide">
                {{ storyboard.meta.mode === 'demo' ? 'Demo Mode' : 'Production Mode' }}
              </div>
              <div class="text-sm sm:text-base text-gray-300">
                <span v-if="storyboard.meta.mode === 'demo'">
                  Only the first scene will be generated for faster testing
                </span>
                <span v-else>
                  All scenes will be generated
                </span>
              </div>
            </div>
          </div>
          <div v-if="storyboard.meta.firstFrameImage || storyboard.meta.subjectReference" class="mt-4 text-sm text-gray-600 dark:text-gray-400">
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
          :assets="completedAssets"
          :retry-segment="handleRetrySegment"
          @edit="handleEditSegment"
          @prompt-selected="handlePromptSelected"
          @regenerate="handleRegenerateEvent"
        />

        <AudioScriptView
          v-if="storyboard"
          :segments="storyboard.segments"
          class="mt-6"
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

        <VideoPreview
          :clips="clips"
          :status="status"
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
import AudioScriptView from '~/components/generation/AudioScriptView.vue'
import GenerationProgress from '~/components/ui/GenerationProgress.vue'
import CompositionTimeline from '~/components/generation/CompositionTimeline.vue'
import VideoPreview from '~/components/generation/VideoPreview.vue'
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

const { segments, overallProgress, status, overallError, jobId, startGeneration: startGen, pollProgress: pollGenProgress, reset, retrySegment: retrySegmentGen } = useGeneration()
const { currentCost, estimatedTotal, startPolling } = useCostTracking()
const toast = useToast()

// Poll for storyboard status
const pollStoryboardStatus = async (jobId: string, meta: any) => {
  const maxAttempts = 60 // 2 minutes max (60 * 2 seconds)
  let attempts = 0
  
  while (attempts < maxAttempts) {
    try {
      const statusResult = await $fetch('/api/plan-storyboard-status', {
        method: 'POST',
        body: {
          id: jobId,
          meta: meta,
        },
      })
      
      if (statusResult.status === 'completed' && statusResult.storyboard) {
        storyboard.value = statusResult.storyboard
        // Save storyboard to sessionStorage
        saveStoryboardToStorage(storyboard.value)
        return
      } else if (statusResult.status === 'failed') {
        throw new Error(statusResult.error || 'Storyboard generation failed')
      }
      
      // Wait 2 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 2000))
      attempts++
    } catch (error: any) {
      if (error.message && error.message.includes('failed')) {
        throw error
      }
      // Continue polling on other errors
      await new Promise(resolve => setTimeout(resolve, 2000))
      attempts++
    }
  }
  
  throw new Error('Storyboard generation timed out')
}

// Mode is set on stories page and displayed prominently - no toggle needed here

// Map completed segments to assets format for StoryboardView
const completedAssets = computed(() => {
  if (!segments.value || segments.value.length === 0) {
    return []
  }
  
  const completed = segments.value.filter((s: any) => s.status === 'completed')
  
  const assets = completed.map((s: any) => {
    // Extract videoUrl from all possible locations
    const videoUrl = s.videoUrl || 
                    s.metadata?.videoUrl || 
                    s.metadata?.replicateVideoUrl ||
                    null
    
    // Extract voiceUrl from all possible locations
    const voiceUrl = s.voiceUrl || 
                    s.metadata?.voiceUrl ||
                    null
    
    // Debug logging for videoUrl extraction
    if (!videoUrl) {
      console.warn(`[CompletedAssets] Segment ${s.segmentId} has no videoUrl:`, {
        segmentId: s.segmentId,
        hasTopLevelVideoUrl: !!s.videoUrl,
        hasMetadataVideoUrl: !!s.metadata?.videoUrl,
        hasMetadataReplicateVideoUrl: !!s.metadata?.replicateVideoUrl,
        segmentType: s.type,
        status: s.status,
        metadataKeys: s.metadata ? Object.keys(s.metadata) : [],
      })
    } else {
      console.log(`[CompletedAssets] Segment ${s.segmentId} videoUrl found:`, {
        segmentId: s.segmentId,
        segmentType: s.type,
        videoUrlSource: s.videoUrl ? 'top-level' : 
                       s.metadata?.videoUrl ? 'metadata.videoUrl' :
                       s.metadata?.replicateVideoUrl ? 'metadata.replicateVideoUrl' :
                       'unknown',
        videoUrlPreview: videoUrl.substring(0, 50) + '...',
      })
    }
    
    return {
      segmentId: s.segmentId,
      videoUrl,
      voiceUrl,
      metadata: s.metadata,
    }
  })
  
  console.log(`[CompletedAssets] Mapped ${assets.length} completed segments to assets (${assets.filter(a => a.videoUrl).length} with videoUrl)`)
  
  return assets
})

// Helper function to save storyboard to sessionStorage
const saveStoryboardToStorage = (sb: Storyboard | null) => {
  if (process.client && sb) {
    try {
      sessionStorage.setItem('generateStoryboard', JSON.stringify(sb))
      console.log('[Generate] Storyboard saved to sessionStorage')
    } catch (error) {
      console.error('[Generate] Failed to save storyboard to sessionStorage:', error)
    }
  }
}

// Helper function to restore generation state
const restoreGenerationState = async () => {
  if (!process.client) return false
  
  try {
    const jobStateData = sessionStorage.getItem('generateJobState')
    if (jobStateData) {
      const jobState = JSON.parse(jobStateData)
      console.log('[Generate] Restoring generation state:', jobState)
      
      if (jobState.jobId) {
        // Restore jobId and segments
        jobId.value = jobState.jobId
        if (jobState.segments && Array.isArray(jobState.segments)) {
          segments.value = jobState.segments
          console.log(`[Generate] Restored ${segments.value.length} segments`)
        }
        
        // Restore status, progress, and error for immediate UI update
        if (jobState.status) {
          status.value = jobState.status
        }
        if (jobState.overallProgress !== undefined) {
          overallProgress.value = jobState.overallProgress
        }
        if (jobState.overallError !== undefined) {
          overallError.value = jobState.overallError
        }
        
        // Resume polling if job is still active
        if (jobState.status === 'processing' || jobState.status === 'pending') {
          console.log('[Generate] Resuming generation status polling...')
          // Start polling - this will be handled by the composable
          if (pollGenProgress) {
            pollGenProgress()
          }
          return true
        }
      }
    }
  } catch (error) {
    console.error('[Generate] Failed to restore generation state:', error)
  }
  
  return false
}

// Start cost polling and load storyboard
onMounted(async () => {
  startPolling()
  // Access state from sessionStorage
  if (process.client) {
    try {
      // First, check for persisted storyboard (from previous session)
      const persistedStoryboard = sessionStorage.getItem('generateStoryboard')
      
      if (persistedStoryboard) {
        console.log('[Generate] Found persisted storyboard, restoring...')
        storyboard.value = JSON.parse(persistedStoryboard)
        
        // Try to restore generation state and resume polling
        const stateRestored = await restoreGenerationState()
        if (stateRestored) {
          console.log('[Generate] Generation state restored and polling resumed')
          // If state was restored (job is active), don't auto-start
          return
        }
        // If state was NOT restored, continue to auto-start check below
      }
      
      // Check if we have parsed prompt data (new flow)
      const parsedPromptData = sessionStorage.getItem('parsedPrompt')
      
      if (parsedPromptData) {
        // New flow: plan storyboard on generate page
        planningStoryboard.value = true
        
        try {
          const parsed = JSON.parse(parsedPromptData)
          
          // Check if we have a selected story from demo-stories page
          if (parsed.selectedStory) {
            // Convert selected story to storyboard format
            const selectedStory = parsed.selectedStory
            const segments = selectedStory.clips.map((clip: any, index: number) => {
              const startTime = index * clip.duration
              const endTime = startTime + clip.duration
              
              // Determine segment type based on index
              let type = 'body'
              if (index === 0) type = 'hook'
              else if (index === selectedStory.clips.length - 1) type = 'cta'
              
              return {
                type,
                description: clip.description,
                startTime,
                endTime,
                visualPrompt: clip.description,
                visualPromptAlternatives: [],
                audioNotes: index === 0 ? selectedStory.hook : 
                           index === 1 ? selectedStory.bodyOne :
                           index === 2 ? selectedStory.bodyTwo :
                           selectedStory.callToAction,
              }
            })
            
            // Create storyboard from selected story
            storyboard.value = {
              id: `storyboard-${Date.now()}`,
              segments,
              meta: {
                ...parsed.meta,
                duration: 24,
                mode: 'production',
              },
              createdAt: Date.now(),
            }
            
            // Save storyboard to sessionStorage
            if (storyboard.value) {
              saveStoryboardToStorage(storyboard.value)
            }
          } else {
            // Regular flow: call plan-storyboard API
            const storyboardResult = await $fetch('/api/plan-storyboard', {
              method: 'POST',
              body: { parsed },
            })
            
            // Check if this is an async response with jobId
            if (storyboardResult.jobId && storyboardResult.status === 'pending') {
              // Poll for status (use meta from response if available, otherwise from parsed)
              await pollStoryboardStatus(storyboardResult.jobId, storyboardResult.meta || parsed.meta)
            } else {
              // Synchronous response (backward compatibility)
              storyboard.value = storyboardResult
            }
            
            // Save storyboard to sessionStorage
            if (storyboard.value) {
              saveStoryboardToStorage(storyboard.value)
            }
          }
          
          // Clear parsedPrompt after successful planning
          sessionStorage.removeItem('parsedPrompt')
          sessionStorage.removeItem('selectedStory')
        } catch (error: any) {
          console.error('[Generate] Storyboard planning error:', error)
          const toast = useToast()
          toast.add({
            title: 'Error',
            description: error.message || 'Failed to plan storyboard. Please try again.',
            color: 'error',
          })
          // Don't navigate away - let user stay on page to see error
          // navigateTo('/')
        } finally {
          planningStoryboard.value = false
        }
      } else {
        // Legacy flow: check for existing storyboard (temporary storage)
        const stored = sessionStorage.getItem('storyboard')
        if (stored) {
          storyboard.value = JSON.parse(stored)
          // Save to persistent storage
          saveStoryboardToStorage(storyboard.value)
          // Clear temporary storage
          sessionStorage.removeItem('storyboard')
        } else {
          // If no storyboard found, show error but don't redirect
          console.error('[Generate] No storyboard found in sessionStorage')
          const toast = useToast()
          toast.add({
            title: 'No storyboard found',
            description: 'Please start a new generation from the home page',
            color: 'warning',
          })
          // Don't navigate away immediately - let user see the error
          // navigateTo('/')
        }
      }
    } catch (error) {
      console.error('[Generate] Failed to load storyboard:', error)
      const toast = useToast()
      toast.add({
        title: 'Error',
        description: 'Failed to load storyboard. Please try again.',
        color: 'error',
      })
      // Don't navigate away - let user retry or see what went wrong
      // navigateTo('/')
    }
    
    // Auto-start generation if storyboard is loaded and no state was restored
    if (storyboard.value && status.value === 'idle') {
      // Small delay to ensure UI is ready
      await nextTick()
      console.log('[Generate] Auto-starting video generation...')
      startGeneration()
    }
  }
})

// Watch for storyboard changes and save to sessionStorage
watch(storyboard, (newStoryboard) => {
  if (newStoryboard) {
    saveStoryboardToStorage(newStoryboard)
  }
}, { deep: true })

// Watch for status changes (set up once, not inside startGeneration)
const statusWatcher = watch(status, (newStatus) => {
  if (newStatus === 'completed') {
    assetsReady.value = true
  }
  // Save generation state when status changes
  saveGenerationState()
})

// Helper function to save generation state to sessionStorage
const saveGenerationState = () => {
  if (process.client) {
    try {
      const state = {
        jobId: jobId.value,
        segments: segments.value,
        status: status.value,
        overallProgress: overallProgress.value,
        overallError: overallError.value,
        timestamp: Date.now(),
      }
      sessionStorage.setItem('generateJobState', JSON.stringify(state))
      console.log('[Generate] Generation state saved to sessionStorage')
    } catch (error) {
      console.error('[Generate] Failed to save generation state:', error)
    }
  }
}

// Watch for segments changes and save state
watch(segments, () => {
  saveGenerationState()
}, { deep: true })

// Watch for jobId changes and save state
watch(jobId, () => {
  saveGenerationState()
})

// Clean up watcher on unmount
onUnmounted(() => {
  statusWatcher()
})

const startGeneration = async () => {
  // Save generation state when starting
  saveGenerationState()
  
  if (!storyboard.value) {
    console.warn('[Generate] Cannot start generation: no storyboard')
    return
  }
  
  // Prevent multiple simultaneous calls
  if (generationStarted.value) {
    console.warn('[Generate] Generation already started, ignoring duplicate call')
    console.warn('[Generate] Current status:', status.value, 'Job ID:', jobId.value)
    return
  }

  // Log mode and warn if in demo mode with multiple segments
  const mode = storyboard.value.meta.mode || 'production'
  const segmentCount = storyboard.value.segments.length
  console.log(`[Generate] Starting generation in ${mode} mode with ${segmentCount} segments`)
  console.log(`[Generate] Storyboard ID: ${storyboard.value.id}`)
  console.log(`[Generate] Current generation status: ${status.value}`)
  
  if (mode === 'demo' && segmentCount > 1) {
    console.warn(`[Generate] WARNING: Demo mode selected - only the first segment will be generated!`)
    console.warn(`[Generate] Switch to Production mode to generate all ${segmentCount} segments`)
  }

  generationStarted.value = true
  try {
    await startGen(storyboard.value)
    console.log('[Generate] Generation started successfully')
  } catch (error) {
    console.error('Generation failed:', error)
    generationStarted.value = false // Reset on error so user can retry
  }
}

const clips = computed(() => {
  console.log('[Generate] Computing clips...')
  console.log('[Generate] Segments value:', segments.value)
  console.log('[Generate] Segments length:', segments.value?.length || 0)
  
  if (!segments.value || segments.value.length === 0) {
    console.log('[Generate] No segments available for clips')
    return []
  }
  
  // Log all segments with their status and videoUrl
  segments.value.forEach((s: any, idx: number) => {
    console.log(`[Generate] Segment ${idx}:`, {
      segmentId: s.segmentId,
      status: s.status,
      hasVideoUrl: !!s.videoUrl,
      hasMetadataVideoUrl: !!s.metadata?.videoUrl,
      hasMetadataReplicateUrl: !!s.metadata?.replicateVideoUrl,
      videoUrl: s.videoUrl?.substring(0, 50) || 'none',
    })
  })
  
  const filtered = segments.value.filter((s: any) => s.status === 'completed' && s.videoUrl)
  console.log('[Generate] Segments filtered for clips:', filtered.length, 'out of', segments.value.length)
  console.log('[Generate] Filtered segment IDs:', filtered.map((s: any) => s.segmentId))
  
  const result = filtered.map((s: any) => ({
    videoUrl: s.videoUrl!,
    voiceUrl: s.voiceUrl,
    startTime: s.startTime,
    endTime: s.endTime,
    type: s.type,
  }))
  
  console.log('[Generate] Final clips count:', result.length)
  console.log('[Generate] Final clips:', result.map((c: any) => ({
    type: c.type,
    hasVideo: !!c.videoUrl,
    hasAudio: !!c.voiceUrl,
  })))
  
  return result
})

const totalDuration = computed(() => {
  return Math.max(...clips.value.map((c: any) => c.endTime), 0)
})

const handleCompose = async (options: any) => {
  const toast = useToast()
  
  console.log('[Generate] ===== handleCompose CALLED - Regenerating Videos =====')
  console.log('[Generate] Current status:', status.value)
  console.log('[Generate] Storyboard:', storyboard.value?.id)
  
  try {
    if (!storyboard.value) {
      toast.add({
        title: 'No Storyboard',
        description: 'Storyboard is not available. Please start a new generation.',
        color: 'error',
      })
      return
    }

    // Reset generation state to clear existing videos
    console.log('[Generate] Resetting generation state...')
    reset()
    generationStarted.value = false
    assetsReady.value = false
    
    // Clear any existing clips from sessionStorage
    if (process.client) {
      sessionStorage.removeItem('editorClips')
      sessionStorage.removeItem('editorComposedVideo')
    }
    
    toast.add({
      title: 'Regenerating Videos',
      description: 'All videos will be regenerated. This may take a few minutes.',
      color: 'blue',
    })
    
    // Restart generation to replace all videos
    console.log('[Generate] Starting new generation to replace all videos...')
    await startGeneration()
    
    console.log('[Generate] Video regeneration started successfully')
  } catch (error: any) {
    console.error('[Generate] Error regenerating videos:', error.message)
    console.error('[Generate] Error stack:', error.stack)
    
    toast.add({
      title: 'Failed to regenerate videos',
      description: error.message || 'An error occurred while regenerating videos. Please try again.',
      color: 'error',
    })
  }
}

const handleEditSegment = (index: number) => {
  if (!storyboard.value || !storyboard.value.segments[index]) {
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

const handlePromptSelected = async (segmentIdx: number, promptIndex: number) => {
  if (!storyboard.value || !storyboard.value.segments[segmentIdx]) {
    return
  }

  // Update local state
  storyboard.value.segments[segmentIdx].selectedPromptIndex = promptIndex

  try {
    // Update backend
    await $fetch(`/api/storyboard/${storyboard.value.id}`, {
      method: 'PUT',
      body: {
        segments: storyboard.value.segments,
      },
    })
  } catch (error: any) {
    // Revert on error
    storyboard.value.segments[segmentIdx].selectedPromptIndex = undefined
    
    toast.add({
      title: 'Failed to update prompt',
      description: error.message || 'Could not update prompt selection. Please try again.',
      color: 'error',
    })
  }
}

const handleRetrySegment = async (segmentId: number) => {
  if (!retrySegmentGen) {
    toast.add({
      title: 'Error',
      description: 'Regeneration function not available',
      color: 'error',
    })
    return
  }

  try {
    await retrySegmentGen(segmentId)
    // Polling will automatically update the segments
    if (pollGenProgress) {
      pollGenProgress()
    }
  } catch (error: any) {
    console.error('[Generate] Error retrying segment:', error)
    throw error // Re-throw to let StoryboardView handle the error display
  }
}

const handleRegenerateEvent = (segmentIdx: number) => {
  console.log(`[Generate] Regeneration started for segment ${segmentIdx}`)
  // The actual regeneration is handled by handleRetrySegment
  // This event can be used for additional UI updates if needed
}

const handleSegmentSaved = async (updatedSegment: Segment, index: number) => {
  console.log('[Handle Segment Saved] Called with:', { index, segment: updatedSegment })
  
  if (!storyboard.value || index < 0) {
    console.error('[Handle Segment Saved] Invalid storyboard or index:', { storyboard: storyboard.value, index })
    return
  }

  const toast = useToast()

  try {
    // Handle file uploads if needed
    let segmentToSave = { ...updatedSegment }
    
    // Helper function to upload a file
    const uploadFile = async (file: File): Promise<string | null> => {
      const formData = new FormData()
      formData.append('file', file)
      const uploadResult = await $fetch('/api/upload-brand-assets', {
        method: 'POST',
        body: formData,
      })
      if (uploadResult.files && uploadResult.files.length > 0) {
        return uploadResult.files[0]
      }
      return null
    }
    
    // Upload firstFrameImage if it's a File
    if (updatedSegment.firstFrameImage instanceof File) {
      console.log('[Handle Segment Saved] Uploading firstFrameImage...')
      const uploadedPath = await uploadFile(updatedSegment.firstFrameImage)
      if (uploadedPath) {
        segmentToSave.firstFrameImage = uploadedPath
      }
    }
    
    // Upload subjectReference if it's a File
    if (updatedSegment.subjectReference instanceof File) {
      console.log('[Handle Segment Saved] Uploading subjectReference...')
      const uploadedPath = await uploadFile(updatedSegment.subjectReference)
      if (uploadedPath) {
        segmentToSave.subjectReference = uploadedPath
      }
    }
    
    // Upload image (Veo parameter) if it's a File
    if ((updatedSegment as any).image instanceof File) {
      console.log('[Handle Segment Saved] Uploading image (Veo parameter)...')
      const uploadedPath = await uploadFile((updatedSegment as any).image)
      if (uploadedPath) {
        (segmentToSave as any).image = uploadedPath
      }
    }
    
    // Upload lastFrame if it's a File
    if ((updatedSegment as any).lastFrame instanceof File) {
      console.log('[Handle Segment Saved] Uploading lastFrame...')
      const uploadedPath = await uploadFile((updatedSegment as any).lastFrame)
      if (uploadedPath) {
        (segmentToSave as any).lastFrame = uploadedPath
      }
    }
    
    // Upload referenceImages if any are Files
    const referenceImages = (updatedSegment as any).referenceImages
    if (referenceImages && Array.isArray(referenceImages)) {
      console.log('[Handle Segment Saved] Uploading referenceImages...')
      const imagePromises = referenceImages.map(async (img: File | string | null) => {
        if (img instanceof File) {
          return await uploadFile(img)
        }
        return img
      })
      const uploadedImages = await Promise.all(imagePromises)
      const filteredImages = uploadedImages.filter((img: any) => img !== null)
      Object.assign(segmentToSave, { referenceImages: filteredImages })
    }

    console.log('[Handle Segment Saved] Segment to save:', segmentToSave)

    // Update local state optimistically
    const updatedSegments = [...storyboard.value.segments]
    updatedSegments[index] = segmentToSave as Segment

    console.log('[Handle Segment Saved] Updated segments:', updatedSegments)

    // Update storyboard with new segments
    const updatedStoryboard = {
      ...storyboard.value,
      segments: updatedSegments,
      updatedAt: Date.now(),
    }

    console.log('[Handle Segment Saved] Saving to backend...', {
      storyboardId: storyboard.value.id,
      segmentsCount: updatedSegments.length,
    })

    // Save to backend
    const savedStoryboard = await $fetch(`/api/storyboard/${storyboard.value.id}`, {
      method: 'PUT',
      body: {
        segments: updatedSegments,
      },
    })

    console.log('[Handle Segment Saved] Backend save successful:', savedStoryboard)

    // Update local state
    storyboard.value = savedStoryboard as Storyboard
    // Storyboard watcher will automatically save to sessionStorage

    toast.add({
      title: 'Success',
      description: 'Segment updated successfully',
      color: 'success',
    })
  } catch (error: any) {
    console.error('[Handle Segment Saved] Failed to save segment:', error)
    console.error('[Handle Segment Saved] Error details:', {
      message: error.message,
      statusCode: error.statusCode,
      data: error.data,
      stack: error.stack,
    })
    
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


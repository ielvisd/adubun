<template>
  <div class="min-h-screen bg-gray-900">
    <UContainer class="max-w-7xl py-6">
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-white">Video Editor Studio</h1>
        <p class="text-gray-400 mt-2">Professional video editing with trim and split</p>
        <p class="text-xs text-gray-500 mt-1">
          <UIcon name="i-heroicons-lock-closed" class="inline" /> 
          Fully local editing - videos never leave your device (except for AI editing)
        </p>
      </div>

      <div class="grid grid-cols-12 gap-6">
        <!-- Media Bin (Left Sidebar) -->
        <div class="col-span-3">
          <EditorMediaBin
            :videos="uploadedVideos"
            @upload="handleVideoUpload"
            @select="handleVideoSelect"
            @remove="handleVideoRemove"
          />
        </div>

        <!-- Main Editor Area -->
        <div class="col-span-9 flex flex-col gap-4">
          <!-- Preview Player -->
          <div class="bg-black rounded-lg overflow-hidden border border-gray-800" style="aspect-ratio: 16/9; max-height: 500px;">
            <EditorPreview
              :clips="timelineClips"
              :current-time="currentTime"
              :is-playing="isPlaying"
              @time-update="handleTimeUpdate"
              @seek="handleSeek"
              @play="handlePlay"
              @pause="handlePause"
            />
          </div>

          <!-- Timeline Editor -->
          <div class="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <EditorTimeline
              ref="timelineRef"
              :clips="timelineClips"
              :current-time="currentTime"
              :snap-threshold="8"
              @trim="handleTrim"
              @split="handleSplit"
              @delete="handleDelete"
              @seek="handleSeek"
              @reorder="handleReorder"
              @aleph-edit="handleAlephEdit"
            />
          </div>

          <!-- Controls -->
          <div class="flex justify-between items-center">
            <div class="flex gap-3 items-center">
              <UButton
                variant="outline"
                @click="handleSplitAtPlayhead"
                :disabled="!canSplitAtCurrentTime"
              >
                <UIcon name="i-heroicons-scissors" class="mr-2" />
                Split (S)
              </UButton>

              <UFormField label="Aspect Ratio" class="mb-0">
                <USelect
                  v-model="aspectRatio"
                  :options="[
                    { label: '16:9 (Landscape)', value: '16:9' },
                    { label: '9:16 (Portrait)', value: '9:16' }
                  ]"
                  option-attribute="label"
                  value-attribute="value"
                />
              </UFormField>
            </div>

            <UButton
              color="primary"
              @click="handleExport"
              :loading="isExporting"
              :disabled="timelineClips.length === 0"
            >
              <UIcon name="i-heroicons-arrow-down-tray" class="mr-2" />
              Export Video
            </UButton>
          </div>
        </div>
      </div>
    </UContainer>

    <!-- Aleph Edit Modal -->
    <AlephEditModal
      v-model:open="alephModalOpen"
      :clip="alephEditingClip"
      :is-processing="isAlephProcessing"
      @submit="handleAlephSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import EditorMediaBin from '~/components/editor/MediaBin.vue'
import EditorPreview from '~/components/editor/Preview.vue'
import EditorTimeline from '~/components/editor/Timeline.vue'
import AlephEditModal from '~/components/editor/AlephEditModal.vue'

interface EditorClip {
  id: string
  videoId: string
  sourceUrl: string
  originalDuration: number
  startOffset: number
  endOffset: number
  inTimelineStart: number
  name: string
  file?: File  // Keep file reference for export
}

interface UploadedVideo {
  id: string
  url: string
  duration: number
  name: string
  file?: File  // Keep file reference
}

const toast = useToast()

const uploadedVideos = ref<UploadedVideo[]>([])
const timelineClips = ref<EditorClip[]>([])
const currentTime = ref(0)
const isPlaying = ref(false)
const isExporting = ref(false)
const timelineRef = ref<InstanceType<typeof EditorTimeline>>()
const aspectRatio = ref<'16:9' | '9:16'>('16:9')

// Aleph editing state
const alephModalOpen = ref(false)
const alephEditingClip = ref<EditorClip | null>(null)
const isAlephProcessing = ref(false)

const totalDuration = computed(() => {
  return timelineClips.value.reduce((sum, clip) => {
    return sum + getClipDuration(clip)
  }, 0)
})

const canSplitAtCurrentTime = computed(() => {
  const clip = getClipAtTime(currentTime.value)
  if (!clip) return false
  
  const relativeTime = currentTime.value - clip.inTimelineStart
  const clipDuration = getClipDuration(clip)
  
  // Can't split at boundaries
  return relativeTime > 0.1 && relativeTime < clipDuration - 0.1
})

const getClipDuration = (clip: EditorClip): number => {
  return clip.originalDuration - clip.startOffset - clip.endOffset
}

const getClipAtTime = (time: number): EditorClip | null => {
  return timelineClips.value.find(clip => {
    const duration = getClipDuration(clip)
    return time >= clip.inTimelineStart && time < clip.inTimelineStart + duration
  }) || null
}

// Get video duration from File object (local, no server)
const getVideoDurationFromFile = (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src)
      resolve(video.duration)
    }
    
    video.onerror = () => {
      window.URL.revokeObjectURL(video.src)
      reject(new Error('Failed to load video metadata'))
    }
    
    video.src = URL.createObjectURL(file)
  })
}

// Get video duration from URL
const getVideoDurationFromUrl = (url: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.crossOrigin = 'anonymous'
    
    video.onloadedmetadata = () => {
      resolve(video.duration)
    }
    
    video.onerror = () => {
      reject(new Error('Failed to load video metadata from URL'))
    }
    
    video.src = url
  })
}

const handleVideoUpload = async (files: File[]) => {
  for (const file of files) {
    if (!file.type.startsWith('video/')) {
      toast.add({
        title: 'Invalid file',
        description: `${file.name} is not a video file`,
        color: 'error',
      })
      continue
    }

    try {
      // Get duration locally from file
      const duration = await getVideoDurationFromFile(file)
      
      // Create local object URL (no server upload)
      const videoUrl = URL.createObjectURL(file)
      
      const videoId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      
      uploadedVideos.value.push({
        id: videoId,
        url: videoUrl,
        duration,
        name: file.name,
        file, // Keep file reference for export
      })

      toast.add({
        title: 'Video loaded',
        description: `${file.name} ready for editing`,
        color: 'success',
      })
    } catch (error: any) {
      toast.add({
        title: 'Load failed',
        description: error.message || 'Failed to load video',
        color: 'error',
      })
    }
  }
}

const handleVideoSelect = (video: UploadedVideo) => {
  const lastEnd = timelineClips.value.length > 0
    ? timelineClips.value[timelineClips.value.length - 1].inTimelineStart + 
      getClipDuration(timelineClips.value[timelineClips.value.length - 1])
    : 0

  const clip: EditorClip = {
    id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    videoId: video.id,
    sourceUrl: video.url,
    originalDuration: video.duration,
    startOffset: 0,
    endOffset: 0,
    inTimelineStart: lastEnd,
    name: video.name || 'Clip',
    file: video.file, // Keep file reference
  }

  timelineClips.value.push(clip)
}

const handleVideoRemove = (videoId: string) => {
  const video = uploadedVideos.value.find(v => v.id === videoId)
  if (video && video.url.startsWith('blob:')) {
    URL.revokeObjectURL(video.url) // Clean up blob URL
  }
  
  uploadedVideos.value = uploadedVideos.value.filter(v => v.id !== videoId)
  timelineClips.value = timelineClips.value.filter(c => c.videoId !== videoId)
  recalculateTimeline()
}

const recalculateTimeline = () => {
  let currentStart = 0
  timelineClips.value.forEach(clip => {
    clip.inTimelineStart = currentStart
    currentStart += getClipDuration(clip)
  })
}

interface SeekOptions {
  keepPlaying?: boolean
}

const handleSeek = (time: number, options?: SeekOptions) => {
  const clampedTime = Math.max(0, Math.min(time, totalDuration.value))
  currentTime.value = clampedTime
  
  if (isPlaying.value && !options?.keepPlaying) {
    handleStop()
  }
}

const handleTimeUpdate = (time: number) => {
  currentTime.value = time
  if (currentTime.value >= totalDuration.value) {
    handleStop()
    currentTime.value = totalDuration.value
  }
}

const handlePlay = () => {
  if (timelineClips.value.length === 0) return
  if (!isPlaying.value) {
    if (currentTime.value >= totalDuration.value) {
      currentTime.value = 0
    }
    isPlaying.value = true
  }
}

const handlePause = () => {
  if (isPlaying.value) {
    isPlaying.value = false
  }
}

const handlePlayPause = () => {
  if (isPlaying.value) {
    handleStop()
  } else {
    if (currentTime.value >= totalDuration.value) {
      currentTime.value = 0
    }
    isPlaying.value = true
  }
}

const handleStop = () => {
  isPlaying.value = false
}

const handleTrim = (clipId: string, startOffset: number, endOffset: number) => {
  const clipIndex = timelineClips.value.findIndex(c => c.id === clipId)
  if (clipIndex === -1) return

  const clip = timelineClips.value[clipIndex]
  
  // Clamp values
  const newStartOffset = Math.max(0, Math.min(startOffset, clip.originalDuration - 0.1))
  const maxEndOffset = clip.originalDuration - newStartOffset - 0.1
  const newEndOffset = Math.max(0, Math.min(endOffset, maxEndOffset))
  
  clip.startOffset = newStartOffset
  clip.endOffset = newEndOffset
  
  recalculateTimeline()
}

const handleSplit = (clipId: string, splitTime: number) => {
  const clipIndex = timelineClips.value.findIndex(c => c.id === clipId)
  if (clipIndex === -1) return

  const clip = timelineClips.value[clipIndex]
  const relativeTime = splitTime - clip.inTimelineStart
  const clipDuration = getClipDuration(clip)

  if (relativeTime <= 0.1 || relativeTime >= clipDuration - 0.1) return

  // Calculate split point in original media time
  const splitPointInOriginal = clip.startOffset + relativeTime

  // Create two clips
  const clipA: EditorClip = {
    ...clip,
    id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    startOffset: clip.startOffset,
    endOffset: clip.originalDuration - splitPointInOriginal,
    inTimelineStart: clip.inTimelineStart,
  }

  const clipB: EditorClip = {
    ...clip,
    id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    startOffset: splitPointInOriginal,
    endOffset: clip.endOffset,
    inTimelineStart: clip.inTimelineStart + relativeTime,
  }

  timelineClips.value.splice(clipIndex, 1, clipA, clipB)
  recalculateTimeline()
}

const handleSplitAtPlayhead = () => {
  if (!canSplitAtCurrentTime.value) return
  
  const clip = getClipAtTime(currentTime.value)
  if (clip) {
    handleSplit(clip.id, currentTime.value)
  }
}

const handleDelete = (clipId: string) => {
  timelineClips.value = timelineClips.value.filter(c => c.id !== clipId)
  recalculateTimeline()
}

const handleReorder = (clips: EditorClip[], options?: { finalize?: boolean }) => {
  timelineClips.value = clips
  if (options?.finalize) {
    recalculateTimeline()
  }
}

// Aleph editing handlers
const handleAlephEdit = (clip: EditorClip) => {
  const duration = clip.originalDuration - clip.startOffset - clip.endOffset
  
  if (duration >= 5) {
    toast.add({
      title: 'Clip too long',
      description: 'Aleph editing is only available for clips under 5 seconds',
      color: 'warning',
    })
    return
  }
  
  alephEditingClip.value = clip
  alephModalOpen.value = true
}

const handleAlephSubmit = async (data: { 
  clip: EditorClip
  prompt: string
  referenceImageFile?: File
}) => {
  isAlephProcessing.value = true
  
  try {
    // Step 1: Create a trimmed video file from the clip
    const formData = new FormData()
    
    if (data.clip.file) {
      formData.append('videoFile', data.clip.file)
    } else {
      formData.append('videoUrl', data.clip.sourceUrl)
    }
    
    formData.append('startOffset', data.clip.startOffset.toString())
    formData.append('endOffset', data.clip.endOffset.toString())
    formData.append('originalDuration', data.clip.originalDuration.toString())
    formData.append('prompt', data.prompt)
    
    if (data.referenceImageFile) {
      formData.append('referenceImageFile', data.referenceImageFile)
    }
    
    // Step 2: Send to Aleph editing endpoint (returns video binary directly)
    const response = await fetch('/api/editor/aleph-edit', {
      method: 'POST',
      body: formData,
    })
    
    if (!response.ok) {
      throw new Error('Aleph editing failed')
    }
    
    // Step 3: Get video binary and metadata from response headers
    const videoBlob = await response.blob()
    const editedDuration = parseFloat(response.headers.get('X-Video-Duration') || '0')
    const clipId = response.headers.get('X-Clip-Id') || `aleph-${Date.now()}`
    
    // Step 4: Create local File object and blob URL (fully local, no S3)
    const videoFile = new File([videoBlob], `${data.clip.name} (AI Edited).mp4`, { type: 'video/mp4' })
    const localVideoUrl = URL.createObjectURL(videoBlob)
    
    // Step 5: Add to media bin with local blob URL and file reference
    const newVideo: UploadedVideo = {
      id: clipId,
      url: localVideoUrl,
      duration: editedDuration,
      name: `${data.clip.name} (AI Edited)`,
      file: videoFile, // Keep file reference for export
    }
    uploadedVideos.value.push(newVideo)
    
    // Step 6: Replace the clip in timeline
    const clipIndex = timelineClips.value.findIndex(c => c.id === data.clip.id)
    if (clipIndex !== -1) {
      // Clean up old blob URL ONLY if no other clips are using it
      const oldClip = timelineClips.value[clipIndex]
      if (oldClip.sourceUrl.startsWith('blob:')) {
        const isUsedByOtherClips = timelineClips.value.some(
          (c, idx) => idx !== clipIndex && c.sourceUrl === oldClip.sourceUrl
        )
        if (!isUsedByOtherClips) {
          URL.revokeObjectURL(oldClip.sourceUrl)
        }
      }
      
      // Pause playback before replacing to prevent flickering
      const wasPlaying = isPlaying.value
      if (wasPlaying) {
        isPlaying.value = false
      }
      
      // Save current time
      const savedTime = currentTime.value
      
      // Create new clip with Aleph-edited video (fully local)
      const newClip: EditorClip = {
        id: clipId,
        videoId: clipId,
        sourceUrl: localVideoUrl, // Local blob URL
        originalDuration: editedDuration,
        startOffset: 0, // Reset offsets since it's a new video
        endOffset: 0,
        inTimelineStart: data.clip.inTimelineStart, // Preserve timeline position
        name: `${data.clip.name} (AI Edited)`,
        file: videoFile, // Local file reference for export
      }
      
      // Replace the clip
      timelineClips.value[clipIndex] = newClip
      
      // Recalculate timeline to account for any duration differences
      // RunwayML may return slightly different duration (e.g., 2.0s → 2.1s)
      recalculateTimeline()
      
      // Wait for DOM update
      await nextTick()
      
      // Restore time position
      currentTime.value = savedTime
      
      // Don't auto-resume playback - let user manually play
      // This prevents flickering and gives them control
    }
    
    toast.add({
      title: 'Video edited successfully!',
      description: 'Your AI-edited clip has been added to the timeline and media bin',
      color: 'success',
      timeout: 5000,
    })
    
    alephModalOpen.value = false
  } catch (error: any) {
    console.error('[Editor] Aleph edit failed:', error)
    toast.add({
      title: 'Edit failed',
      description: error.data?.message || error.message || 'Failed to edit video with AI',
      color: 'error',
      timeout: 5000,
    })
  } finally {
    isAlephProcessing.value = false
  }
}

const handleExport = async () => {
  if (timelineClips.value.length === 0) return

  isExporting.value = true

  try {
    // Note: Export uses server-side FFmpeg for video composition
    // Videos are temporarily uploaded, processed, and immediately deleted
    // No server storage - video is returned directly for download
    const formData = new FormData()
    
    const clipsData = timelineClips.value.map((clip, index) => {
      const clipPayload: {
        videoUrl?: string
        fileField?: string
        trimStart: number
        trimEnd: number
      } = {
        trimStart: clip.startOffset,
        trimEnd: clip.originalDuration - clip.endOffset,
      }
      
      if (clip.file) {
        const fieldName = `clipFile-${index}`
        clipPayload.fileField = fieldName
        formData.append(fieldName, clip.file, clip.name || `clip-${index + 1}.mp4`)
      } else {
        clipPayload.videoUrl = clip.sourceUrl
      }
      
      return clipPayload
    })
    
    formData.append('clips', JSON.stringify(clipsData))
    formData.append('aspectRatio', aspectRatio.value)

    // Fetch returns the video file directly
    const response = await fetch('/api/editor/export', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error('Export failed')
    }

    // Get the blob from response
    const blob = await response.blob()
    
    // Create download link
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `adubun-export-${Date.now()}.mp4`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.add({
      title: 'Export successful',
      description: 'Your video has been downloaded',
      color: 'success',
    })
  } catch (error: any) {
    toast.add({
      title: 'Export failed',
      description: error.message || 'Failed to export video',
      color: 'error',
    })
  } finally {
    isExporting.value = false
  }
}

// Load clips from sessionStorage on mount
const loadClipsFromStorage = async () => {
  if (!process.client) return

  try {
    // Clear any stale sessionStorage data from generate page to avoid CORS errors
    // Editor is fully local - users must upload files directly
    sessionStorage.removeItem('editorComposedVideo')
    sessionStorage.removeItem('editorClips')
    
    console.log('[Editor] Editor is fully local - upload videos to begin')
  } catch (error: any) {
    console.error('[Editor] Error clearing sessionStorage:', error)
  }
}

// Keyboard shortcuts
onMounted(async () => {
  // Load clips from sessionStorage first
  await loadClipsFromStorage()
  
  const handleKeyPress = (e: KeyboardEvent) => {
    // Don't capture shortcuts when modal is open or user is typing
    const isTyping = document.activeElement?.tagName === 'INPUT' || 
                     document.activeElement?.tagName === 'TEXTAREA'
    const isModalOpen = alephModalOpen.value
    
    if (e.key === 's' || e.key === 'S') {
      if (!e.ctrlKey && !e.metaKey && !isTyping && !isModalOpen) {
        e.preventDefault()
        handleSplitAtPlayhead()
      }
    } else if (e.key === ' ') {
      if (!isTyping && !isModalOpen) {
        e.preventDefault()
        handlePlayPause()
      }
    }
  }

  window.addEventListener('keydown', handleKeyPress)
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyPress)
  })
})

onBeforeUnmount(() => {
  handleStop()
  // Clean up all blob URLs
  uploadedVideos.value.forEach(video => {
    if (video.url.startsWith('blob:')) {
      URL.revokeObjectURL(video.url)
    }
  })
})
</script>

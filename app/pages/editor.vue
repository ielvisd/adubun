<template>
  <div class="min-h-screen bg-gray-900">
    <UContainer class="max-w-7xl py-6">
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-white">Video Editor Studio</h1>
        <p class="text-gray-400 mt-2">Professional video editing with trim and split</p>
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
            />
          </div>

          <!-- Controls -->
          <div class="flex justify-between items-center">
            <UButton
              variant="outline"
              @click="handleSplitAtPlayhead"
              :disabled="!canSplitAtCurrentTime"
            >
              <UIcon name="i-heroicons-scissors" class="mr-2" />
              Split (S)
            </UButton>

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
  </div>
</template>

<script setup lang="ts">
import EditorMediaBin from '~/components/editor/MediaBin.vue'
import EditorPreview from '~/components/editor/Preview.vue'
import EditorTimeline from '~/components/editor/Timeline.vue'

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

const handleExport = async () => {
  if (timelineClips.value.length === 0) return

  isExporting.value = true

  try {
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

    const response = await $fetch<{ videoUrl: string; videoId: string }>('/api/editor/export', {
      method: 'POST',
      body: formData,
    })

    toast.add({
      title: 'Export successful',
      description: 'Downloading your composed video',
      color: 'success',
    })

    try {
      const downloadResponse = await fetch(response.videoUrl)
      if (!downloadResponse.ok) {
        throw new Error('Failed to download video')
      }
      const blob = await downloadResponse.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `adubun-editor-${response.videoId}.mp4`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error: any) {
      toast.add({
        title: 'Download failed',
        description: error.message || 'Unable to download video file',
        color: 'error',
      })
    }
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
    // Check for composed video first (prioritize if both exist)
    const composedVideoData = sessionStorage.getItem('editorComposedVideo')
    if (composedVideoData) {
      const videoData = JSON.parse(composedVideoData)
      console.log('[Editor] Loading composed video from sessionStorage:', videoData)
      
      // Get duration from video URL
      try {
        const duration = await getVideoDurationFromUrl(videoData.videoUrl)
        
        const videoId = `composed-${Date.now()}`
        const uploadedVideo: UploadedVideo = {
          id: videoId,
          url: videoData.videoUrl,
          duration,
          name: videoData.name || 'Composed Video',
        }
        
        uploadedVideos.value.push(uploadedVideo)
        
        // Automatically add to timeline
        const clip: EditorClip = {
          id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          videoId,
          sourceUrl: videoData.videoUrl,
          originalDuration: duration,
          startOffset: 0,
          endOffset: 0,
          inTimelineStart: 0,
          name: uploadedVideo.name,
        }
        
        timelineClips.value.push(clip)
        
        toast.add({
          title: 'Video loaded',
          description: 'Composed video loaded into editor',
          color: 'success',
        })
        
        // Clear sessionStorage after loading
        sessionStorage.removeItem('editorComposedVideo')
        return
      } catch (error: any) {
        console.error('[Editor] Failed to load composed video duration:', error)
        toast.add({
          title: 'Load failed',
          description: 'Failed to load composed video metadata',
          color: 'error',
        })
      }
    }
    
    // Check for separate clips
    const clipsData = sessionStorage.getItem('editorClips')
    if (clipsData) {
      const clips = JSON.parse(clipsData)
      console.log('[Editor] Loading clips from sessionStorage:', clips)
      
      // Load each clip
      for (let i = 0; i < clips.length; i++) {
        const clipData = clips[i]
        
        try {
          // Use provided duration or fetch from URL
          let duration = clipData.duration
          if (!duration || duration <= 0) {
            duration = await getVideoDurationFromUrl(clipData.videoUrl)
          }
          
          const videoId = `clip-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`
          const uploadedVideo: UploadedVideo = {
            id: videoId,
            url: clipData.videoUrl,
            duration,
            name: clipData.name || `${clipData.type} Scene`,
          }
          
          uploadedVideos.value.push(uploadedVideo)
          
          // Automatically add to timeline in sequence
          const lastEnd = timelineClips.value.length > 0
            ? timelineClips.value[timelineClips.value.length - 1].inTimelineStart + 
              getClipDuration(timelineClips.value[timelineClips.value.length - 1])
            : 0
          
          const clip: EditorClip = {
            id: `clip-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
            videoId,
            sourceUrl: clipData.videoUrl,
            originalDuration: duration,
            startOffset: 0,
            endOffset: 0,
            inTimelineStart: lastEnd,
            name: uploadedVideo.name,
          }
          
          timelineClips.value.push(clip)
        } catch (error: any) {
          console.error(`[Editor] Failed to load clip ${i}:`, error)
          toast.add({
            title: 'Load failed',
            description: `Failed to load ${clipData.name || 'clip'}: ${error.message}`,
            color: 'error',
          })
        }
      }
      
      if (clips.length > 0) {
        toast.add({
          title: 'Clips loaded',
          description: `${clips.length} clip(s) loaded into editor`,
          color: 'success',
        })
      }
      
      // Clear sessionStorage after loading
      sessionStorage.removeItem('editorClips')
    }
  } catch (error: any) {
    console.error('[Editor] Error loading clips from sessionStorage:', error)
  }
}

// Keyboard shortcuts
onMounted(async () => {
  // Load clips from sessionStorage first
  await loadClipsFromStorage()
  
  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 's' || e.key === 'S') {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        handleSplitAtPlayhead()
      }
    } else if (e.key === ' ') {
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
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

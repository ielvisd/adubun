<template>
  <div class="py-12">
    <UContainer class="max-w-6xl">
      <div class="mb-8">
        <h1 class="text-3xl font-bold mb-2">Frame Matching Tool</h1>
        <p class="text-gray-600 dark:text-gray-400">
          Upload 2 or more video clips and automatically stitch them with intelligent frame matching for seamless transitions.
        </p>
      </div>

      <!-- Upload Section -->
      <UCard class="mb-8">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold">Upload Video Clips ({{ clips.length }} clips)</h2>
            <UButton
              icon="i-heroicons-plus"
              size="sm"
              color="primary"
              variant="outline"
              :disabled="clips.length >= maxClips"
              @click="addClip"
            >
              Add Clip
            </UButton>
          </div>
        </template>

        <div class="space-y-6">
          <div v-for="(clip, index) in clips" :key="clip.id" class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <UBadge color="gray" variant="subtle">{{ index + 1 }}</UBadge>
                <h3 class="font-medium">Clip {{ index + 1 }}</h3>
                <UBadge v-if="clip.file" color="green" variant="subtle">
                  {{ formatFileSize(clip.file.size) }}
                </UBadge>
              </div>
              <UButton
                v-if="clips.length > minClips"
                icon="i-heroicons-trash"
                size="xs"
                color="red"
                variant="ghost"
                @click="deleteClip(index)"
              >
                Remove
              </UButton>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <!-- Upload Area (takes 1/3 width on desktop) -->
              <div
                v-if="!clip.file"
                class="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center cursor-pointer hover:border-primary-500 transition-colors"
                @click="triggerFileInput(index)"
                @dragover.prevent="handleDragOver(index)"
                @dragleave.prevent="handleDragLeave(index)"
                @drop.prevent="handleDrop($event, index)"
              >
                <UIcon name="i-heroicons-arrow-up-tray" class="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  Click to upload or drag and drop
                </p>
                <p class="text-xs text-gray-500 mt-1">MP4, WebM up to 500MB</p>
              </div>

              <!-- Preview (takes full width when uploaded) -->
              <div v-else class="md:col-span-3 space-y-2">
                <div class="aspect-video bg-black rounded-lg overflow-hidden">
                  <video
                    :ref="el => videoRefs[index] = el"
                    :src="clip.previewUrl"
                    class="w-full h-full object-contain"
                    controls
                  />
                </div>
                <div class="flex items-center justify-between text-sm">
                  <span class="text-gray-600 dark:text-gray-400 truncate flex-1">
                    {{ clip.file.name }}
                  </span>
                  <UButton
                    icon="i-heroicons-x-mark"
                    size="xs"
                    color="red"
                    variant="ghost"
                    @click="removeClipFile(index)"
                  >
                    Clear
                  </UButton>
                </div>
              </div>

              <!-- Hidden file input -->
              <input
                :ref="el => fileInputRefs[index] = el"
                type="file"
                accept="video/mp4,video/webm"
                class="hidden"
                @change="handleFileSelect($event, index)"
              />
            </div>
          </div>
        </div>

        <!-- Process Button -->
        <div class="mt-8 flex flex-col items-center gap-4">
          <UButton
            size="xl"
            color="primary"
            :disabled="!hasMinimumClips || processing"
            :loading="processing"
            @click="processFrameMatching"
          >
            <template #leading>
              <UIcon name="i-heroicons-sparkles" />
            </template>
            {{ processing ? 'Processing...' : `Stitch ${uploadedClipsCount} Clips with Frame Matching` }}
          </UButton>
          <p v-if="!hasMinimumClips" class="text-sm text-gray-500">
            Upload at least {{ minClips }} clips to continue
          </p>
        </div>
      </UCard>

      <!-- Results Section -->
      <UCard v-if="originalVideoUrl || smartVideoUrl" class="mt-8">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold">Results</h2>
            <div class="flex gap-2">
              <UButton
                v-if="smartVideoUrl"
                icon="i-heroicons-arrow-down-tray"
                size="sm"
                @click="downloadVideo('smart')"
              >
                Download Frame-Matched
              </UButton>
              <UButton
                v-if="originalVideoUrl"
                icon="i-heroicons-arrow-down-tray"
                size="sm"
                variant="outline"
                @click="downloadVideo('original')"
              >
                Download Original
              </UButton>
            </div>
          </div>
        </template>

        <!-- Processing State -->
        <div v-if="processing" class="flex flex-col items-center justify-center py-12">
          <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 text-primary-500 animate-spin mb-4" />
          <p class="text-gray-600 dark:text-gray-400">Processing videos with frame matching...</p>
          <p class="text-sm text-gray-500 mt-2">This may take 30-60 seconds</p>
        </div>

        <!-- Error State -->
        <UAlert
          v-else-if="error"
          color="red"
          variant="soft"
          :title="error"
          icon="i-heroicons-exclamation-triangle"
        />

        <!-- Side-by-Side Comparison -->
        <div v-else-if="originalVideoUrl && smartVideoUrl" class="space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Original -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h4 class="font-semibold text-lg">Original Concatenation</h4>
                <UBadge color="gray" variant="subtle">Standard</UBadge>
              </div>
              <div class="aspect-video bg-black rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-700">
                <video
                  :src="originalVideoUrl"
                  class="w-full h-full object-contain"
                  controls
                />
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Simple concatenation without frame matching
              </p>
            </div>

            <!-- Frame-Matched -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h4 class="font-semibold text-lg">Frame-Matched</h4>
                <UBadge color="primary" variant="subtle">Optimized</UBadge>
              </div>
              <div class="aspect-video bg-black rounded-lg overflow-hidden border-2 border-primary-500">
                <video
                  :src="smartVideoUrl"
                  class="w-full h-full object-contain"
                  controls
                />
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Intelligent frame matching for seamless transitions
              </p>
            </div>
          </div>

          <!-- Adjustment Details -->
          <div v-if="adjustments && adjustments.length > 0" class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="flex items-center gap-2 mb-3">
              <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-primary-500" />
              <h5 class="font-semibold">Frame Matching Results</h5>
            </div>
            <ul class="space-y-2 text-sm">
              <li v-for="(adj, idx) in adjustments" :key="idx" class="flex items-center justify-between">
                <span class="text-gray-700 dark:text-gray-300">{{ adj.transitionName }}</span>
                <div class="flex items-center gap-3">
                  <span v-if="adj.trimmedSeconds > 0" class="text-green-600 dark:text-green-400 font-medium">
                    Trimmed {{ adj.trimmedSeconds.toFixed(2) }}s
                  </span>
                  <span v-else class="text-gray-500">No adjustment</span>
                <UBadge 
                  :color="adj.similarity >= 0.9 ? 'green' : adj.similarity >= 0.7 ? 'blue' : adj.similarity >= 0.5 ? 'yellow' : 'orange'" 
                  variant="subtle" 
                  size="xs"
                >
                  {{ (adj.similarity * 100).toFixed(1) }}% match
                </UBadge>
                </div>
              </li>
            </ul>
            <p class="text-xs text-gray-500 mt-3">
              Frame matching analyzes the last 30 frames of each clip and always applies the best match found for optimal transitions.
            </p>
          </div>
        </div>
      </UCard>

      <!-- Info Card -->
      <UCard class="mt-8 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <div class="flex gap-4">
          <UIcon name="i-heroicons-information-circle" class="w-6 h-6 text-blue-500 flex-shrink-0 mt-1" />
          <div class="space-y-2 text-sm">
            <p class="font-semibold text-blue-900 dark:text-blue-100">How Frame Matching Works</p>
            <ul class="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200">
              <li>Works with any number of clips (minimum {{ minClips }}, maximum {{ maxClips }})</li>
              <li>Analyzes the last 30 frames of each clip (1 second at 30fps)</li>
              <li>Compares each frame to the first frame of the next clip using SSIM</li>
              <li>SSIM (Structural Similarity Index) provides accurate perceptual matching</li>
              <li>Always selects and applies the best matching frame found</li>
              <li>Trims clips at optimal points for seamless transitions</li>
              <li>Reduces visual discontinuities and jump cuts between clips</li>
            </ul>
          </div>
        </div>
      </UCard>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
interface Clip {
  id: string
  file: File | null
  previewUrl: string | null
}

interface StitchAdjustment {
  clipIndex: number
  originalEndTime: number
  adjustedEndTime: number
  trimmedSeconds: number
  similarity: number
  transitionName: string
}

const toast = useToast()

// Configuration
const minClips = 2
const maxClips = 10

// Helper to generate unique IDs
let clipIdCounter = 0
const generateClipId = () => `clip-${Date.now()}-${clipIdCounter++}`

// Clips state - start with 2 empty clips
const clips = ref<Clip[]>([
  { id: generateClipId(), file: null, previewUrl: null },
  { id: generateClipId(), file: null, previewUrl: null },
])

// Refs
const fileInputRefs = ref<(HTMLInputElement | null)[]>([])
const videoRefs = ref<(HTMLVideoElement | null)[]>([])

// Processing state
const processing = ref(false)
const error = ref<string | null>(null)
const originalVideoUrl = ref<string | null>(null)
const smartVideoUrl = ref<string | null>(null)
const originalVideoId = ref<string | null>(null)
const smartVideoId = ref<string | null>(null)
const adjustments = ref<StitchAdjustment[]>([])

// Computed properties
const uploadedClipsCount = computed(() => {
  return clips.value.filter(clip => clip.file !== null).length
})

const hasMinimumClips = computed(() => {
  return uploadedClipsCount.value >= minClips
})

const allClipsUploaded = computed(() => {
  return clips.value.every(clip => clip.file !== null)
})

// Add a new clip slot
const addClip = () => {
  if (clips.value.length >= maxClips) {
    toast.add({
      title: 'Maximum Clips Reached',
      description: `You can add up to ${maxClips} clips.`,
      color: 'warning',
    })
    return
  }
  
  clips.value.push({ 
    id: generateClipId(), 
    file: null, 
    previewUrl: null 
  })
  
  toast.add({
    title: 'Clip Slot Added',
    description: `Clip ${clips.value.length} added. Upload a video to use it.`,
    color: 'success',
  })
}

// Delete a clip slot entirely
const deleteClip = (index: number) => {
  if (clips.value.length <= minClips) {
    toast.add({
      title: 'Minimum Clips Required',
      description: `You need at least ${minClips} clips for stitching.`,
      color: 'warning',
    })
    return
  }
  
  // Revoke preview URL if exists
  if (clips.value[index].previewUrl) {
    URL.revokeObjectURL(clips.value[index].previewUrl!)
  }
  
  clips.value.splice(index, 1)
  
  toast.add({
    title: 'Clip Removed',
    description: 'Clip slot has been removed.',
    color: 'success',
  })
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

const triggerFileInput = (index: number) => {
  fileInputRefs.value[index]?.click()
}

const handleFileSelect = (event: Event, index: number) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    processFile(file, index)
  }
}

const handleDragOver = (index: number) => {
  // Add visual feedback if needed
}

const handleDragLeave = (index: number) => {
  // Remove visual feedback if needed
}

const handleDrop = (event: DragEvent, index: number) => {
  const file = event.dataTransfer?.files[0]
  if (file && (file.type === 'video/mp4' || file.type === 'video/webm')) {
    processFile(file, index)
  } else {
    toast.add({
      title: 'Invalid File',
      description: 'Please upload MP4 or WebM video files only.',
      color: 'error',
    })
  }
}

const processFile = (file: File, index: number) => {
  // Validate file size (500MB max)
  if (file.size > 500 * 1024 * 1024) {
    toast.add({
      title: 'File Too Large',
      description: 'Please upload videos smaller than 500MB.',
      color: 'error',
    })
    return
  }

  // Create preview URL
  const previewUrl = URL.createObjectURL(file)
  
  // Revoke old preview URL if exists
  if (clips.value[index].previewUrl) {
    URL.revokeObjectURL(clips.value[index].previewUrl!)
  }

  // Update clip while preserving ID
  clips.value[index] = {
    ...clips.value[index],
    file,
    previewUrl,
  }

  toast.add({
    title: 'Video Uploaded',
    description: `Clip ${index + 1} uploaded successfully.`,
    color: 'success',
  })
}

// Clear a clip's file but keep the slot
const removeClipFile = (index: number) => {
  if (clips.value[index].previewUrl) {
    URL.revokeObjectURL(clips.value[index].previewUrl!)
  }
  clips.value[index].file = null
  clips.value[index].previewUrl = null
}

const processFrameMatching = async () => {
  if (!hasMinimumClips.value) {
    toast.add({
      title: 'Not Enough Clips',
      description: `Please upload at least ${minClips} clips to continue.`,
      color: 'warning',
    })
    return
  }

  processing.value = true
  error.value = null
  originalVideoUrl.value = null
  smartVideoUrl.value = null
  adjustments.value = []

  try {
    // Create FormData with only uploaded clips
    const formData = new FormData()
    
    let clipCount = 0
    clips.value.forEach((clip, index) => {
      if (clip.file) {
        formData.append(`clip${clipCount}`, clip.file)
        clipCount++
      }
    })

    console.log(`[FrameMatch] Sending ${clipCount} clips for processing`)

    // Call API endpoint
    const result = await $fetch<{
      originalVideoUrl: string
      smartVideoUrl: string
      originalVideoId: string
      smartVideoId: string
      adjustments: StitchAdjustment[]
    }>('/api/frame-match', {
      method: 'POST',
      body: formData,
    })

    originalVideoUrl.value = result.originalVideoUrl
    smartVideoUrl.value = result.smartVideoUrl
    originalVideoId.value = result.originalVideoId
    smartVideoId.value = result.smartVideoId
    adjustments.value = result.adjustments

    toast.add({
      title: 'Processing Complete',
      description: `Successfully stitched ${clipCount} clips with frame matching!`,
      color: 'success',
    })

    // Scroll to results
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    }, 100)
  } catch (err: any) {
    console.error('[FrameMatch] Error processing videos:', err)
    error.value = err.data?.message || err.message || 'Failed to process videos. Please try again.'
    
    toast.add({
      title: 'Processing Failed',
      description: error.value,
      color: 'error',
    })
  } finally {
    processing.value = false
  }
}

const downloadVideo = (version: 'original' | 'smart') => {
  const url = version === 'original' ? originalVideoUrl.value : smartVideoUrl.value
  const id = version === 'original' ? originalVideoId.value : smartVideoId.value
  
  if (!url || !id) return

  // Create temporary link and trigger download
  const link = document.createElement('a')
  link.href = url
  link.download = `frame-matched-${version}-${id}.mp4`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  toast.add({
    title: 'Download Started',
    description: `Downloading ${version} video...`,
    color: 'success',
  })
}

// Cleanup on unmount
onUnmounted(() => {
  clips.value.forEach(clip => {
    if (clip.previewUrl) {
      URL.revokeObjectURL(clip.previewUrl)
    }
  })
})
</script>


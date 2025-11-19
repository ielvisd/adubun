<template>
  <UCard class="bg-gray-800 border-gray-700">
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-white">Media Bin</h3>
        <span class="text-sm text-gray-400">{{ videos.length }} videos</span>
      </div>
    </template>

    <div 
      class="space-y-4 relative bg-gray-800"
      :class="{ 'drag-over': isDragOver }"
      @dragenter.prevent="handleDragEnter"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <!-- Upload Button -->
      <div>
        <input
          ref="fileInput"
          type="file"
          accept="video/*"
          multiple
          class="hidden"
          @change="handleFileSelect"
        />
        <UButton
          @click="fileInput?.click()"
          class="w-full"
          color="primary"
        >
          <UIcon name="i-heroicons-plus" class="mr-2" />
          Upload Videos
        </UButton>
        <p class="text-xs text-gray-400 mt-2">MP4 files • Drag & drop supported</p>
      </div>

      <!-- Drag Overlay -->
      <div
        v-if="isDragOver"
        class="absolute inset-0 bg-blue-500/10 border-2 border-dashed border-blue-500 rounded-lg flex items-center justify-center z-50 pointer-events-none"
      >
        <div class="text-center">
          <UIcon name="i-heroicons-arrow-down-tray" class="w-16 h-16 text-blue-500 mx-auto mb-2" />
          <p class="text-lg font-semibold text-blue-600">Drop videos here</p>
          <p class="text-sm text-blue-500">Release to upload</p>
        </div>
      </div>

      <!-- Video List -->
      <div class="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto relative">
        <div
          v-for="video in videos"
          :key="video.id"
          class="border border-gray-700 rounded-lg p-3 hover:bg-gray-700 cursor-pointer transition-colors bg-gray-800"
          @click="$emit('select', video)"
        >
          <div class="flex items-start gap-3">
            <div class="w-16 h-16 bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
              <UIcon name="i-heroicons-video-camera" class="w-8 h-8 text-gray-400" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-white truncate">{{ video.name }}</p>
              <p class="text-xs text-gray-400">{{ formatDuration(video.duration) }}</p>
            </div>
            <UButton
              variant="ghost"
              size="xs"
              color="red"
              @click.stop="$emit('remove', video.id)"
            >
              <UIcon name="i-heroicons-trash" />
            </UButton>
          </div>
        </div>

        <div v-if="videos.length === 0" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-video-camera" class="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p class="text-sm text-gray-400">No videos uploaded</p>
          <p class="text-xs mt-1 text-gray-500">Drag & drop videos here or click to upload</p>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
interface UploadedVideo {
  id: string
  url: string
  thumbnail?: string
  duration: number
  name: string
}

const props = defineProps<{
  videos: UploadedVideo[]
}>()

const emit = defineEmits<{
  upload: [files: File[]]
  select: [video: UploadedVideo]
  remove: [videoId: string]
}>()

const fileInput = ref<HTMLInputElement>()
const isDragOver = ref(false)
const dragCounter = ref(0)

const handleDragEnter = (event: DragEvent) => {
  event.preventDefault()
  dragCounter.value++
  if (event.dataTransfer?.types.includes('Files')) {
    isDragOver.value = true
  }
}

const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

const handleDragLeave = (event: DragEvent) => {
  event.preventDefault()
  dragCounter.value--
  if (dragCounter.value === 0) {
    isDragOver.value = false
  }
}

const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  dragCounter.value = 0
  isDragOver.value = false

  const files = Array.from(event.dataTransfer?.files || [])
  
  // Filter video files by MIME type OR file extension (fallback for videos without proper MIME)
  const videoFiles = files.filter(file => {
    // Check MIME type first
    if (file.type.startsWith('video/')) {
      return true
    }
    // Fallback: Check file extension for videos without proper MIME type
    // (e.g., videos created by FFmpeg or downloaded from AI services)
    const ext = file.name.split('.').pop()?.toLowerCase()
    return ext && ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv'].includes(ext)
  })

  if (videoFiles.length === 0) {
    return
  }

  // Limit to 10 total videos
  const remainingSlots = 10 - props.videos.length
  const filesToUpload = videoFiles.slice(0, remainingSlots)

  if (filesToUpload.length > 0) {
    emit('upload', filesToUpload)
  }
}

const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files) {
    const files = Array.from(input.files)
    if (files.length > 0) {
      // Limit to 10 total videos
      const remainingSlots = 10 - props.videos.length
      const filesToUpload = files.slice(0, remainingSlots)
      if (filesToUpload.length > 0) {
        emit('upload', filesToUpload)
      }
    }
  }
  // Reset input so same file can be selected again
  if (input) {
    input.value = ''
  }
}

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>

<style scoped>
.drag-over {
  position: relative;
}
</style>

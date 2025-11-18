<template>
  <UCard class="letsignit-card">
    <template #header>
      <h3 class="text-2xl font-semibold text-black">Video Storyboard</h3>
    </template>

    <div class="space-y-4">
      <div
        v-for="(segment, idx) in storyboard.segments"
        :key="idx"
        class="p-6 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow"
      >
        <!-- Segment Header -->
        <div class="flex gap-4 mb-4">
          <div class="flex-shrink-0">
            <UBadge :color="getSegmentColor(segment.type)" size="lg">
              {{ segment.type }}
            </UBadge>
          </div>
          
          <div class="flex-1">
            <p class="text-sm text-gray-500">
              {{ segment.startTime }}s - {{ segment.endTime }}s
            </p>
          </div>

          <div class="flex-shrink-0 flex gap-2">
            <UButton
              :icon="editingSegment === idx ? 'i-heroicons-check' : 'i-heroicons-pencil'"
              size="sm"
              :variant="editingSegment === idx ? 'solid' : 'ghost'"
              :color="editingSegment === idx ? 'primary' : 'gray'"
              @click="toggleEdit(idx)"
              :title="editingSegment === idx ? 'Save changes' : 'Edit segment'"
            />
            <UButton
              icon="i-heroicons-arrow-path"
              size="sm"
              variant="ghost"
              :loading="regeneratingSegments[idx]"
              :disabled="regeneratingSegments[idx] || !retrySegment || editingSegment === idx"
              @click="handleRegenerate(idx)"
              title="Regenerate with current settings"
            />
          </div>
        </div>

        <!-- Video Preview Section -->
        <div v-if="getAssetForSegment(idx)" class="mb-6">
          <div class="aspect-video bg-black rounded-lg overflow-hidden">
            <!-- Skeleton while generating -->
            <div v-if="!getVideoUrl(idx) && (getAssetForSegment(idx)?.status === 'pending' || getAssetForSegment(idx)?.status === 'processing')" class="w-full h-full flex items-center justify-center">
              <USkeleton class="w-full h-full" />
            </div>
            <!-- Actual video when available -->
            <video
              v-else-if="getVideoUrl(idx)"
              :ref="el => setVideoRef(el, idx)"
              :src="getVideoUrl(idx) || undefined"
              class="w-full h-full object-contain"
              controls
              @loadedmetadata="onVideoLoaded(idx)"
            />
          </div>

          <!-- Audio Player -->
          <div v-if="getVoiceUrl(idx)" class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg mt-3">
            <UButton
              :icon="getAudioPlayingState(idx) ? 'i-heroicons-pause' : 'i-heroicons-play'"
              color="primary"
              variant="solid"
              size="sm"
              square
              @click="toggleAudioPlay(idx, getVoiceUrl(idx))"
            />
            <div class="flex-1">
              <audio
                :ref="el => setAudioRef(el, idx)"
                :src="getAudioUrl(getVoiceUrl(idx))"
                class="hidden"
                @timeupdate="onAudioTimeUpdate(idx, $event)"
                @ended="onAudioEnded(idx)"
              />
              <div class="flex items-center gap-2">
                <USlider
                  :model-value="getAudioProgress(idx)"
                  :min="0"
                  :max="100"
                  :step="0.1"
                  color="primary"
                  size="sm"
                  class="flex-1"
                  @update:model-value="(value: number | undefined) => value !== undefined && onAudioSeek(idx, value)"
                />
                <span class="text-xs text-gray-500 min-w-[60px] text-right">
                  {{ formatAudioTime(idx) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Inline Edit Form -->
        <div v-if="editingSegment === idx" class="space-y-4 border-t border-gray-200 pt-4">
          <!-- Duration Selection -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Video Duration</label>
            <div class="flex gap-2">
              <UButton
                v-for="duration in [4, 6, 8]"
                :key="duration"
                :variant="editForm[idx]?.duration === duration ? 'solid' : 'outline'"
                :color="editForm[idx]?.duration === duration ? 'primary' : 'gray'"
                size="sm"
                @click="setDuration(idx, duration)"
              >
                {{ duration }}s
              </UButton>
            </div>
          </div>

          <!-- Story Description -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Story Description</label>
            <UTextarea
              v-model="editForm[idx].description"
              placeholder="Describe what happens in this segment..."
              :rows="2"
              :maxlength="1000"
            />
            <div class="flex justify-end mt-1">
              <span 
                class="text-xs font-medium"
                :class="(editForm[idx]?.description?.length || 0) > 1000 ? 'text-error-500' : 'text-gray-500'"
              >
                {{ editForm[idx]?.description?.length || 0 }} / 1000
              </span>
            </div>
          </div>

          <!-- Visual Prompt -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Visual Prompt</label>
            <UTextarea
              v-model="editForm[idx].visualPrompt"
              placeholder="Detailed visual description for video generation..."
              :rows="3"
              :maxlength="1000"
            />
            <div class="flex justify-end mt-1">
              <span 
                class="text-xs font-medium"
                :class="(editForm[idx]?.visualPrompt?.length || 0) > 1000 ? 'text-error-500' : 'text-gray-500'"
              >
                {{ editForm[idx]?.visualPrompt?.length || 0 }} / 1000
              </span>
            </div>
          </div>

          <!-- Negative Prompt -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Negative Prompt (Optional)</label>
            <UTextarea
              v-model="editForm[idx].negativePrompt"
              placeholder="What to exclude from the video..."
              :rows="2"
              :maxlength="500"
            />
            <div class="flex justify-end mt-1">
              <span 
                class="text-xs font-medium"
                :class="(editForm[idx]?.negativePrompt?.length || 0) > 500 ? 'text-error-500' : 'text-gray-500'"
              >
                {{ editForm[idx]?.negativePrompt?.length || 0 }} / 500
              </span>
            </div>
          </div>

          <!-- Frame Images -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                First Frame Image
                <UBadge v-if="editForm[idx]?.firstFrameImage" color="green" variant="soft" class="ml-2">Set</UBadge>
              </label>
              <div v-if="editForm[idx]?.firstFrameImage" class="relative group">
                <NuxtImg
                  :src="editForm[idx].firstFrameImage"
                  alt="First frame"
                  class="w-full h-32 object-cover rounded-lg border border-gray-200"
                  loading="lazy"
                />
                <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all rounded-lg flex items-center justify-center">
                  <UButton
                    icon="i-heroicons-arrow-up-tray"
                    size="sm"
                    color="white"
                    class="opacity-0 group-hover:opacity-100 transition-opacity"
                    @click="triggerImageUpload(idx, 'first')"
                  >
                    Change
                  </UButton>
                </div>
              </div>
              <div v-else class="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-gray-400 transition-colors" @click="triggerImageUpload(idx, 'first')">
                <UIcon name="i-heroicons-photo" class="w-8 h-8 text-gray-400 mx-auto mb-1" />
                <p class="text-xs text-gray-500">Upload first frame</p>
              </div>
              <input
                :ref="el => setFileInputRef(el, idx, 'first')"
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleImageUpload(idx, 'first', $event)"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Last Frame Image
                <UBadge v-if="editForm[idx]?.lastFrameImage" color="green" variant="soft" class="ml-2">Set</UBadge>
              </label>
              <div v-if="editForm[idx]?.lastFrameImage" class="relative group">
                <NuxtImg
                  :src="editForm[idx].lastFrameImage"
                  alt="Last frame"
                  class="w-full h-32 object-cover rounded-lg border border-gray-200"
                  loading="lazy"
                />
                <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all rounded-lg flex items-center justify-center">
                  <UButton
                    icon="i-heroicons-arrow-up-tray"
                    size="sm"
                    color="white"
                    class="opacity-0 group-hover:opacity-100 transition-opacity"
                    @click="triggerImageUpload(idx, 'last')"
                  >
                    Change
                  </UButton>
                </div>
              </div>
              <div v-else class="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-gray-400 transition-colors" @click="triggerImageUpload(idx, 'last')">
                <UIcon name="i-heroicons-photo" class="w-8 h-8 text-gray-400 mx-auto mb-1" />
                <p class="text-xs text-gray-500">Upload last frame</p>
              </div>
              <input
                :ref="el => setFileInputRef(el, idx, 'last')"
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleImageUpload(idx, 'last', $event)"
              />
            </div>
          </div>

          <!-- Aspect Ratio & Resolution -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Aspect Ratio</label>
              <USelect
                v-model="editForm[idx].aspectRatio"
                :options="aspectRatioOptions"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Resolution</label>
              <USelect
                v-model="editForm[idx].resolution"
                :options="resolutionOptions"
              />
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <UButton
              variant="ghost"
              color="gray"
              @click="cancelEdit(idx)"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="savingSegment === idx"
              @click="saveEdit(idx)"
            >
              Save Changes
            </UButton>
          </div>
        </div>

        <!-- Read-only View -->
        <div v-else class="space-y-3">
          <div>
            <p class="text-sm font-medium text-gray-700">Description:</p>
            <p class="text-sm text-gray-600">{{ segment.description }}</p>
          </div>
          
          <div>
            <p class="text-sm font-medium text-gray-700">Visual Prompt:</p>
            <p class="text-sm text-gray-600 bg-gray-50 p-2 rounded">{{ getSelectedPrompt(segment) }}</p>
          </div>

          <!-- Frame Images Preview -->
          <div class="grid grid-cols-2 gap-3">
            <div v-if="segment.firstFrameImage">
              <p class="text-xs font-medium text-gray-600 mb-1">First Frame</p>
              <NuxtImg
                :src="segment.firstFrameImage"
                alt="First frame"
                class="w-full h-24 object-cover rounded border border-gray-200"
                loading="lazy"
              />
            </div>
            <div v-if="segment.lastFrameImage">
              <p class="text-xs font-medium text-gray-600 mb-1">Last Frame</p>
              <NuxtImg
                :src="segment.lastFrameImage"
                alt="Last frame"
                class="w-full h-24 object-cover rounded border border-gray-200"
                loading="lazy"
              />
            </div>
          </div>

          <!-- Settings Display -->
          <div class="flex gap-4 text-xs text-gray-500">
            <span v-if="(segment as any).duration">Duration: {{ (segment as any).duration }}s</span>
            <span v-if="(segment as any).aspectRatio">{{ (segment as any).aspectRatio }}</span>
            <span v-if="(segment as any).resolution">{{ (segment as any).resolution }}</span>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { Storyboard, Segment } from '~/app/types/generation'

const props = defineProps<{
  storyboard: Storyboard
  assets?: Array<{
    segmentId: number
    videoUrl?: string
    voiceUrl?: string
    status?: 'pending' | 'processing' | 'completed' | 'failed'
    metadata?: {
      videoUrl?: string
      replicateVideoUrl?: string
      voiceUrl?: string
    }
  }>
  retrySegment?: (segmentId: number) => Promise<void>
}>()

const emit = defineEmits<{
  edit: [index: number]
  'prompt-selected': [segmentIdx: number, promptIndex: number]
  regenerate: [segmentIdx: number]
}>()

const toast = useToast()

// Edit state
const editingSegment = ref<number | null>(null)
const savingSegment = ref<number | null>(null)
const editForm = ref<Record<number, any>>({})
const fileInputRefs = ref<Record<string, HTMLInputElement>>({})

// Audio player state
const audioRefs = ref<Record<number, HTMLAudioElement>>({})
const videoRefs = ref<Record<number, HTMLVideoElement>>({})
const audioPlaying = ref<Record<number, boolean>>({})
const audioProgress = ref<Record<number, number>>({})
const audioCurrentTime = ref<Record<number, number>>({})
const audioDuration = ref<Record<number, number>>({})

// Regeneration state
const regeneratingSegments = ref<Record<number, boolean>>({})

// Options
const aspectRatioOptions = [
  { label: '16:9 (Landscape)', value: '16:9' },
  { label: '9:16 (Portrait)', value: '9:16' },
]

const resolutionOptions = [
  { label: '720p', value: '720p' },
  { label: '1080p', value: '1080p' },
]

// Watch for segment updates to clear regenerating state
watch(
  () => props.assets,
  (newAssets) => {
    if (newAssets) {
      newAssets.forEach((asset) => {
        if (asset.videoUrl && regeneratingSegments.value[asset.segmentId]) {
          setTimeout(() => {
            regeneratingSegments.value[asset.segmentId] = false
          }, 500)
        }
      })
    }
  },
  { deep: true }
)

// Toggle edit mode
const toggleEdit = (idx: number) => {
  if (editingSegment.value === idx) {
    // Save when clicking the check icon
    saveEdit(idx)
  } else {
    // Enter edit mode
    const segment = props.storyboard.segments[idx]
    editForm.value[idx] = {
      description: segment.description,
      visualPrompt: segment.visualPrompt,
      negativePrompt: (segment as any).negativePrompt || '',
      firstFrameImage: segment.firstFrameImage,
      lastFrameImage: segment.lastFrameImage,
      aspectRatio: (segment as any).aspectRatio || '16:9',
      resolution: (segment as any).resolution || '1080p',
      duration: (segment as any).duration || (segment.endTime - segment.startTime),
    }
    editingSegment.value = idx
  }
}

const cancelEdit = (idx: number) => {
  editingSegment.value = null
  delete editForm.value[idx]
}

const setDuration = (idx: number, duration: number) => {
  if (!editForm.value[idx]) return
  editForm.value[idx].duration = duration
}

const setFileInputRef = (el: any, idx: number, type: 'first' | 'last') => {
  if (el) {
    fileInputRefs.value[`${idx}-${type}`] = el
  }
}

const triggerImageUpload = (idx: number, type: 'first' | 'last') => {
  const input = fileInputRefs.value[`${idx}-${type}`]
  if (input) {
    input.click()
  }
}

const handleImageUpload = async (idx: number, type: 'first' | 'last', event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    // Upload the file
    const formData = new FormData()
    formData.append('file', file)
    
    const uploadResult = await $fetch('/api/upload-brand-assets', {
      method: 'POST',
      body: formData,
    })

    if (uploadResult.files && uploadResult.files.length > 0) {
      const uploadedPath = uploadResult.files[0]
      if (type === 'first') {
        editForm.value[idx].firstFrameImage = uploadedPath
      } else {
        editForm.value[idx].lastFrameImage = uploadedPath
      }
      
      toast.add({
        title: 'Image Uploaded',
        description: `${type === 'first' ? 'First' : 'Last'} frame image uploaded successfully`,
        color: 'success',
      })
    }
  } catch (error: any) {
    console.error('Error uploading image:', error)
    toast.add({
      title: 'Upload Failed',
      description: error.message || 'Failed to upload image',
      color: 'error',
    })
  }

  // Reset input
  input.value = ''
}

const saveEdit = async (idx: number) => {
  if (!editForm.value[idx]) return
  
  savingSegment.value = idx
  
  try {
    const segment = props.storyboard.segments[idx]
    const updatedSegment: Segment & {
      duration?: number
      resolution?: string
      aspectRatio?: string
      negativePrompt?: string
    } = {
      ...segment,
      description: editForm.value[idx].description,
      visualPrompt: editForm.value[idx].visualPrompt,
      firstFrameImage: editForm.value[idx].firstFrameImage,
      lastFrameImage: editForm.value[idx].lastFrameImage,
      duration: editForm.value[idx].duration,
      resolution: editForm.value[idx].resolution,
      aspectRatio: editForm.value[idx].aspectRatio,
      negativePrompt: editForm.value[idx].negativePrompt || undefined,
    }

    // Emit to parent to handle save
    emit('edit', idx)
    
    // Update local storyboard (parent will handle backend save)
    props.storyboard.segments[idx] = updatedSegment
    
    toast.add({
      title: 'Saved',
      description: 'Segment updated successfully',
      color: 'success',
    })
    
    editingSegment.value = null
    delete editForm.value[idx]
  } catch (error: any) {
    console.error('Error saving segment:', error)
    toast.add({
      title: 'Save Failed',
      description: error.message || 'Failed to save changes',
      color: 'error',
    })
  } finally {
    savingSegment.value = null
  }
}

// Get asset for a segment by index
const getAssetForSegment = (segmentIdx: number) => {
  if (!props.assets) return null
  return props.assets.find(asset => asset.segmentId === segmentIdx) || null
}

// Get video URL for a segment
const getVideoUrl = (segmentIdx: number): string | null => {
  const asset = getAssetForSegment(segmentIdx)
  if (!asset) return null
  return asset.videoUrl || asset.metadata?.videoUrl || asset.metadata?.replicateVideoUrl || null
}

// Get voice URL for a segment
const getVoiceUrl = (segmentIdx: number): string | null => {
  const asset = getAssetForSegment(segmentIdx)
  if (!asset) return null
  return asset.voiceUrl || asset.metadata?.voiceUrl || null
}

// Get audio URL from voiceUrl path
const getAudioUrl = (voiceUrl: string | null): string => {
  if (!voiceUrl) return ''
  if (voiceUrl.startsWith('http')) return voiceUrl
  if (voiceUrl.startsWith('/api/')) return voiceUrl
  const filename = voiceUrl.split('/').pop() || voiceUrl
  return `/api/assets/${filename}`
}

// Set video element ref
const setVideoRef = (el: any, segmentIdx: number) => {
  if (el) {
    videoRefs.value[segmentIdx] = el
  }
}

// Set audio element ref
const setAudioRef = (el: any, segmentIdx: number) => {
  if (el) {
    audioRefs.value[segmentIdx] = el
    el.addEventListener('loadedmetadata', () => {
      audioDuration.value[segmentIdx] = el.duration
    })
  }
}

// Video loaded handler
const onVideoLoaded = (segmentIdx: number) => {
  console.log(`[StoryboardView] Video loaded for segment ${segmentIdx + 1}`)
}

// Audio player functions
const getAudioPlayingState = (segmentIdx: number): boolean => {
  return audioPlaying.value[segmentIdx] || false
}

const getAudioProgress = (segmentIdx: number): number => {
  return audioProgress.value[segmentIdx] || 0
}

const formatAudioTime = (segmentIdx: number): string => {
  const current = audioCurrentTime.value[segmentIdx] || 0
  const duration = audioDuration.value[segmentIdx] || 0
  return `${formatTime(current)} / ${formatTime(duration)}`
}

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const toggleAudioPlay = (segmentIdx: number, voiceUrl: string | null) => {
  if (!voiceUrl) return
  const audio = audioRefs.value[segmentIdx]
  if (!audio) return

  // Pause all other audio players
  Object.keys(audioRefs.value).forEach((id) => {
    const otherId = Number(id)
    if (otherId !== segmentIdx && audioRefs.value[otherId]) {
      audioRefs.value[otherId].pause()
      audioPlaying.value[otherId] = false
    }
  })

  if (audio.paused) {
    audio.play().then(() => {
      audioPlaying.value[segmentIdx] = true
    }).catch((error) => {
      console.error('Error playing audio:', error)
    })
  } else {
    audio.pause()
    audioPlaying.value[segmentIdx] = false
  }
}

const onAudioTimeUpdate = (segmentIdx: number, event: Event) => {
  const audio = event.target as HTMLAudioElement
  if (audio) {
    audioCurrentTime.value[segmentIdx] = audio.currentTime
    const duration = audio.duration || 0
    if (duration > 0) {
      audioProgress.value[segmentIdx] = (audio.currentTime / duration) * 100
    }
  }
}

const onAudioEnded = (segmentIdx: number) => {
  audioPlaying.value[segmentIdx] = false
  audioProgress.value[segmentIdx] = 0
}

const onAudioSeek = (segmentIdx: number, progress: number) => {
  const audio = audioRefs.value[segmentIdx]
  if (audio && audio.duration) {
    audio.currentTime = (progress / 100) * audio.duration
  }
}

// Get selected prompt
const getSelectedPrompt = (segment: Segment): string => {
  if (segment.selectedPromptIndex && segment.selectedPromptIndex > 0 && segment.visualPromptAlternatives) {
    const altIndex = segment.selectedPromptIndex - 1
    return segment.visualPromptAlternatives[altIndex] || segment.visualPrompt
  }
  return segment.visualPrompt
}

// Select prompt alternative
const selectPrompt = (segmentIdx: number, promptIndex: number) => {
  emit('prompt-selected', segmentIdx, promptIndex)
}

// Get segment color
const getSegmentColor = (type: string): string => {
  switch (type) {
    case 'hook':
      return 'blue'
    case 'body':
      return 'green'
    case 'cta':
      return 'orange'
    default:
      return 'gray'
  }
}

// Handle regenerate
const handleRegenerate = async (idx: number) => {
  if (!props.retrySegment) return
  
  regeneratingSegments.value[idx] = true
  
  try {
    await props.retrySegment(idx)
    emit('regenerate', idx)
    
    toast.add({
      title: 'Regenerating',
      description: `Segment ${idx + 1} is being regenerated`,
      color: 'blue',
    })
  } catch (error: any) {
    console.error('Error regenerating segment:', error)
    regeneratingSegments.value[idx] = false
    
    toast.add({
      title: 'Regeneration Failed',
      description: error.message || 'Failed to regenerate segment',
      color: 'error',
    })
  }
}
</script>

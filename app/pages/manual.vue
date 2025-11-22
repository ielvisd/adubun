<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
    <UContainer class="max-w-6xl">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Scene Builder</h1>
          <p class="text-gray-600 dark:text-gray-400">Build your video scene by scene with granular control.</p>
        </div>
        <div class="flex gap-2">
            <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-arrow-left"
            to="/"
            >
            Back Home
            </UButton>
            <UButton
            v-if="completedSegments.length > 0"
            color="primary"
            size="lg"
            icon="i-heroicons-film"
            :loading="compiling"
            @click="compileVideo"
            >
            Compile Full Video ({{ completedSegments.length }} Clips)
            </UButton>
        </div>
      </div>

      <!-- Global Settings -->
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
        <h2 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
          <UIcon name="i-heroicons-cog-6-tooth" />
          Global Project Settings
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <UFormField label="Aspect Ratio" name="aspectRatio">
            <USelect
              v-model="settings.aspectRatio"
              :items="[
                { label: '16:9 (Landscape)', value: '16:9' },
                { label: '9:16 (Portrait)', value: '9:16' }
              ]"
            />
          </UFormField>
          <UFormField label="Video Model" name="model">
            <USelect
              v-model="settings.model"
              :items="[
                 { label: 'Google Veo 3.1', value: 'google/veo-3.1' }
              ]"
              disabled
            />
          </UFormField>
          <UFormField label="Image Model" name="imageModel">
            <USelect
              v-model="settings.imageModel"
              :items="[
                 { label: 'Nano Banana', value: 'google/nano-banana' },
                 { label: 'Seedream 4.0', value: 'bytedance/seedream-4' }
              ]"
            />
          </UFormField>
        </div>
        
        <!-- Global Reference Image Uploaders -->
        <div class="border-t border-gray-100 dark:border-gray-700 pt-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            <!-- Global Model Reference -->
            <div>
                <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Global Model Reference (Backup)</h3>
                <p class="text-xs text-gray-500 mb-3">Main character/object used if no local reference is set.</p>
                
                <div class="flex items-start gap-4">
                    <div v-if="settings.modelReference" class="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 group">
                        <img :src="settings.modelReference" class="w-full h-full object-cover" />
                        <button 
                            @click="settings.modelReference = undefined" 
                            class="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <UIcon name="i-heroicons-x-mark" class="w-3 h-3" />
                        </button>
                    </div>
                    
                    <div class="flex-1">
                       <UiMultiImageUpload
                         v-model="modelRefFiles"
                         :max-images="1"
                         @upload="handleModelRefUpload"
                       />
                    </div>
                </div>
            </div>

            <!-- Global Style Reference -->
            <div>
                <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Global Style Reference (Backup)</h3>
                <p class="text-xs text-gray-500 mb-3">Visual style fallback.</p>
                
                <div class="flex items-start gap-4">
                    <div v-if="settings.styleReference" class="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 group">
                        <img :src="settings.styleReference" class="w-full h-full object-cover" />
                        <button 
                            @click="settings.styleReference = undefined" 
                            class="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <UIcon name="i-heroicons-x-mark" class="w-3 h-3" />
                        </button>
                    </div>
                    
                    <div class="flex-1">
                       <UiMultiImageUpload
                         v-model="styleRefFiles"
                         :max-images="1"
                         @upload="handleStyleRefUpload"
                       />
                    </div>
                </div>
            </div>
        </div>
      </div>

      <!-- Scenes List -->
      <div class="space-y-8">
        <div 
          v-for="(segment, index) in segments" 
          :key="segment.id"
          class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-all hover:border-primary-500/30"
          :class="{ 'ring-2 ring-primary-500': activeSegmentId === segment.id }"
        >
          <!-- Scene Header -->
          <div class="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between cursor-pointer" @click="toggleSegment(segment.id)">
            <div class="flex items-center gap-3">
              <span class="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 text-sm font-bold">
                {{ index + 1 }}
              </span>
              <span class="font-medium text-gray-900 dark:text-white">
                {{ segment.startPrompt ? segment.startPrompt.substring(0, 40) + '...' : 'New Scene' }}
              </span>
              <UBadge v-if="segment.status === 'completed'" color="green" variant="subtle">Ready</UBadge>
              <UBadge v-else-if="segment.status === 'processing'" color="blue" variant="subtle">Generating...</UBadge>
              <UBadge v-else color="gray" variant="subtle">Draft</UBadge>
            </div>
            <div class="flex items-center gap-2">
              <UButton 
                icon="i-heroicons-trash" 
                color="red" 
                variant="ghost" 
                size="xs"
                @click.stop="removeSegment(index)"
                :disabled="segments.length === 1"
              />
              <UIcon :name="activeSegmentId === segment.id ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" />
            </div>
          </div>

          <!-- Scene Editor Body -->
          <div v-show="activeSegmentId === segment.id" class="p-6 space-y-8">
            
            <!-- START FRAME SECTION -->
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-6 border-b border-gray-100 dark:border-gray-700">
                <!-- Left: Prompt -->
                <div class="lg:col-span-7 space-y-2">
                    <span class="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <UBadge color="black" size="xs">START</UBadge> Frame Prompt
                    </span>
                    <UTextarea 
                        v-model="segment.startPrompt"
                        :rows="3"
                        placeholder="Describe the beginning of the scene..."
                        autoresize
                        class="w-full"
                    />
                </div>
                <!-- Right: References -->
                <div class="lg:col-span-5 grid grid-cols-2 gap-4">
                    <!-- Start Model Ref -->
                    <div class="space-y-1">
                        <span class="text-xs font-medium text-gray-500 uppercase">Start Model Ref</span>
                        <div 
                            class="relative h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 transition-colors flex flex-col items-center justify-center cursor-pointer overflow-hidden bg-gray-50 dark:bg-gray-900"
                            @click="triggerFileInput(`start-model-${index}`)"
                        >
                            <img v-if="segment.startModelRef" :src="segment.startModelRef" class="absolute inset-0 w-full h-full object-cover" />
                            <div v-else class="text-center p-2">
                                <UIcon name="i-heroicons-user" class="w-5 h-5 text-gray-400 mx-auto" />
                                <span class="text-[10px] text-gray-500 block mt-1">Upload Character</span>
                            </div>
                            <div v-if="segment.startModelRef" class="absolute top-1 right-1" @click.stop="segment.startModelRef = undefined">
                                <div class="bg-red-500 text-white rounded-full p-0.5"><UIcon name="i-heroicons-x-mark" class="w-3 h-3" /></div>
                            </div>
                            <input type="file" :id="`start-model-${index}`" class="hidden" accept="image/*" @change="(e) => handleInlineUpload(e, index, 'start', 'model')" />
                        </div>
                    </div>
                     <!-- Start Style Ref -->
                    <div class="space-y-1">
                        <span class="text-xs font-medium text-gray-500 uppercase">Start Style Ref</span>
                        <div 
                            class="relative h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 transition-colors flex flex-col items-center justify-center cursor-pointer overflow-hidden bg-gray-50 dark:bg-gray-900"
                            @click="triggerFileInput(`start-style-${index}`)"
                        >
                            <img v-if="segment.startStyleRef" :src="segment.startStyleRef" class="absolute inset-0 w-full h-full object-cover" />
                            <div v-else class="text-center p-2">
                                <UIcon name="i-heroicons-photo" class="w-5 h-5 text-gray-400 mx-auto" />
                                <span class="text-[10px] text-gray-500 block mt-1">Upload Background</span>
                            </div>
                            <div v-if="segment.startStyleRef" class="absolute top-1 right-1" @click.stop="segment.startStyleRef = undefined">
                                <div class="bg-red-500 text-white rounded-full p-0.5"><UIcon name="i-heroicons-x-mark" class="w-3 h-3" /></div>
                            </div>
                            <input type="file" :id="`start-style-${index}`" class="hidden" accept="image/*" @change="(e) => handleInlineUpload(e, index, 'start', 'style')" />
                        </div>
                    </div>
                </div>
            </div>


            <!-- END FRAME SECTION -->
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-6 border-b border-gray-100 dark:border-gray-700">
                <!-- Left: Prompt -->
                <div class="lg:col-span-7 space-y-2">
                    <span class="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <UBadge color="black" size="xs">END</UBadge> Frame Prompt
                    </span>
                    <UTextarea 
                        v-model="segment.endPrompt"
                        :rows="3"
                        placeholder="Describe the end of the scene..."
                        autoresize
                        class="w-full"
                    />
                </div>
                <!-- Right: References -->
                <div class="lg:col-span-5 grid grid-cols-2 gap-4">
                    <!-- End Model Ref -->
                    <div class="space-y-1">
                        <span class="text-xs font-medium text-gray-500 uppercase">End Model Ref</span>
                        <div 
                            class="relative h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 transition-colors flex flex-col items-center justify-center cursor-pointer overflow-hidden bg-gray-50 dark:bg-gray-900"
                            @click="triggerFileInput(`end-model-${index}`)"
                        >
                            <img v-if="segment.endModelRef" :src="segment.endModelRef" class="absolute inset-0 w-full h-full object-cover" />
                            <div v-else class="text-center p-2">
                                <UIcon name="i-heroicons-user" class="w-5 h-5 text-gray-400 mx-auto" />
                                <span class="text-[10px] text-gray-500 block mt-1">Upload Character</span>
                            </div>
                            <div v-if="segment.endModelRef" class="absolute top-1 right-1" @click.stop="segment.endModelRef = undefined">
                                <div class="bg-red-500 text-white rounded-full p-0.5"><UIcon name="i-heroicons-x-mark" class="w-3 h-3" /></div>
                            </div>
                            <input type="file" :id="`end-model-${index}`" class="hidden" accept="image/*" @change="(e) => handleInlineUpload(e, index, 'end', 'model')" />
                        </div>
                    </div>
                     <!-- End Style Ref -->
                    <div class="space-y-1">
                        <span class="text-xs font-medium text-gray-500 uppercase">End Style Ref</span>
                        <div 
                            class="relative h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 transition-colors flex flex-col items-center justify-center cursor-pointer overflow-hidden bg-gray-50 dark:bg-gray-900"
                            @click="triggerFileInput(`end-style-${index}`)"
                        >
                            <img v-if="segment.endStyleRef" :src="segment.endStyleRef" class="absolute inset-0 w-full h-full object-cover" />
                            <div v-else class="text-center p-2">
                                <UIcon name="i-heroicons-photo" class="w-5 h-5 text-gray-400 mx-auto" />
                                <span class="text-[10px] text-gray-500 block mt-1">Upload Background</span>
                            </div>
                            <div v-if="segment.endStyleRef" class="absolute top-1 right-1" @click.stop="segment.endStyleRef = undefined">
                                <div class="bg-red-500 text-white rounded-full p-0.5"><UIcon name="i-heroicons-x-mark" class="w-3 h-3" /></div>
                            </div>
                            <input type="file" :id="`end-style-${index}`" class="hidden" accept="image/*" @change="(e) => handleInlineUpload(e, index, 'end', 'style')" />
                        </div>
                    </div>
                </div>
            </div>

            <!-- ACTION / MOTION -->
            <div class="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div class="md:col-span-8 space-y-2">
                    <span class="text-sm font-bold text-gray-900 dark:text-white">Motion/Action Description</span>
                    <UTextarea 
                        v-model="segment.actionPrompt"
                        :rows="2"
                        placeholder="Action: The lion wakes up suddenly, lifts its head, and roars powerfully..."
                        autoresize
                    />
                </div>
                 <div class="md:col-span-4 space-y-2">
                    <span class="text-sm font-bold text-gray-900 dark:text-white">Clip Duration</span>
                    <div class="flex items-center gap-2 h-full pt-2">
                        <URange v-model="segment.duration" :min="4" :max="8" :step="1" />
                        <span class="font-mono font-bold text-lg">{{ segment.duration }}s</span>
                    </div>
                </div>
            </div>


            <!-- KEYFRAME & VIDEO PREVIEWS -->
            <div class="border-t border-gray-100 dark:border-gray-700 pt-6 space-y-6">
              
              <!-- Images Row -->
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-semibold uppercase tracking-wider text-gray-500">Generated Keyframes</h3>
                <div class="flex gap-2">
                    <UButton
                    v-if="segment.startPrompt || segment.firstFrame"
                    size="sm"
                    color="gray"
                    variant="solid"
                    icon="i-heroicons-photo"
                    :loading="segment.generatingImages"
                    @click="generateKeyframes(index, 'start')"
                    >
                    {{ segment.firstFrame ? 'Regenerate Start' : 'Generate Start' }}
                    </UButton>
                    
                    <UButton
                    v-if="segment.endPrompt || segment.lastFrame"
                    size="sm"
                    color="gray"
                    variant="solid"
                    icon="i-heroicons-photo"
                    :loading="segment.generatingImages"
                    @click="generateKeyframes(index, 'end')"
                    >
                    {{ segment.lastFrame ? 'Regenerate End' : 'Generate End' }}
                    </UButton>
                    
                    <UButton
                    v-if="(!segment.startPrompt && !segment.endPrompt) || (!segment.firstFrame && !segment.lastFrame)"
                    size="sm"
                    color="primary"
                    variant="outline"
                    icon="i-heroicons-sparkles"
                    :loading="segment.generatingImages"
                    @click="generateKeyframes(index)"
                    >
                    Generate All
                    </UButton>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <!-- First Frame Preview -->
                <div class="relative aspect-video bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 group">
                  <img v-if="segment.firstFrame" :src="segment.firstFrame" class="w-full h-full object-cover" />
                  <div v-else class="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2">
                    <UIcon name="i-heroicons-photo" class="w-8 h-8" />
                    <span class="text-xs">Start Frame</span>
                    <UButton 
                        v-if="index > 0"
                        size="xs" 
                        color="gray" 
                        variant="soft" 
                        icon="i-heroicons-arrow-down-on-square"
                        @click="applyContinuity(index)"
                    >
                        Use Previous End Frame
                    </UButton>
                  </div>
                  <div class="absolute top-2 left-2 flex gap-1">
                    <UBadge size="xs" color="black" variant="solid" class="bg-black/50 backdrop-blur-sm">START</UBadge>
                  </div>
                </div>

                <!-- Last Frame Preview -->
                <div class="relative aspect-video bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 group">
                  <img v-if="segment.lastFrame" :src="segment.lastFrame" class="w-full h-full object-cover" />
                  <div v-else class="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                    <UIcon name="i-heroicons-photo" class="w-8 h-8 mb-2" />
                    <span class="text-xs">End Frame</span>
                  </div>
                  <div class="absolute top-2 left-2 flex gap-1">
                    <UBadge size="xs" color="black" variant="solid" class="bg-black/50 backdrop-blur-sm">END</UBadge>
                  </div>
                </div>
              </div>

              <!-- Video Row -->
              <div class="pt-4 border-t border-gray-50 dark:border-gray-800">
                 <div class="flex items-center justify-between mb-4">
                    <h3 class="text-sm font-semibold uppercase tracking-wider text-gray-500">Video Clip</h3>
                    <UButton
                    v-if="segment.firstFrame && segment.lastFrame"
                    size="md"
                    color="primary"
                    variant="solid"
                    icon="i-heroicons-video-camera"
                    :loading="segment.status === 'processing'"
                    @click="generateClip(index)"
                    >
                    {{ segment.videoUrl ? 'Regenerate Clip' : 'Generate Clip' }}
                    </UButton>
                </div>

                <div v-if="segment.videoUrl" class="relative aspect-video bg-black rounded-lg overflow-hidden shadow-lg max-w-2xl mx-auto">
                    <video controls class="w-full h-full" :src="segment.videoUrl"></video>
                </div>
                <div v-else-if="segment.status === 'processing'" class="aspect-video bg-gray-100 dark:bg-gray-900 rounded-lg flex flex-col items-center justify-center text-gray-500">
                    <UIcon name="i-heroicons-arrow-path" class="w-10 h-10 animate-spin mb-3 text-primary-500" />
                    <p>Generating video...</p>
                </div>
              </div>
            </div>

          </div>
        </div>

        <!-- Add Scene Button -->
        <div class="flex justify-center py-4">
          <UButton
            variant="outline"
            color="gray"
            icon="i-heroicons-plus"
            @click="addSegment"
          >
            Add Next Scene
          </UButton>
        </div>
      </div>

    </UContainer>
  </div>
</template>

<script setup lang="ts">
import { nanoid } from 'nanoid'
import type { Segment } from '~/app/types/generation'

// Types
interface SceneSegment {
  id: string
  startPrompt: string
  endPrompt: string
  actionPrompt: string
  duration: number
  firstFrame?: string
  lastFrame?: string
  videoUrl?: string
  status: 'draft' | 'processing' | 'completed' | 'failed'
  generatingImages: boolean
  
  // Local References
  startModelRef?: string
  startStyleRef?: string
  endModelRef?: string
  endStyleRef?: string
}

// State
const segments = ref<SceneSegment[]>([
  { id: nanoid(), startPrompt: '', endPrompt: '', actionPrompt: '', duration: 5, status: 'draft', generatingImages: false }
])
const activeSegmentId = ref<string>(segments.value[0].id)
const compiling = ref(false)

const settings = reactive({
  aspectRatio: '16:9' as '16:9' | '9:16',
  model: 'google/veo-3.1',
  imageModel: 'google/nano-banana',
  modelReference: undefined as string | undefined,
  styleReference: undefined as string | undefined
})

const modelRefFiles = ref([])
const styleRefFiles = ref([])

const toast = useToast()
const router = useRouter()

// Computed
const completedSegments = computed(() => segments.value.filter(s => s.status === 'completed'))

// Actions
const toggleSegment = (id: string) => {
  if (activeSegmentId.value === id) {
    // activeSegmentId.value = '' // Optional: toggle off
  } else {
    activeSegmentId.value = id
  }
}

const addSegment = () => {
  const newId = nanoid()
  
  segments.value.push({
    id: newId,
    startPrompt: '', 
    endPrompt: '',
    actionPrompt: '',
    duration: 5,
    status: 'draft',
    generatingImages: false,
    // Do NOT automatically carry over frame. Continuity is now manual opt-in.
    firstFrame: undefined
  })
  activeSegmentId.value = newId
  
  nextTick(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  })
}

const removeSegment = (index: number) => {
  segments.value.splice(index, 1)
}

// Helper Upload Handler
const handleUpload = async (files: (File | string | null)[]) => {
    if (files.length > 0) {
        const file = files[0]
        if (file instanceof File) {
            const formData = new FormData()
            formData.append('images', file)
            try {
                const result = await $fetch<{ urls: string[] }>('/api/upload-images-s3', {
                    method: 'POST',
                    body: formData
                })
                if (result.urls && result.urls.length > 0) {
                    return result.urls[0]
                }
            } catch (error) {
                console.error('Upload failed:', error)
                toast.add({ title: 'Error', description: 'Failed to upload reference', color: 'red' })
            }
        } else if (typeof file === 'string') {
            return file
        }
    }
    return undefined
}

// Global Handlers
const handleModelRefUpload = async (files: (File | string | null)[]) => {
    const url = await handleUpload(files)
    if (url) settings.modelReference = url
}
const handleStyleRefUpload = async (files: (File | string | null)[]) => {
    const url = await handleUpload(files)
    if (url) settings.styleReference = url
}

// Local Inline Upload Trigger
const triggerFileInput = (id: string) => {
    document.getElementById(id)?.click()
}

const handleInlineUpload = async (event: Event, index: number, frame: 'start' | 'end', type: 'model' | 'style') => {
    const target = event.target as HTMLInputElement
    if (target.files && target.files.length > 0) {
        const file = target.files[0]
        // We assume handleUpload accepts array, so wrap in array
        const url = await handleUpload([file])
        if (url) {
             const segment = segments.value[index]
             if (frame === 'start' && type === 'model') segment.startModelRef = url
             if (frame === 'start' && type === 'style') segment.startStyleRef = url
             if (frame === 'end' && type === 'model') segment.endModelRef = url
             if (frame === 'end' && type === 'style') segment.endStyleRef = url
             toast.add({ title: 'Success', description: 'Reference uploaded', color: 'green' })
        }
        target.value = '' // reset
    }
}

const applyContinuity = (index: number) => {
    if (index > 0) {
        const prevSegment = segments.value[index - 1]
        if (prevSegment && prevSegment.lastFrame) {
            segments.value[index].firstFrame = prevSegment.lastFrame
            // Also suggest prompt if empty
            if (!segments.value[index].startPrompt) {
                segments.value[index].startPrompt = prevSegment.endPrompt
            }
            toast.add({ title: 'Applied', description: 'Copied frame from previous scene.', color: 'green' })
        } else {
            toast.add({ title: 'Unavailable', description: 'Previous scene has no end frame.', color: 'orange' })
        }
    }
}

// Generate Keyframes (Start & End)
const generateKeyframes = async (index: number, target: 'start' | 'end' | 'both' = 'both') => {
  const segment = segments.value[index]
  
  // Validation
  if (target === 'start' && !segment.startPrompt) {
      toast.add({ title: 'Error', description: 'Please enter a start description.', color: 'red' })
      return
  }
  if (target === 'end' && !segment.endPrompt) {
      toast.add({ title: 'Error', description: 'Please enter an end description.', color: 'red' })
      return
  }
  if (target === 'both' && !segment.startPrompt && !segment.endPrompt) {
     toast.add({ title: 'Error', description: 'Please enter a start or end description.', color: 'red' })
     return
  }

  segment.generatingImages = true
  try {
    const commonBody = {
        aspectRatio: settings.aspectRatio,
        model: settings.imageModel,
    }

    // 1. Generate Start Frame
    if (target === 'start' || target === 'both') {
         // Only generate if we have a prompt or if it's the first scene and empty (though prompt check handles it)
         if (segment.startPrompt) {
            const startRes = await $fetch('/api/generate-image', {
                method: 'POST',
                body: { 
                    ...commonBody, 
                    prompt: segment.startPrompt + ", cinematic shot",
                    modelReference: segment.startModelRef || settings.modelReference,
                    styleReference: segment.startStyleRef || settings.styleReference
                }
            })
            segment.firstFrame = startRes.url
            toast.add({ title: 'Success', description: 'Start frame generated!', color: 'green' })
         }
    }

    // 2. Generate End Frame
    if (target === 'end' || target === 'both') {
        if (segment.endPrompt) {
            let modelRef = segment.endModelRef || settings.modelReference
            let styleRef = segment.endStyleRef || settings.styleReference
            
            // If no specific end style ref, use start frame for continuity (if exists)
            if (!segment.endStyleRef && segment.firstFrame) {
                styleRef = segment.firstFrame
            }

            const endRes = await $fetch('/api/generate-image', {
                method: 'POST',
                body: { 
                    ...commonBody, 
                    prompt: segment.endPrompt + ", cinematic shot",
                    modelReference: modelRef,
                    styleReference: styleRef
                }
            })
            segment.lastFrame = endRes.url
            toast.add({ title: 'Success', description: 'End frame generated!', color: 'green' })
        }
    }

  } catch (error: any) {
    console.error('Keyframe Gen Error:', error)
    toast.add({ title: 'Error', description: 'Failed to generate images.', color: 'red' })
  } finally {
    segment.generatingImages = false
  }
}

// Generate Video Clip
const generateClip = async (index: number) => {
  const segment = segments.value[index]
  if (!segment.firstFrame || !segment.lastFrame) return

  segment.status = 'processing'
  try {
    const finalPrompt = segment.actionPrompt || `${segment.startPrompt} transitioning to ${segment.endPrompt}`

    // Video Generation Refs
    // We use the START FRAME model ref (or global) as the subject reference for the video
    const videoModelRef = segment.startModelRef || settings.modelReference
    
    // We don't pass style ref if we have start frame (handled in backend logic), 
    // but we pass it just in case logic changes, backend prioritizes firstFrame anyway.

    const res = await $fetch('/api/generate-clip', {
        method: 'POST',
        body: {
            prompt: finalPrompt,
            duration: segment.duration,
            firstFrame: segment.firstFrame,
            lastFrame: segment.lastFrame,
            aspectRatio: settings.aspectRatio,
            model: settings.model,
            modelReference: videoModelRef,
            // styleReference: ... (not needed as per previous fix for Veo)
        }
    })

    segment.videoUrl = res.url
    segment.status = 'completed'
    toast.add({ title: 'Success', description: 'Clip generated successfully!', color: 'green' })

  } catch (error: any) {
    console.error('Video Gen Error:', error)
    segment.status = 'failed'
    toast.add({ title: 'Error', description: error.message || 'Failed to generate video.', color: 'red' })
  }
}

// Compile Final Video
const compileVideo = async () => {
  if (completedSegments.value.length === 0) return

  compiling.value = true
  try {
    // Mock a Generation Job/Storyboard for the Preview page
    const mockSegments: Segment[] = segments.value.map((s, i) => ({
        type: 'body',
        description: s.actionPrompt || s.startPrompt, // Use action prompt for description
        startTime: i * 5, // approx
        endTime: (i + 1) * 5,
        visualPrompt: s.actionPrompt || s.startPrompt,
        status: 'completed',
        videoUrl: s.videoUrl,
        segmentId: i
    }))

    // Store in sessionStorage like generate.vue does
    const manualStoryboard = {
        id: `manual-${Date.now()}`,
        segments: mockSegments,
        meta: {
            aspectRatio: settings.aspectRatio,
            mode: 'manual',
            duration: segments.value.reduce((acc, s) => acc + s.duration, 0),
            subjectReference: settings.modelReference // Use model ref as subject
        },
        createdAt: Date.now()
    }
    
    sessionStorage.setItem('generateStoryboard', JSON.stringify(manualStoryboard))
    
    const fakeJobState = {
        jobId: 'manual-job',
        status: 'completed',
        segments: mockSegments,
        overallProgress: 100
    }
    sessionStorage.setItem('generateJobState', JSON.stringify(fakeJobState))

    await navigateTo('/generate')
    
  } catch (error) {
    console.error('Compilation Error:', error)
    toast.add({ title: 'Error', description: 'Failed to compile video.', color: 'red' })
  } finally {
    compiling.value = false
  }
}

// Auth check
const { user, loading: authLoading } = useAuth()
onMounted(() => {
  if (process.client) {
    const isDev = process.dev
    if (!authLoading.value && !user.value && !isDev) {
      router.push('/auth/login')
    }
  }
})
</script>

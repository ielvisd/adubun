<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
    <UContainer class="max-w-7xl">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Split Screen Composer</h1>
          <p class="text-gray-600 dark:text-gray-400">Generate two synchronized videos and stitch them side-by-side.</p>
        </div>
        <UButton
          color="gray"
          variant="ghost"
          icon="i-heroicons-arrow-left"
          to="/"
        >
          Back Home
        </UButton>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        
        <!-- LEFT VIDEO PANEL -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
           <div class="bg-gray-100 dark:bg-gray-700/50 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <div class="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                 <UBadge color="blue" variant="solid">LEFT</UBadge> Channel
              </div>
           </div>
           
           <div class="p-6 space-y-6 flex-1">
              <!-- Inputs -->
              <div class="space-y-4">
                 <UFormField label="Start Image Prompt">
                    <UTextarea v-model="left.startPrompt" :rows="2" placeholder="Describe the first frame..." autoresize />
                 </UFormField>
                 <UFormField label="Motion/Action Prompt">
                    <UTextarea v-model="left.actionPrompt" :rows="2" placeholder="Describe the movement..." autoresize />
                 </UFormField>
                 <UFormField label="End Image Prompt">
                    <UTextarea v-model="left.endPrompt" :rows="2" placeholder="Describe the last frame..." autoresize />
                 </UFormField>
              </div>
              
              <!-- References -->
              <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-1">
                     <span class="text-xs font-medium text-gray-500 uppercase">Start Model Ref</span>
                     <div class="relative h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 transition-colors flex items-center justify-center cursor-pointer overflow-hidden bg-gray-50 dark:bg-gray-900" @click="triggerFileInput('left-model')">
                         <img v-if="left.modelRef" :src="left.modelRef" class="absolute inset-0 w-full h-full object-cover" />
                         <div v-else class="text-center p-2"><UIcon name="i-heroicons-user" class="text-gray-400" /></div>
                         <div v-if="left.modelRef" class="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5" @click.stop="left.modelRef = undefined"><UIcon name="i-heroicons-x-mark" class="w-3 h-3" /></div>
                         <input type="file" id="left-model" class="hidden" accept="image/*" @change="(e) => handleUpload(e, 'left', 'model')" />
                     </div>
                  </div>
                  <div class="space-y-1">
                     <span class="text-xs font-medium text-gray-500 uppercase">Start Style Ref</span>
                     <div class="relative h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 transition-colors flex items-center justify-center cursor-pointer overflow-hidden bg-gray-50 dark:bg-gray-900" @click="triggerFileInput('left-style')">
                         <img v-if="left.styleRef" :src="left.styleRef" class="absolute inset-0 w-full h-full object-cover" />
                         <div v-else class="text-center p-2"><UIcon name="i-heroicons-photo" class="text-gray-400" /></div>
                         <div v-if="left.styleRef" class="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5" @click.stop="left.styleRef = undefined"><UIcon name="i-heroicons-x-mark" class="w-3 h-3" /></div>
                         <input type="file" id="left-style" class="hidden" accept="image/*" @change="(e) => handleUpload(e, 'left', 'style')" />
                     </div>
                  </div>
              </div>

              <!-- Action Buttons -->
              <div class="flex gap-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <UButton size="sm" color="gray" variant="solid" :loading="left.generatingImages" @click="generateKeyframes('left')" :disabled="!left.startPrompt || !left.endPrompt">
                      Gen Images
                  </UButton>
                  <UButton size="sm" color="primary" variant="solid" :loading="left.generatingVideo" @click="generateVideo('left')" :disabled="!left.firstFrame || !left.lastFrame">
                      Gen Video
                  </UButton>
              </div>

              <!-- Previews -->
              <div class="grid grid-cols-2 gap-2">
                  <div class="aspect-video bg-gray-100 dark:bg-gray-900 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
                      <img v-if="left.firstFrame" :src="left.firstFrame" class="w-full h-full object-cover" />
                      <div v-else class="h-full flex items-center justify-center text-xs text-gray-400">Start</div>
                  </div>
                  <div class="aspect-video bg-gray-100 dark:bg-gray-900 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
                      <img v-if="left.lastFrame" :src="left.lastFrame" class="w-full h-full object-cover" />
                      <div v-else class="h-full flex items-center justify-center text-xs text-gray-400">End</div>
                  </div>
              </div>

              <!-- Video Player -->
              <div v-if="left.videoUrl" class="aspect-video bg-black rounded-lg overflow-hidden shadow-md">
                  <video :src="left.videoUrl" controls class="w-full h-full"></video>
              </div>
           </div>
        </div>

        <!-- RIGHT VIDEO PANEL -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
           <div class="bg-gray-100 dark:bg-gray-700/50 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <div class="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                 <UBadge color="orange" variant="solid">RIGHT</UBadge> Channel
              </div>
              <!-- Match Helper -->
               <UButton
                 v-if="left.videoUrl || left.firstFrame"
                 size="xs"
                 color="gray"
                 variant="soft"
                 icon="i-heroicons-arrows-right-left"
                 @click="copyRefFromLeft"
               >
                 Use Left as Ref
               </UButton>
           </div>

           <div class="p-6 space-y-6 flex-1">
              <!-- Inputs -->
              <div class="space-y-4">
                 <UFormField label="Start Image Prompt">
                    <UTextarea v-model="right.startPrompt" :rows="2" placeholder="Describe the first frame..." autoresize />
                 </UFormField>
                 <UFormField label="Motion/Action Prompt">
                    <UTextarea v-model="right.actionPrompt" :rows="2" placeholder="Describe the movement..." autoresize />
                 </UFormField>
                 <UFormField label="End Image Prompt">
                    <UTextarea v-model="right.endPrompt" :rows="2" placeholder="Describe the last frame..." autoresize />
                 </UFormField>
              </div>
              
              <!-- References -->
              <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-1">
                     <span class="text-xs font-medium text-gray-500 uppercase">Start Model Ref</span>
                     <div class="relative h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 transition-colors flex items-center justify-center cursor-pointer overflow-hidden bg-gray-50 dark:bg-gray-900" @click="triggerFileInput('right-model')">
                         <img v-if="right.modelRef" :src="right.modelRef" class="absolute inset-0 w-full h-full object-cover" />
                         <div v-else class="text-center p-2"><UIcon name="i-heroicons-user" class="text-gray-400" /></div>
                         <div v-if="right.modelRef" class="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5" @click.stop="right.modelRef = undefined"><UIcon name="i-heroicons-x-mark" class="w-3 h-3" /></div>
                         <input type="file" id="right-model" class="hidden" accept="image/*" @change="(e) => handleUpload(e, 'right', 'model')" />
                     </div>
                  </div>
                  <div class="space-y-1">
                     <span class="text-xs font-medium text-gray-500 uppercase">Start Style Ref</span>
                     <div class="relative h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 transition-colors flex items-center justify-center cursor-pointer overflow-hidden bg-gray-50 dark:bg-gray-900" @click="triggerFileInput('right-style')">
                         <img v-if="right.styleRef" :src="right.styleRef" class="absolute inset-0 w-full h-full object-cover" />
                         <div v-else class="text-center p-2"><UIcon name="i-heroicons-photo" class="text-gray-400" /></div>
                         <div v-if="right.styleRef" class="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5" @click.stop="right.styleRef = undefined"><UIcon name="i-heroicons-x-mark" class="w-3 h-3" /></div>
                         <input type="file" id="right-style" class="hidden" accept="image/*" @change="(e) => handleUpload(e, 'right', 'style')" />
                     </div>
                  </div>
              </div>

              <!-- Action Buttons -->
              <div class="flex gap-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <UButton size="sm" color="gray" variant="solid" :loading="right.generatingImages" @click="generateKeyframes('right')" :disabled="!right.startPrompt || !right.endPrompt">
                      Gen Images
                  </UButton>
                  <UButton size="sm" color="primary" variant="solid" :loading="right.generatingVideo" @click="generateVideo('right')" :disabled="!right.firstFrame || !right.lastFrame">
                      Gen Video
                  </UButton>
              </div>

              <!-- Previews -->
              <div class="grid grid-cols-2 gap-2">
                  <div class="aspect-video bg-gray-100 dark:bg-gray-900 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
                      <img v-if="right.firstFrame" :src="right.firstFrame" class="w-full h-full object-cover" />
                      <div v-else class="h-full flex items-center justify-center text-xs text-gray-400">Start</div>
                  </div>
                  <div class="aspect-video bg-gray-100 dark:bg-gray-900 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
                      <img v-if="right.lastFrame" :src="right.lastFrame" class="w-full h-full object-cover" />
                      <div v-else class="h-full flex items-center justify-center text-xs text-gray-400">End</div>
                  </div>
              </div>

              <!-- Video Player -->
              <div v-if="right.videoUrl" class="aspect-video bg-black rounded-lg overflow-hidden shadow-md">
                  <video :src="right.videoUrl" controls class="w-full h-full"></video>
              </div>
           </div>
        </div>
      </div>

      <!-- STITCH SECTION -->
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <div class="max-w-md mx-auto space-y-6">
              <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Stitch Split Screen</h2>
              <p class="text-gray-500">Combine both generated videos into a single split-screen video.</p>
              
              <UButton
                size="xl"
                color="primary"
                icon="i-heroicons-scissors"
                :loading="stitching"
                :disabled="!left.videoUrl || !right.videoUrl"
                block
                @click="stitchVideos"
              >
                Generate Split Screen Video
              </UButton>

              <div v-if="stitchedVideoUrl" class="mt-8 bg-black rounded-xl overflow-hidden shadow-2xl border-4 border-gray-900 dark:border-gray-700">
                  <video :src="stitchedVideoUrl" controls class="w-full aspect-video"></video>
              </div>
          </div>
      </div>

    </UContainer>
  </div>
</template>

<script setup lang="ts">
interface ChannelState {
    startPrompt: string
    endPrompt: string
    actionPrompt: string
    modelRef?: string
    styleRef?: string
    firstFrame?: string
    lastFrame?: string
    videoUrl?: string
    generatingImages: boolean
    generatingVideo: boolean
}

const left = reactive<ChannelState>({
    startPrompt: '',
    endPrompt: '',
    actionPrompt: '',
    generatingImages: false,
    generatingVideo: false
})

const right = reactive<ChannelState>({
    startPrompt: '',
    endPrompt: '',
    actionPrompt: '',
    generatingImages: false,
    generatingVideo: false
})

const stitching = ref(false)
const stitchedVideoUrl = ref<string | undefined>(undefined)
const toast = useToast()

// Upload Helper
const triggerFileInput = (id: string) => document.getElementById(id)?.click()

const handleUpload = async (event: Event, side: 'left' | 'right', type: 'model' | 'style') => {
    const target = event.target as HTMLInputElement
    if (target.files && target.files.length > 0) {
        const file = target.files[0]
        const formData = new FormData()
        formData.append('images', file)
        try {
            const result = await $fetch<{ urls: string[] }>('/api/upload-images-s3', {
                method: 'POST',
                body: formData
            })
            if (result.urls && result.urls.length > 0) {
                const url = result.urls[0]
                const state = side === 'left' ? left : right
                if (type === 'model') state.modelRef = url
                if (type === 'style') state.styleRef = url
                toast.add({ title: 'Success', description: 'Reference uploaded', color: 'green' })
            }
        } catch (error) {
            toast.add({ title: 'Error', description: 'Upload failed', color: 'red' })
        }
        target.value = ''
    }
}

// Use Left as Reference for Right
const copyRefFromLeft = () => {
    if (left.firstFrame) {
        right.styleRef = left.firstFrame // Use left start frame as style reference
        toast.add({ title: 'Copied', description: 'Left Start Frame set as Right Style Ref', color: 'green' })
    } else if (left.modelRef) {
        right.modelRef = left.modelRef
        toast.add({ title: 'Copied', description: 'Left Model Ref copied to Right', color: 'green' })
    }
}

// Generate Keyframes
const generateKeyframes = async (side: 'left' | 'right') => {
    const state = side === 'left' ? left : right
    state.generatingImages = true
    
    try {
        const commonBody = {
            aspectRatio: '9:16', // Vertical crops are better for split screen usually, but we crop 16:9 anyway. Let's use 16:9 source.
            model: 'google/nano-banana'
        }

        // Start Frame
        if (state.startPrompt) {
            const res = await $fetch('/api/generate-image', {
                method: 'POST',
                body: {
                    ...commonBody,
                    prompt: state.startPrompt + ", cinematic shot",
                    modelReference: state.modelRef,
                    styleReference: state.styleRef
                }
            })
            state.firstFrame = res.url
        }

        // End Frame
        if (state.endPrompt) {
            const res = await $fetch('/api/generate-image', {
                method: 'POST',
                body: {
                    ...commonBody,
                    prompt: state.endPrompt + ", cinematic shot",
                    modelReference: state.modelRef,
                    styleReference: state.styleRef || state.firstFrame // Continuity fallback
                }
            })
            state.lastFrame = res.url
        }
        toast.add({ title: 'Success', description: 'Keyframes generated', color: 'green' })
    } catch (error) {
        console.error(error)
        toast.add({ title: 'Error', description: 'Failed to generate images', color: 'red' })
    } finally {
        state.generatingImages = false
    }
}

// Generate Video
const generateVideo = async (side: 'left' | 'right') => {
    const state = side === 'left' ? left : right
    if (!state.firstFrame || !state.lastFrame) return
    
    state.generatingVideo = true
    try {
        const prompt = state.actionPrompt || `${state.startPrompt} transitioning to ${state.endPrompt}`
        
        const res = await $fetch('/api/generate-clip', {
            method: 'POST',
            body: {
                prompt,
                duration: 5,
                firstFrame: state.firstFrame,
                lastFrame: state.lastFrame,
                aspectRatio: '16:9',
                model: 'google/veo-3.1',
                modelReference: state.modelRef
            }
        })
        state.videoUrl = res.url
        toast.add({ title: 'Success', description: 'Video generated', color: 'green' })
    } catch (error: any) {
        console.error(error)
        toast.add({ title: 'Error', description: error.message || 'Failed to generate video', color: 'red' })
    } finally {
        state.generatingVideo = false
    }
}

// Stitch
const stitchVideos = async () => {
    if (!left.videoUrl || !right.videoUrl) return
    
    stitching.value = true
    try {
        const res = await $fetch<{ url: string }>('/api/generate-split-screen', {
            method: 'POST',
            body: {
                leftVideoUrl: left.videoUrl,
                rightVideoUrl: right.videoUrl
            }
        })
        stitchedVideoUrl.value = res.url
        toast.add({ title: 'Success', description: 'Split screen video created!', color: 'green' })
    } catch (error: any) {
        console.error(error)
        toast.add({ title: 'Error', description: error.message || 'Failed to stitch videos', color: 'red' })
    } finally {
        stitching.value = false
    }
}
</script>

<template>
  <div class="min-h-screen bg-black text-white p-8">
    <div class="max-w-4xl mx-auto space-y-8">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <NuxtLink to="/models/create" class="text-gray-400 hover:text-white transition-colors">
            <div class="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </div>
          </NuxtLink>
          <div>
            <h1 class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
              Create Scene
            </h1>
            <p class="text-gray-400 mt-2">Place {{ model?.name || 'your model' }} into a scene.</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Input Area -->
        <div class="space-y-6 bg-zinc-900/50 p-6 rounded-xl border border-white/10 h-fit">
          <!-- Model Reference -->
          <div class="flex items-start gap-4 p-4 bg-black/50 rounded-lg border border-white/5 relative group">
            <div class="w-20 h-20 rounded-lg overflow-hidden border border-white/10 bg-zinc-800 shrink-0 relative">
              <img v-if="model?.imageUrl" :src="model.imageUrl" class="w-full h-full object-cover" />
              <div v-else class="w-full h-full flex items-center justify-center text-gray-600">
                <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              
              <!-- Hover Upload Overlay -->
              <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer" @click="triggerUpload">
                <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <input type="file" ref="fileInput" class="hidden" accept="image/*" @change="handleFileUpload" />
            </div>
            
            <div class="flex-1 space-y-2">
              <div class="flex justify-between items-start">
                <p class="text-sm font-medium text-gray-200">Using Model: {{ model?.name || 'Custom Upload' }}</p>
                <button @click="triggerUpload" class="text-xs text-purple-400 hover:text-purple-300">Change Image</button>
              </div>
              <textarea 
                v-model="modelDescription" 
                rows="2"
                class="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-xs text-gray-400 focus:text-white focus:border-purple-500 focus:outline-none resize-none"
                placeholder="Describe the model (Required for consistent generation)..."
              ></textarea>
            </div>
          </div>

          <!-- Quick Presets -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-300">Quick Select Preset</label>
            <div class="flex gap-2 overflow-x-auto pb-2">
              <button 
                v-for="preset in PRESETS" 
                :key="preset.name"
                @click="selectPreset(preset)"
                class="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-colors whitespace-nowrap"
              >
                <img :src="preset.imageUrl" class="w-6 h-6 rounded-full object-cover" />
                <span class="text-xs text-gray-300">{{ preset.name }}</span>
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-300">Scene Description</label>
            <textarea 
              v-model="scenePrompt"
              rows="4"
              placeholder="e.g. holding a protein powder bag"
              class="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none"
            ></textarea>
            <p class="text-xs text-gray-500">Products will automatically be rendered as plain white placeholders.</p>
          </div>

          <button 
            @click="generateScene"
            :disabled="isGenerating || !scenePrompt"
            class="w-full py-3 rounded-lg font-medium text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            :class="isGenerating ? 'bg-zinc-700' : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90'"
          >
            <div v-if="isGenerating" class="flex items-center justify-center gap-2">
              <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              Generating Scene...
            </div>
            <span v-else>Generate Scene</span>
          </button>
        </div>

        <!-- Result Area -->
        <div class="space-y-6">
          <div class="aspect-[9/16] w-full bg-zinc-900/50 rounded-xl border border-white/10 flex items-center justify-center overflow-hidden relative group">
            <div v-if="!generatedSceneImage && !isGenerating" class="text-center p-8 text-gray-500">
              <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                <svg class="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p>Describe a scene to generate</p>
            </div>

            <div v-if="isGenerating" class="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10 backdrop-blur-sm">
              <div class="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4"></div>
              <p class="text-purple-400 font-medium animate-pulse">Rendering scene...</p>
            </div>

            <img 
              v-if="generatedSceneImage" 
              :src="generatedSceneImage" 
              alt="Generated Scene" 
              class="w-full h-full object-cover transition-opacity duration-500"
            />

            <!-- Action Overlay -->
            <div v-if="generatedSceneImage" class="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex gap-3">
              <a 
                :href="generatedSceneImage" 
                download="model-scene.jpg"
                target="_blank"
                class="flex-1 py-2 bg-white text-black rounded-lg font-medium text-center hover:bg-gray-200 transition-colors"
              >
                Download
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface ModelData {
  imageUrl: string
  name: string
  description: string
}

const isGenerating = ref(false)
const generatedSceneImage = ref<string | null>(null)
const scenePrompt = ref('')
const modelDescription = ref('')
const model = ref<ModelData | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const router = useRouter()

const PRESETS = [
  { name: 'Alex', imageUrl: '/avatars/alex/reference.jpg', description: 'Male model, athletic build, short hair, confident look.' },
  { name: 'Emma', imageUrl: '/avatars/emma/reference.jpg', description: 'Female model, blonde hair, professional look.' },
  { name: 'Jay', imageUrl: '/avatars/jay/reference.jpg', description: 'Male model, 28-34, short fade, trimmed beard, plain tee.' },
  { name: 'Mia', imageUrl: '/avatars/mia/reference.jpg', description: 'Female model, casual style, natural look.' },
  { name: 'Sophie', imageUrl: '/avatars/sophie/reference.jpg', description: 'Female model, elegant style, high fashion.' },
  { name: 'Jamie', imageUrl: '/avatars/jamie/reference.jpg', description: 'Female model, late 20s, sophisticated, jewelry focused.' },
  { name: 'James', imageUrl: '/avatars/james/preview.jpg', description: 'Male model, outdoorsy, pet friendly, casual.' },
]

onMounted(() => {
  const stored = sessionStorage.getItem('currentModel')
  if (stored) {
    try {
      model.value = JSON.parse(stored)
      if (model.value) {
        modelDescription.value = model.value.description
      }
    } catch (e) {
      console.error('Failed to parse model data')
    }
  } else {
    // Initialize empty model if none found
    model.value = {
      imageUrl: '',
      name: '',
      description: ''
    }
  }
})

function selectPreset(preset: any) {
  model.value = {
    imageUrl: preset.imageUrl,
    name: preset.name,
    description: preset.description
  }
  modelDescription.value = preset.description
}

function triggerUpload() {
  fileInput.value?.click()
}

async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) {
    const file = input.files[0]
    
    // Upload image
    const formData = new FormData()
    formData.append('image', file)
    
    try {
      const response = await $fetch<{ success: boolean, url: string }>('/api/upload-image', {
        method: 'POST',
        body: formData
      })
      
      if (response.success) {
        if (!model.value) {
          model.value = { imageUrl: '', name: 'Custom Upload', description: '' }
        }
        model.value.imageUrl = response.url
        model.value.name = 'Custom Upload'
      }
    } catch (error) {
      console.error('Failed to upload image:', error)
      alert('Failed to upload image')
    }
  }
}

async function generateScene() {
  if (!model.value?.imageUrl || !scenePrompt.value || !modelDescription.value) {
    alert('Please ensure you have a model image, a description, and a scene prompt.')
    return
  }

  isGenerating.value = true
  generatedSceneImage.value = null

  try {
    const data = await $fetch('/api/generate-model-scene', {
      method: 'POST',
      body: {
        modelImageUrl: model.value.imageUrl,
        modelDescription: modelDescription.value, // Use the editable description
        scenePrompt: scenePrompt.value
      }
    })

    if (data.success) {
      generatedSceneImage.value = data.imageUrl
    }
  } catch (error) {
    console.error('Failed to generate scene:', error)
    alert('Failed to generate scene. Please try again.')
  } finally {
    isGenerating.value = false
  }
}
</script>


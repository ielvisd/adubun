<template>
  <div class="min-h-screen bg-black text-white p-8">
    <div class="max-w-4xl mx-auto space-y-8">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
            Create New Model
          </h1>
          <p class="text-gray-400 mt-2">Define and generate a consistent AI character for your videos.</p>
        </div>
        <NuxtLink 
          to="/"
          class="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors"
        >
          Back to Home
        </NuxtLink>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Input Form -->
        <div class="space-y-6 bg-zinc-900/50 p-6 rounded-xl border border-white/10">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <label class="text-sm font-medium text-gray-300">Name</label>
              <input 
                v-model="form.name"
                type="text" 
                placeholder="e.g. Jay"
                class="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-gray-300">Age Range</label>
              <input 
                v-model="form.ageRange"
                type="text" 
                placeholder="e.g. 28-34"
                class="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-300">Gender</label>
            <select 
              v-model="form.gender"
              class="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none text-white"
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Non-binary">Non-binary</option>
            </select>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-300">Description</label>
            <textarea 
              v-model="form.description"
              rows="3"
              placeholder="Physical attributes: short fade, trimmed beard, confident smile..."
              class="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none"
            ></textarea>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-300">Look & Style</label>
            <textarea 
              v-model="form.lookStyle"
              rows="3"
              placeholder="Vibe and clothing: plain black tee, cool but approachable..."
              class="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none"
            ></textarea>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-300">Primary Categories</label>
            <input 
              v-model="form.categories"
              type="text" 
              placeholder="e.g. phone, fitness, tech"
              class="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
            />
          </div>

          <button 
            @click="generateModel"
            :disabled="isGenerating || !isValid"
            class="w-full py-3 rounded-lg font-medium text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            :class="isGenerating ? 'bg-zinc-700' : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90'"
          >
            <div v-if="isGenerating" class="flex items-center justify-center gap-2">
              <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              Generating Model...
            </div>
            <span v-else>Generate Model</span>
          </button>

          <!-- Fill Example Button -->
          <button 
            @click="fillExample"
            class="w-full py-2 rounded-lg font-medium text-sm text-gray-400 hover:text-white transition-colors border border-white/5 hover:bg-white/5"
          >
            Load Example (Jay)
          </button>
        </div>

        <!-- Preview Area -->
        <div class="space-y-6">
          <div class="aspect-[9/16] w-full bg-zinc-900/50 rounded-xl border border-white/10 flex items-center justify-center overflow-hidden relative group">
            <div v-if="!generatedImage && !isGenerating" class="text-center p-8 text-gray-500">
              <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                <svg class="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <p>Enter model details and click generate</p>
            </div>

            <div v-if="isGenerating" class="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10 backdrop-blur-sm">
              <div class="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4"></div>
              <p class="text-purple-400 font-medium animate-pulse">Creating persona...</p>
            </div>

            <img 
              v-if="generatedImage" 
              :src="generatedImage" 
              alt="Generated Model" 
              class="w-full h-full object-cover transition-opacity duration-500"
            />
          </div>

          <!-- Visible Actions -->
          <div v-if="generatedImage" class="grid grid-cols-2 gap-4">
            <a 
              :href="generatedImage" 
              download="model-reference.jpg"
              target="_blank"
              class="py-3 bg-zinc-800 text-white rounded-lg font-medium text-center hover:bg-zinc-700 transition-colors border border-white/10"
            >
              Download
            </a>
            <button 
              @click="goToSceneCreator"
              class="py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium text-center hover:opacity-90 transition-opacity shadow-lg shadow-purple-500/20"
            >
              Create Scene →
            </button>
          </div>

          <div v-if="generatedImage" class="bg-zinc-900/50 p-4 rounded-lg border border-white/10">
            <h3 class="text-sm font-medium text-gray-300 mb-2">Generated Prompt Used</h3>
            <p class="text-xs text-gray-500 font-mono break-words">{{ usedPrompt }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const router = useRouter()
const isGenerating = ref(false)
const generatedImage = ref<string | null>(null)
const usedPrompt = ref('')

const form = reactive({
  name: '',
  gender: 'Male',
  ageRange: '',
  description: '',
  lookStyle: '',
  categories: ''
})

const isValid = computed(() => {
  return form.name && form.ageRange && form.description.length > 10 && form.lookStyle
})

function fillExample() {
  form.name = 'Jay'
  form.gender = 'Male'
  form.ageRange = '28-34'
  form.description = 'a 28-34 year old male with short fade, trimmed beard, plain black or grey tee, confident half-smile, cool but approachable vibe'
  form.lookStyle = 'Short fade, trimmed beard, plain black or grey tee, confident half-smile'
  form.categories = 'phone, fitness'
}

async function generateModel() {
  if (!isValid.value) return

  isGenerating.value = true
  generatedImage.value = null
  usedPrompt.value = ''

  try {
    const data = await $fetch('/api/generate-model', {
      method: 'POST',
      body: form
    })

    if (data.success) {
      generatedImage.value = data.imageUrl
      usedPrompt.value = data.prompt
    }
  } catch (error) {
    console.error('Failed to generate model:', error)
    alert('Failed to generate model. Please try again.')
  } finally {
    isGenerating.value = false
  }
}

function goToSceneCreator() {
  if (!generatedImage.value) return
  
  // Store model data for next step
  sessionStorage.setItem('currentModel', JSON.stringify({
    imageUrl: generatedImage.value,
    name: form.name,
    description: form.description
  }))
  
  router.push('/models/scene')
}
</script>


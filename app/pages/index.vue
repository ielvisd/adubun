<template>
  <!-- Hero Section - Letsignit Style (Black Background) -->
  <div class="relative overflow-hidden bg-black text-white py-24 mb-0">
      <UContainer class="max-w-7xl relative z-10">
        <div class="text-center max-w-4xl mx-auto">
          <h1 class="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Transform Prompts into<br />Professional Ad Videos
          </h1>
          <p class="text-xl text-gray-300 mb-8 leading-relaxed">
            AI-powered video generation in minutes, not hours. Create stunning ad content with just a simple prompt.
          </p>
          <div class="flex flex-wrap justify-center gap-4">
            <UButton
              size="xl"
              color="secondary"
              variant="solid"
              class="bg-secondary-500 hover:bg-secondary-600 text-white font-semibold px-8 py-4 rounded-lg"
              @click="scrollToPrompt"
            >
              Get Started
            </UButton>
            <UButton
              size="xl"
              variant="outline"
              class="border-2 border-white text-white hover:bg-white hover:text-black font-semibold px-8 py-4 rounded-lg"
              @click="scrollToExamples"
            >
              View Examples
            </UButton>
          </div>
        </div>
      </UContainer>
    </div>

    <!-- Quick Start Section - White Background -->
    <div id="prompt-section" class="py-16 bg-white">
      <UContainer class="max-w-4xl">
        <h2 class="text-4xl font-bold text-center mb-4 text-black">Create Your Video</h2>
        <p class="text-center text-gray-600 mb-8 text-lg">Get started in seconds with our AI-powered video generator</p>
        <UCard 
          :ui="{
            base: 'overflow-hidden ring ring-default divide-y divide-default rounded-2xl shadow-xl p-8',
            background: 'bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50',
            ring: 'ring-0',
            divide: 'divide-y-0',
            border: 'border-2 border-purple-200',
          }"
          class="backdrop-blur-sm"
        >
          <UiPromptInput :loading="isLoading" @submit="handleSubmit" />
        </UCard>
      </UContainer>
    </div>

    <!-- Example Prompts Section - Light Yellow Background -->
    <div id="examples-section" class="py-16 bg-letsignit-section-yellow">
      <UContainer class="max-w-7xl">
        <h2 class="text-4xl font-bold text-center mb-4 text-black">Try These Examples</h2>
        <p class="text-center text-gray-700 mb-12 text-lg">Get inspired with these ready-to-use templates</p>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <UCard
            v-for="(example, index) in examplePrompts"
            :key="index"
            class="letsignit-card cursor-pointer bg-white"
            @click="useExample(example)"
          >
            <template #header>
              <div class="flex items-center gap-3">
                <div :style="getIconBgClass(index)" class="w-14 h-14 rounded-xl flex items-center justify-center">
                  <span class="text-3xl">{{ example.icon }}</span>
                </div>
                <h3 class="font-semibold text-xl text-black">{{ example.title }}</h3>
              </div>
            </template>
            <p class="text-gray-700 mb-6 leading-relaxed">
              {{ example.description }}
            </p>
            <div class="flex items-center justify-between pt-4 border-t border-gray-100">
              <span class="text-sm text-gray-600 font-medium">{{ example.duration }}s • {{ example.aspectRatio }}</span>
              <UButton
                size="sm"
                color="secondary"
                variant="solid"
                class="bg-secondary-500 hover:bg-secondary-600 text-white"
              >
                Use This
              </UButton>
            </div>
          </UCard>
        </div>
      </UContainer>
    </div>

    <!-- Feature Cards Section - Light Pink Background -->
    <div class="py-16 bg-letsignit-section-pink">
      <UContainer class="max-w-7xl">
        <h2 class="text-4xl font-bold text-center mb-4 text-black">Why Choose AdUbun?</h2>
        <p class="text-center text-gray-700 mb-12 text-lg">Everything you need to create professional videos at scale</p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <UCard class="letsignit-card text-center bg-white">
            <template #header>
              <div class="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center" style="background-color: #A8DADC;">
                <span class="text-4xl">⚡</span>
              </div>
              <h3 class="font-semibold text-2xl text-black mb-3">Fast Generation</h3>
            </template>
            <p class="text-gray-700 leading-relaxed">
              Generate professional ad videos in under 10 minutes with our AI-powered pipeline
            </p>
          </UCard>

          <UCard class="letsignit-card text-center bg-white">
            <template #header>
              <div class="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center" style="background-color: #FFF9E6;">
                <span class="text-4xl">💰</span>
              </div>
              <h3 class="font-semibold text-2xl text-black mb-3">Cost Effective</h3>
            </template>
            <p class="text-gray-700 leading-relaxed">
              Less than $2 per minute of video content. No hidden fees, transparent pricing
            </p>
          </UCard>

          <UCard class="letsignit-card text-center bg-white">
            <template #header>
              <div class="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center" style="background-color: #E0F7FA;">
                <span class="text-4xl">🤖</span>
              </div>
              <h3 class="font-semibold text-2xl text-black mb-3">AI-Powered</h3>
            </template>
            <p class="text-gray-700 leading-relaxed">
              Leveraging cutting-edge AI models including GPT-4, Replicate, and ElevenLabs
            </p>
          </UCard>
        </div>
      </UContainer>
    </div>

    <!-- Stats Section - Light Blue Background -->
    <div class="py-16 bg-letsignit-section-blue">
      <UContainer class="max-w-7xl">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
          <div>
            <div class="text-5xl font-bold text-black mb-3">10min</div>
            <div class="text-gray-700 text-lg">Average Generation Time</div>
          </div>
          <div>
            <div class="text-5xl font-bold text-black mb-3">$2/min</div>
            <div class="text-gray-700 text-lg">Cost Per Minute</div>
          </div>
          <div>
            <div class="text-5xl font-bold text-black mb-3">100%</div>
            <div class="text-gray-700 text-lg">AI Generated</div>
          </div>
        </div>
      </UContainer>
    </div>
</template>

<script setup lang="ts">
const toast = useToast()

const examplePrompts = [
  {
    title: 'Luxury Watch Ad',
    description: 'Create a 30s Instagram ad for luxury watches with elegant gold aesthetics, slow-motion close-ups, and sophisticated background music',
    prompt: 'Create a 30s Instagram ad for luxury watches with elegant gold aesthetics, slow-motion close-ups, and sophisticated background music',
    duration: 30,
    aspectRatio: '9:16',
    style: 'Elegant',
    icon: '⌚',
  },
  {
    title: 'Fitness Product Launch',
    description: 'Generate a high-energy 60s YouTube ad showcasing a new fitness product with dynamic workout scenes and motivational voiceover',
    prompt: 'Generate a high-energy 60s YouTube ad showcasing a new fitness product with dynamic workout scenes and motivational voiceover',
    duration: 60,
    aspectRatio: '16:9',
    style: 'Energetic',
    icon: '💪',
  },
  {
    title: 'Coffee Brand Story',
    description: 'Produce a cinematic 45s ad telling the story of artisanal coffee, from bean to cup, with warm lighting and ambient sounds',
    prompt: 'Produce a cinematic 45s ad telling the story of artisanal coffee, from bean to cup, with warm lighting and ambient sounds',
    duration: 45,
    aspectRatio: '16:9',
    style: 'Cinematic',
    icon: '☕',
  },
  {
    title: 'Tech Product Demo',
    description: 'Create a clean, minimal 30s ad demonstrating a new smartphone with smooth transitions and modern tech aesthetics',
    prompt: 'Create a clean, minimal 30s ad demonstrating a new smartphone with smooth transitions and modern tech aesthetics',
    duration: 30,
    aspectRatio: '1:1',
    style: 'Minimal',
    icon: '📱',
  },
  {
    title: 'Fashion Brand Campaign',
    description: 'Design a stylish 45s fashion ad featuring seasonal clothing with elegant models, beautiful locations, and trendy music',
    prompt: 'Design a stylish 45s fashion ad featuring seasonal clothing with elegant models, beautiful locations, and trendy music',
    duration: 45,
    aspectRatio: '9:16',
    style: 'Elegant',
    icon: '👗',
  },
  {
    title: 'Food Delivery Service',
    description: 'Make a vibrant 30s ad for a food delivery app showing delicious meals, happy customers, and quick delivery promise',
    prompt: 'Make a vibrant 30s ad for a food delivery app showing delicious meals, happy customers, and quick delivery promise',
    duration: 30,
    aspectRatio: '16:9',
    style: 'Energetic',
    icon: '🍔',
  },
]

const getIconBgClass = (index: number) => {
  const colors = [
    { backgroundColor: '#A8DADC' },
    { backgroundColor: '#FFE5E5' },
    { backgroundColor: '#F0E6FF' },
    { backgroundColor: '#E0F7FA' },
    { backgroundColor: '#FFF9E6' },
    { backgroundColor: '#A8DADC' },
  ]
  return colors[index % colors.length]
}

const scrollToPrompt = () => {
  if (process.client && typeof document !== 'undefined') {
    const promptSection = document.getElementById('prompt-section')
    if (promptSection) {
      promptSection.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
}

const scrollToExamples = () => {
  if (process.client && typeof document !== 'undefined') {
    const examplesSection = document.getElementById('examples-section')
    if (examplesSection) {
      examplesSection.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
}

const useExample = (example: typeof examplePrompts[0]) => {
  if (process.client) {
    scrollToPrompt()
    setTimeout(() => {
      handleSubmit({
        prompt: example.prompt,
        duration: example.duration,
        aspectRatio: example.aspectRatio as '16:9' | '9:16' | '1:1',
        style: example.style,
      })
    }, 500)
  }
}

const isLoading = ref(false)

const handleSubmit = async (formData: any) => {
  isLoading.value = true
  try {
    // Handle image uploads - create FormData if images are files
    let body: any = formData
    const formDataToSend = new FormData()
    
    // Check if we have File objects that need to be uploaded
    // Veo 3.1 fields
    if (formData.image instanceof File) {
      formDataToSend.append('image', formData.image)
    } else if (formData.image) {
      formDataToSend.append('image', formData.image)
    }
    
    if (formData.lastFrame instanceof File) {
      formDataToSend.append('lastFrame', formData.lastFrame)
    } else if (formData.lastFrame) {
      formDataToSend.append('lastFrame', formData.lastFrame)
    }
    
    if (formData.referenceImages && Array.isArray(formData.referenceImages)) {
      formData.referenceImages.forEach((img: File | string, index: number) => {
        if (img instanceof File) {
          formDataToSend.append(`referenceImages`, img)
        } else if (img) {
          formDataToSend.append(`referenceImages`, img)
        }
      })
    }
    
    // Legacy fields for other models
    if (formData.firstFrameImage instanceof File) {
      formDataToSend.append('firstFrameImage', formData.firstFrameImage)
    } else if (formData.firstFrameImage) {
      formDataToSend.append('firstFrameImage', formData.firstFrameImage)
    }
    
    if (formData.subjectReference instanceof File) {
      formDataToSend.append('subjectReference', formData.subjectReference)
    } else if (formData.subjectReference) {
      formDataToSend.append('subjectReference', formData.subjectReference)
    }
    
    if (formData.inputImage instanceof File) {
      formDataToSend.append('inputImage', formData.inputImage)
    } else if (formData.inputImage) {
      formDataToSend.append('inputImage', formData.inputImage)
    }
    
    // Product images (NEW)
    if (formData.productImages && Array.isArray(formData.productImages)) {
      for (const productImage of formData.productImages) {
        if (productImage instanceof File) {
          formDataToSend.append('productImages', productImage)
        } else if (typeof productImage === 'string') {
          formDataToSend.append('productImages', productImage)
        }
      }
    }
    
    // Add other fields
    formDataToSend.append('prompt', formData.prompt)
    if (formData.model) {
      formDataToSend.append('model', formData.model)
    }
    if (formData.duration) {
      formDataToSend.append('duration', formData.duration.toString())
    }
    formDataToSend.append('aspectRatio', formData.aspectRatio)
    formDataToSend.append('style', formData.style)
    if (formData.mode) {
      formDataToSend.append('mode', formData.mode)
    }
    
    // Veo 3.1 additional fields
    if (formData.negativePrompt) {
      formDataToSend.append('negativePrompt', formData.negativePrompt)
    }
    if (formData.resolution) {
      formDataToSend.append('resolution', formData.resolution)
    }
    if (formData.generateAudio !== undefined) {
      formDataToSend.append('generateAudio', formData.generateAudio.toString())
    }
    if (formData.seed !== null && formData.seed !== undefined) {
      formDataToSend.append('seed', formData.seed.toString())
    }
    
    // Use FormData if we have file uploads, otherwise use JSON
    const hasFiles = formData.image instanceof File || formData.lastFrame instanceof File || 
      (formData.referenceImages && formData.referenceImages.some((img: any) => img instanceof File)) ||
      formData.firstFrameImage instanceof File || formData.subjectReference instanceof File || formData.inputImage instanceof File ||
      (formData.productImages && formData.productImages.some((img: any) => img instanceof File))
    
    const parsed = await $fetch('/api/parse-prompt', {
      method: 'POST',
      body: hasFiles ? formDataToSend : formData,
    })

    // Navigate immediately after parse-prompt response to show loading on generate page
    // Store parsed data in sessionStorage for generate page
    if (process.client) {
      sessionStorage.setItem('parsedPrompt', JSON.stringify(parsed))
    }

    await navigateTo('/generate')
  } catch (error: any) {
    const errorMessage = error.data?.message || error.data?.originalError || error.message || 'Failed to start generation'
    toast.add({
      title: 'Error',
      description: errorMessage,
      color: 'error',
    })
    isLoading.value = false
  }
}
</script>

<template>
  <div>
    <!-- Hero Section - Mendo Split-Screen Style -->
    <div class="relative overflow-hidden bg-white dark:bg-gray-900 mb-0">
      <div class="lg:min-h-[70vh]">
        <!-- Left Side - White Background with Typography -->
        <div class="flex flex-col justify-center px-6 sm:px-8 md:px-12 lg:px-16 xl:px-20 py-12 sm:py-16 md:py-20 lg:py-28 bg-white dark:bg-gray-900">
          <div class="max-w-2xl">
            <h1 class="text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-bold mb-6 sm:mb-8 md:mb-10 leading-tight tracking-tight text-black dark:text-white">
              Transform Prompts into<br class="hidden sm:block" /> Professional Ad Videos
            </h1>
            <p class="text-lg sm:text-xl md:text-2xl lg:text-3xl text-gray-600 dark:text-gray-300 mb-8 sm:mb-10 md:mb-12 leading-relaxed font-light max-w-xl">
              AI-powered video generation in minutes, not hours. Create stunning ad content with just a simple prompt.
            </p>
            <UButton
              size="xl"
              variant="solid"
              class="bg-black hover:bg-gray-900 text-white font-semibold px-8 sm:px-10 md:px-12 py-4 sm:py-5 md:py-6 rounded-none min-h-[48px] text-lg sm:text-xl md:text-2xl transition-all duration-300"
              @click="scrollToPrompt"
            >
              Get Started →
            </UButton>
            <button
              @click="scrollToExamples"
              class="mt-6 text-black dark:text-white hover:text-gray-700 dark:hover:text-gray-300 text-sm sm:text-base font-medium transition-colors duration-200 underline underline-offset-4"
            >
              View Examples
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Start Section - Mendo Minimalist Style -->
    <div id="prompt-section" class="pt-6 sm:pt-8 md:pt-10 lg:pt-12 pb-12 sm:pb-16 md:pb-20 lg:pb-24 bg-light-grey-500 dark:bg-gray-900">
      <UContainer class="max-w-4xl px-4 sm:px-6">
        <h2 class="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-center mb-3 sm:mb-4 md:mb-6 text-black dark:text-white">Create Your Video</h2>
        <p class="text-center text-gray-600 dark:text-gray-400 mb-8 sm:mb-10 md:mb-12 text-base sm:text-lg md:text-xl px-2">Get started in seconds with our AI-powered video generator</p>
        <div class="overflow-hidden rounded-none shadow-sm p-6 sm:p-8 md:p-10 lg:p-12 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <UiPromptInput :loading="isLoading" @submit="handleSubmit" />
        </div>
      </UContainer>
    </div>

    <!-- Example Prompts Section - Mendo Minimalist Style -->
    <div id="examples-section" class="py-12 sm:py-16 md:py-20 lg:py-24 bg-white dark:bg-gray-900">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <h2 class="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-center mb-3 sm:mb-4 md:mb-6 text-black dark:text-white">Try These Examples</h2>
        <p class="text-center text-gray-600 dark:text-gray-400 mb-10 sm:mb-12 md:mb-16 text-base sm:text-lg md:text-xl px-2">Get inspired with these ready-to-use templates</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8" ref="examplesGrid" v-auto-animate>
          <UCard
            v-for="(example, index) in examplePrompts"
            :key="index"
            class="cursor-pointer bg-white dark:bg-gray-800 hover:shadow-lg hover:border-black transition-all duration-300 min-h-[44px] border border-gray-200 dark:border-gray-700 rounded-none"
            @click="useExample(example)"
            role="button"
            tabindex="0"
            @keydown.enter="useExample(example)"
            @keydown.space.prevent="useExample(example)"
          >
            <template #header>
              <div class="flex items-center gap-3 sm:gap-4">
                <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-none bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                  <span class="text-2xl sm:text-3xl">{{ example.icon }}</span>
                </div>
                <h3 class="font-bold text-lg sm:text-xl md:text-2xl text-black dark:text-white">{{ example.title }}</h3>
              </div>
            </template>
            <p class="text-gray-600 dark:text-gray-300 mb-4 sm:mb-6 leading-relaxed text-sm sm:text-base">
              {{ example.description }}
            </p>
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 pt-4 sm:pt-5 border-t border-gray-200 dark:border-gray-700">
              <span class="text-sm sm:text-base text-gray-500 dark:text-gray-400 font-medium">{{ example.duration }}s • {{ example.aspectRatio }}</span>
              <UButton
                size="sm"
                variant="solid"
                class="bg-black hover:bg-gray-900 text-white w-full sm:w-auto rounded-none"
              >
                Use This
              </UButton>
            </div>
          </UCard>
        </div>
      </UContainer>
    </div>

    <!-- Feature Cards Section - Mendo Minimalist Style -->
    <div class="py-12 sm:py-16 md:py-20 lg:py-24 bg-light-grey-500 dark:bg-gray-900" ref="featuresSection">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <h2 class="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-center mb-3 sm:mb-4 md:mb-6 text-black dark:text-white">Why Choose AdUbun?</h2>
        <p class="text-center text-gray-600 dark:text-gray-400 mb-10 sm:mb-12 md:mb-16 text-base sm:text-lg md:text-xl px-2">Everything you need to create professional videos at scale</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8 md:gap-10" ref="featuresGrid" v-auto-animate>
          <UCard class="text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-none shadow-sm hover:shadow-lg transition-all duration-300">
            <template #header>
              <div class="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 mx-auto mb-4 sm:mb-6 rounded-none flex items-center justify-center bg-gray-100 dark:bg-gray-700">
                <span class="text-3xl sm:text-4xl md:text-5xl">⚡</span>
              </div>
              <h3 class="font-bold text-xl sm:text-2xl md:text-3xl text-black dark:text-white mb-3 sm:mb-4">Fast Generation</h3>
            </template>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed text-base sm:text-lg">
              Generate professional ad videos in under 10 minutes with our AI-powered pipeline
            </p>
          </UCard>

          <UCard class="text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-none shadow-sm hover:shadow-lg transition-all duration-300">
            <template #header>
              <div class="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 mx-auto mb-4 sm:mb-6 rounded-none flex items-center justify-center bg-gray-100 dark:bg-gray-700">
                <span class="text-3xl sm:text-4xl md:text-5xl">💰</span>
              </div>
              <h3 class="font-bold text-xl sm:text-2xl md:text-3xl text-black dark:text-white mb-3 sm:mb-4">Cost Effective</h3>
            </template>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed text-base sm:text-lg">
              Less than $2 per minute of video content. No hidden fees, transparent pricing
            </p>
          </UCard>

          <UCard class="text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-none shadow-sm hover:shadow-lg transition-all duration-300">
            <template #header>
              <div class="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 mx-auto mb-4 sm:mb-6 rounded-none flex items-center justify-center bg-gray-100 dark:bg-gray-700">
                <span class="text-3xl sm:text-4xl md:text-5xl">🤖</span>
              </div>
              <h3 class="font-bold text-xl sm:text-2xl md:text-3xl text-black dark:text-white mb-3 sm:mb-4">AI-Powered</h3>
            </template>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed text-base sm:text-lg">
              Leveraging cutting-edge AI models including GPT-4, Replicate, and ElevenLabs
            </p>
          </UCard>
        </div>
      </UContainer>
    </div>

    <!-- Stats Section - Mendo Minimalist Style -->
    <div class="py-12 sm:py-16 md:py-20 lg:py-24 bg-white dark:bg-gray-900" ref="statsSection">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-10 md:gap-12 lg:gap-16 text-center">
          <div>
            <div class="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-black dark:text-white mb-2 sm:mb-3 md:mb-4" ref="stat1">10min</div>
            <div class="text-gray-600 dark:text-gray-400 text-base sm:text-lg md:text-xl">Average Generation Time</div>
          </div>
          <div>
            <div class="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-black dark:text-white mb-2 sm:mb-3 md:mb-4" ref="stat2">$2/min</div>
            <div class="text-gray-600 dark:text-gray-400 text-base sm:text-lg md:text-xl">Cost Per Minute</div>
          </div>
          <div>
            <div class="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-black dark:text-white mb-2 sm:mb-3 md:mb-4" ref="stat3">100%</div>
            <div class="text-gray-600 dark:text-gray-400 text-base sm:text-lg md:text-xl">AI Generated</div>
          </div>
        </div>
      </UContainer>
    </div>
  </div>
</template>

<script setup lang="ts">
const { user, loading: authLoading } = useAuth()
const router = useRouter()
const toast = useToast()

// Check authentication - but don't redirect in dev mode (demo login is allowed)
onMounted(() => {
  if (!authLoading.value && !user.value && !process.dev) {
    // Redirect to login if not authenticated (only in production)
    router.push('/auth/login')
  }
})

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
  // Mendo minimalist - all icons use gray background
  return { backgroundColor: '#F5F5F5' }
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
        productImages: [],
        aspectRatio: example.aspectRatio as '16:9' | '9:16' | '1:1',
        model: 'google/veo-3-fast', // Default model
        generateVoiceover: false,
      })
    }, 500)
  }
}

const isLoading = ref(false)

const handleSubmit = async (formData: any) => {
  console.log('[Index] handleSubmit called with:', formData)
  
  // Check authentication - in dev mode, allow demo login
  if (!user.value && !process.dev) {
    toast.add({
      title: 'Authentication Required',
      description: 'Please sign in to create an ad',
      color: 'warning',
    })
    await router.push('/auth/login')
    return
  }

  // In dev mode, if no user, use demo login
  if (!user.value && process.dev) {
    console.log('[Index] No user in dev mode, using demo login')
    const { demoLogin } = useAuth()
    try {
      await demoLogin()
    } catch (err) {
      console.warn('[Index] Demo login failed:', err)
    }
  }

  isLoading.value = true
  try {
    // Upload product images if they are Files
    let uploadedImageUrls: string[] = []
    
    if (formData.productImages && Array.isArray(formData.productImages)) {
      const filesToUpload = formData.productImages.filter((img: any) => img instanceof File)
      const existingUrls = formData.productImages.filter((img: any) => typeof img === 'string')
      
      if (filesToUpload.length > 0) {
        // Upload files to S3
        const formDataToSend = new FormData()
        filesToUpload.forEach((file: File) => {
          formDataToSend.append('images', file)
        })
        
        const uploadResult = await $fetch<{ urls: string[]; count: number }>('/api/upload-images-s3', {
          method: 'POST',
          body: formDataToSend,
        })
        
        uploadedImageUrls = [...existingUrls, ...(uploadResult.urls || [])]
      } else {
        uploadedImageUrls = existingUrls
      }
    }

    // Store form data in sessionStorage with uploaded URLs
    if (process.client) {
      sessionStorage.setItem('promptData', JSON.stringify({
        prompt: formData.prompt,
        productImages: uploadedImageUrls,
        aspectRatio: formData.aspectRatio,
        model: formData.model,
        generateVoiceover: formData.generateVoiceover || false,
      }))
    }

    // Navigate to stories page
    await navigateTo('/stories')
  } catch (error: any) {
    const errorMessage = error.data?.message || error.message || 'Failed to upload images'
    toast.add({
      title: 'Error',
      description: errorMessage,
      color: 'error',
    })
    isLoading.value = false
  }
}
</script>

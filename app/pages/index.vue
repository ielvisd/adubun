<template>
  <div class="overflow-x-hidden">
    <!-- Hero Section - Modern Professional Design -->
    <div class="relative overflow-hidden bg-gradient-to-br from-white via-gray-50 to-gray-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <!-- Decorative Background Elements -->
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <div class="absolute -top-40 -right-40 w-80 h-80 bg-brand-cream-200/30 dark:bg-brand-cream-300/10 rounded-full blur-3xl"></div>
        <div class="absolute top-60 -left-40 w-96 h-96 bg-brand-cream-300/20 dark:bg-brand-cream-400/10 rounded-full blur-3xl"></div>
      </div>
      
      <UContainer class="relative max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center min-h-[70vh] py-12 sm:py-14 md:py-16">
          <!-- Left Side - Content -->
          <div class="space-y-5 sm:space-y-6 z-10">
            <!-- Badge -->
            <div class="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-primary-900/30 border border-gray-200 dark:border-primary-800 rounded-full text-sm font-medium text-gray-800 dark:text-primary-300">
              <UIcon name="i-heroicons-sparkles" class="w-4 h-4" />
              <span>AI-Powered Video Generation</span>
            </div>
            
            <!-- Main Headline -->
            <h1 class="text-4xl sm:text-5xl md:text-6xl lg:text-6xl font-bold leading-tight tracking-tight text-gray-900 dark:text-white">
              Transform
              <span class="block text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400">
                Prompts
              </span>
              into Professional Ad Videos
            </h1>
            
            <!-- Subheadline -->
            <p class="text-lg sm:text-xl md:text-xl text-gray-600 dark:text-gray-300 leading-relaxed max-w-2xl">
              Create stunning, professional ad content in minutes with our AI-powered video generation platform. No editing skills required.
            </p>
            
            <!-- CTA Buttons -->
            <div class="flex flex-col sm:flex-row gap-4 pt-2">
              <UButton
                size="xl"
                variant="solid"
                class="bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 font-semibold px-8 py-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 text-base sm:text-lg"
                @click="scrollToPrompt"
              >
                Get Started Free
                <UIcon name="i-heroicons-arrow-right" class="ml-2 w-5 h-5" />
              </UButton>
              <UButton
                size="xl"
                variant="outline"
                class="border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-semibold px-8 py-6 rounded-lg transition-all duration-300 text-base sm:text-lg"
                @click="scrollToExamples"
              >
                View Examples
              </UButton>
            </div>
            
            <!-- Trust Indicators -->
            <div class="flex flex-wrap items-center gap-6 pt-4 text-sm text-gray-500 dark:text-gray-400">
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500" />
                <span>No credit card required</span>
              </div>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-clock" class="w-5 h-5 text-blue-500" />
                <span>Fully Automated</span>
              </div>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-shield-check" class="w-5 h-5 text-purple-500" />
                <span>Professional quality</span>
              </div>
            </div>
          </div>
          
          <!-- Right Side - Visual Showcase -->
          <div class="relative lg:block hidden">
            <div class="relative">
              <!-- Main Showcase Card -->
              <div class="relative bg-brand-cream-200 dark:bg-brand-cream-300 rounded-2xl shadow-2xl p-5 border border-brand-cream-300 dark:border-brand-cream-400">
                <div class="aspect-video bg-gradient-to-br from-brand-cream-300 to-brand-cream-400 dark:from-brand-cream-400 dark:to-brand-cream-500 rounded-lg flex items-center justify-center overflow-hidden p-6">
                  <img src="/favicon.svg" alt="AdUbun" class="w-full h-full object-contain" />
                </div>
                <!-- Floating Stats Cards -->
                <div class="absolute -bottom-3 -left-3 bg-brand-cream-200 dark:bg-brand-cream-300 rounded-xl shadow-lg p-3 border border-brand-cream-300 dark:border-brand-cream-400">
                  <div class="flex items-center gap-2">
                    <div class="w-9 h-9 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                      <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p class="text-xs text-gray-500 dark:text-gray-700">Status</p>
                      <p class="text-sm font-semibold text-gray-900 dark:text-gray-900">Completed</p>
                    </div>
                  </div>
                </div>
                <div class="absolute -top-3 -right-3 bg-brand-cream-200 dark:bg-brand-cream-300 rounded-xl shadow-lg p-3 border border-brand-cream-300 dark:border-brand-cream-400">
                  <div class="text-center">
                    <p class="text-xl font-bold text-gray-900 dark:text-gray-900">AI-Powered</p>
                    <p class="text-xs text-gray-500 dark:text-gray-700">Technology</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </UContainer>
    </div>

    <!-- Quick Start Section - Modern Card Design -->
    <div id="prompt-section" class="py-12 sm:py-16 md:py-20 bg-white dark:bg-gray-900">
      <UContainer class="max-w-4xl px-4 sm:px-6">
        <div class="text-center mb-8 sm:mb-12">
          <h2 class="text-3xl sm:text-4xl md:text-5xl lg:text-5xl font-bold mb-3 sm:mb-4 text-gray-900 dark:text-white">
            Create Your Video
          </h2>
          <p class="text-lg sm:text-xl md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-6">
            Just describe your product. We'll handle the rest.
          </p>
          
          <!-- Trust Indicators -->
          <div class="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-sm">
            <div class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <div class="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <UIcon name="i-heroicons-check" class="w-3 h-3 text-green-600 dark:text-green-400" />
              </div>
              <span>No video editing needed</span>
            </div>
            <div class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <div class="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <UIcon name="i-heroicons-clock" class="w-3 h-3 text-blue-600 dark:text-blue-400" />
              </div>
              <span>Ready in ~3 minutes</span>
            </div>
            <div class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <div class="w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <UIcon name="i-heroicons-sparkles" class="w-3 h-3 text-purple-600 dark:text-purple-400" />
              </div>
              <span>Professional quality</span>
            </div>
          </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 sm:p-8 md:p-10">
          <UiPromptInput :loading="isLoading" @submit="handleSubmit" />
        </div>
      </UContainer>
    </div>

    <!-- Example Prompts Section - Modern Grid Design -->
    <div id="examples-section" class="py-12 sm:py-16 md:py-20 bg-brand-cream-50 dark:bg-brand-cream-100/30">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <div class="text-center mb-8 sm:mb-12">
          <h2 class="text-3xl sm:text-4xl md:text-5xl lg:text-5xl font-bold mb-3 sm:mb-4 text-gray-900 dark:text-white">
            Try These Examples
          </h2>
          <p class="text-lg sm:text-xl md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Get inspired with these ready-to-use templates. Click any example to get started instantly.
          </p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6" ref="examplesGrid" v-auto-animate>
          <UCard
            v-for="(example, index) in examplePrompts"
            :key="index"
            class="cursor-pointer bg-white dark:bg-gray-800 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden group"
            @click="useExample(example)"
            role="button"
            tabindex="0"
            @keydown.enter="useExample(example)"
            @keydown.space.prevent="useExample(example)"
          >
            <template #header>
              <div class="flex items-start gap-3">
                <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                  <span class="text-2xl sm:text-3xl">{{ example.icon }}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <h3 class="font-bold text-base sm:text-lg text-gray-900 dark:text-white mb-1">{{ example.title }}</h3>
                  <div class="flex items-center gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    <span>{{ example.duration }}s</span>
                    <span>•</span>
                    <span>{{ example.aspectRatio }}</span>
                    <span>•</span>
                    <span>{{ example.style }}</span>
                  </div>
                </div>
              </div>
            </template>
            <p class="text-gray-600 dark:text-gray-300 mb-4 leading-relaxed text-sm sm:text-base">
              {{ example.description }}
            </p>
            <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
              <UButton
                size="sm"
                variant="solid"
                class="w-full bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 font-semibold rounded-lg transition-all duration-300"
              >
                Use This Template
                <UIcon name="i-heroicons-arrow-right" class="ml-2 w-4 h-4" />
              </UButton>
            </div>
          </UCard>
        </div>
      </UContainer>
    </div>

    <!-- Feature Cards Section - Modern Design -->
    <div class="py-12 sm:py-16 md:py-20 bg-brand-cream-50 dark:bg-brand-cream-100/20" ref="featuresSection">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <div class="text-center mb-8 sm:mb-12">
          <h2 class="text-3xl sm:text-4xl md:text-5xl lg:text-5xl font-bold mb-3 sm:mb-4 text-gray-900 dark:text-white">
            Why Choose AdUbun?
          </h2>
          <p class="text-lg sm:text-xl md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Everything you need to create professional videos at scale, powered by cutting-edge AI
          </p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6" ref="featuresGrid" v-auto-animate>
          <UCard class="text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] p-5 sm:p-6">
            <template #header>
              <div class="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-yellow-100 to-yellow-200 dark:from-yellow-900/30 dark:to-yellow-800/30 flex items-center justify-center">
                <span class="text-3xl sm:text-4xl">⚡</span>
              </div>
              <h3 class="font-bold text-lg sm:text-xl text-gray-900 dark:text-white mb-2">Fast Generation</h3>
            </template>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed text-sm sm:text-base">
              Generate professional ad videos with fully automated AI-powered pipeline
            </p>
          </UCard>

          <UCard class="text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] p-5 sm:p-6">
            <template #header>
              <div class="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900/30 dark:to-green-800/30 flex items-center justify-center">
                <span class="text-3xl sm:text-4xl">💰</span>
              </div>
              <h3 class="font-bold text-lg sm:text-xl text-gray-900 dark:text-white mb-2">Cost Effective</h3>
            </template>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed text-sm sm:text-base">
              Less than $2 per minute of video content. No hidden fees, transparent pricing
            </p>
          </UCard>

          <UCard class="text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] p-5 sm:p-6">
            <template #header>
              <div class="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/30 flex items-center justify-center">
                <span class="text-3xl sm:text-4xl">🤖</span>
              </div>
              <h3 class="font-bold text-lg sm:text-xl text-gray-900 dark:text-white mb-2">AI-Powered</h3>
            </template>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed text-sm sm:text-base">
              Leveraging cutting-edge AI models including GPT-4, Replicate, and ElevenLabs
            </p>
          </UCard>
        </div>
      </UContainer>
    </div>

    <!-- Stats Section - Modern Design -->
    <div class="py-12 sm:py-16 md:py-20 bg-gradient-to-br from-brand-cream-50 to-brand-cream-100 dark:from-brand-cream-100/30 dark:to-brand-cream-200/20" ref="statsSection">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
          <div class="text-center p-5 sm:p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700">
            <div class="text-4xl sm:text-5xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 mb-2 sm:mb-3" ref="stat1">
              AI-Powered
            </div>
            <div class="text-gray-600 dark:text-gray-400 text-sm sm:text-base font-medium">Fully Automated</div>
          </div>
          <div class="text-center p-5 sm:p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700">
            <div class="text-4xl sm:text-5xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400 mb-2 sm:mb-3" ref="stat2">
              $2/min
            </div>
            <div class="text-gray-600 dark:text-gray-400 text-sm sm:text-base font-medium">Cost Per Minute</div>
          </div>
          <div class="text-center p-5 sm:p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700">
            <div class="text-4xl sm:text-5xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 mb-2 sm:mb-3" ref="stat3">
              100%
            </div>
            <div class="text-gray-600 dark:text-gray-400 text-sm sm:text-base font-medium">AI Generated</div>
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
// Use onMounted to ensure this only runs on client side to avoid hydration issues
onMounted(() => {
  if (process.client) {
    const isDev = process.dev
    if (!authLoading.value && !user.value && !isDev) {
      // Redirect to login if not authenticated (only in production)
      router.push('/auth/login')
    }
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
    aspectRatio: '16:9',
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
        aspectRatio: example.aspectRatio as '16:9' | '9:16',
        model: 'google/veo-3.1', // Default model
        generateVoiceover: false,
      })
    }, 500)
  }
}

const isLoading = ref(false)

const handleSubmit = async (formData: any) => {
  console.log('[Index] handleSubmit called with:', formData)
  
  // Check authentication - in dev mode, allow demo login
  // Only check process.dev on client side to avoid hydration issues
  const isDev = process.client ? process.dev : false
  if (!user.value && !isDev) {
    toast.add({
      title: 'Authentication Required',
      description: 'Please sign in to create an ad',
      color: 'warning',
    })
    await router.push('/auth/login')
    return
  }

  // In dev mode, if no user, use demo login
  if (!user.value && isDev) {
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
        mood: formData.mood,
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


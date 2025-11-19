<template>
  <div class="overflow-x-hidden bg-mendo-white dark:bg-mendo-black text-mendo-black dark:text-mendo-white">
    <!-- Hero Section - Split Layout -->
    <div class="relative overflow-hidden bg-mendo-white dark:bg-mendo-black transition-colors duration-300">
      <UContainer class="relative max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="flex flex-col lg:grid lg:grid-cols-2 gap-8 lg:gap-16 py-12 md:py-20 items-start lg:items-center min-h-[80vh]">
          <!-- Left Side - Content -->
          <div class="flex flex-col space-y-6 z-10 order-1 w-full">
            <!-- Main Headline -->
            <h1 class="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight tracking-tight text-mendo-black dark:text-mendo-white">
              <span class="block">Transform Prompts</span>
              <span class="block">into Professional Ads</span>
            </h1>
            
            <!-- Subheadline -->
            <p class="text-xl sm:text-2xl text-gray-600 dark:text-gray-300 leading-relaxed max-w-lg">
              Create stunning, high-converting video content in minutes with our AI-powered platform. No editing skills required.
            </p>
            
            <!-- CTA Buttons -->
            <div class="flex flex-col sm:flex-row gap-4 pt-4">
              <UButton
                size="xl"
                variant="solid"
                class="bg-mendo-black text-mendo-white hover:bg-gray-800 dark:bg-mendo-cream dark:text-mendo-black dark:hover:bg-[#d9b592] font-semibold px-8 py-4 rounded-lg transition-all duration-300 text-lg"
                @click="scrollToPrompt"
              >
                Get Started Free
                <UIcon name="i-heroicons-arrow-right" class="ml-2 w-5 h-5" />
              </UButton>
              <UButton
                size="xl"
                variant="outline"
                class="border-2 border-mendo-black text-mendo-black hover:bg-gray-50 dark:border-gray-500 dark:text-gray-300 dark:hover:bg-white/5 font-semibold px-8 py-4 rounded-lg transition-all duration-300 text-lg"
                @click="scrollToExamples"
              >
                View Examples
              </UButton>
            </div>
            
            <!-- Trust Indicators -->
            <div class="flex flex-wrap items-center gap-6 pt-4 text-sm font-medium text-gray-500 dark:text-gray-400">
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-mendo-black dark:text-mendo-white" />
                <span>No credit card required</span>
              </div>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-mendo-black dark:text-mendo-white" />
                <span>AI-Powered Magic</span>
              </div>
            </div>
          </div>
          
          <!-- Right Side - Showcase Card -->
          <div class="relative order-2 w-full">
            <div class="bg-mendo-cream dark:bg-mendo-cream rounded-3xl p-3 sm:p-4 lg:p-6 shadow-2xl transform rotate-1 hover:rotate-0 transition-transform duration-500">
              <div class="aspect-video bg-mendo-black rounded-2xl overflow-hidden relative border-4 border-mendo-black">
                <video 
                  autoplay 
                  loop 
                  muted 
                  playsinline
                  class="w-full h-full object-cover"
                >
                  <source src="/cameraguy.webm" type="video/webm">
                  <source src="/cameraguy.MP4" type="video/mp4">
                </video>
              </div>
              
              <!-- Floating Badge -->
              <div class="absolute bottom-4 right-4 bg-white text-mendo-black px-4 py-2 rounded-2xl shadow-lg flex items-center gap-2 border-2 border-mendo-black">
                <div class="flex items-center gap-1">
                  <div class="w-6 h-6 rounded-full bg-mendo-light-blue border border-mendo-black flex items-center justify-center text-[10px] font-bold">AI</div>
                  <span class="text-xs">⚡</span>
                </div>
                <span class="text-xs font-semibold whitespace-nowrap">Generated in Seconds</span>
              </div>
            </div>
          </div>
        </div>
      </UContainer>
    </div>

    <!-- Create Section -->
    <div id="prompt-section" class="py-20 bg-mendo-light-blue dark:bg-black border-y border-gray-100 dark:border-gray-800">
      <UContainer class="max-w-4xl px-4 sm:px-6">
        <div class="text-center mb-12">
          <h2 class="text-4xl md:text-5xl font-bold mb-6 text-mendo-black dark:text-mendo-white">
            Create Your Video
          </h2>
          <p class="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Just describe your product. We'll handle the rest.
          </p>
        </div>
        
        <div class="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 p-8 sm:p-10">
          <UiPromptInput :loading="isLoading" @submit="handleSubmit" />
        </div>
      </UContainer>
    </div>

    <!-- Examples Section -->
    <div id="examples-section" class="py-20 bg-mendo-white dark:bg-black">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <div class="text-center mb-16">
          <h2 class="text-4xl md:text-5xl font-bold mb-6 text-mendo-black dark:text-mendo-white">
            Try These Examples
          </h2>
          <p class="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Get inspired with these ready-to-use templates.
          </p>
        </div>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" ref="examplesGrid" v-auto-animate>
          <div
            v-for="(example, index) in examplePrompts"
            :key="index"
            class="cursor-pointer group bg-mendo-light-grey dark:bg-gray-900 rounded-2xl p-6 hover:bg-white dark:hover:bg-gray-800 hover:shadow-xl transition-all duration-300 border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
            @click="useExample(example)"
          >
            <div class="flex items-start justify-between mb-4">
              <div class="w-12 h-12 rounded-xl bg-mendo-white dark:bg-black flex items-center justify-center text-2xl shadow-sm group-hover:scale-110 transition-transform">
                {{ example.icon }}
              </div>
              <UIcon name="i-heroicons-arrow-up-right" class="w-5 h-5 text-gray-400 group-hover:text-mendo-black dark:group-hover:text-mendo-white transition-colors" />
            </div>
            
            <h3 class="font-bold text-xl text-mendo-black dark:text-mendo-white mb-2">{{ example.title }}</h3>
            <p class="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-3">
              {{ example.description }}
            </p>
            
            <div class="flex items-center gap-3 text-xs font-medium text-gray-500 dark:text-gray-500">
              <span class="bg-white dark:bg-black px-2 py-1 rounded">{{ example.duration }}s</span>
              <span class="bg-white dark:bg-black px-2 py-1 rounded">{{ example.aspectRatio }}</span>
              <span class="bg-white dark:bg-black px-2 py-1 rounded">{{ example.style }}</span>
            </div>
          </div>
        </div>
      </UContainer>
    </div>

    <!-- Features Section -->
    <div class="py-20 bg-mendo-white dark:bg-mendo-black text-mendo-black dark:text-mendo-white transition-colors duration-300">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <div class="text-center mb-16">
          <h2 class="text-4xl md:text-5xl font-bold mb-6 text-mendo-black dark:text-mendo-white">
            Why Choose AdUbun?
          </h2>
          <p class="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Everything you need to create professional videos at scale.
          </p>
        </div>
        
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div class="bg-mendo-light-grey dark:bg-white/5 rounded-2xl p-8 border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
            <div class="text-4xl mb-4">⚡</div>
            <h3 class="text-xl font-bold mb-2 text-mendo-black dark:text-mendo-cream">Fast Generation</h3>
            <p class="text-gray-600 dark:text-gray-400">Generate professional ad videos with fully automated AI-powered pipeline.</p>
          </div>
          <div class="bg-mendo-light-grey dark:bg-white/5 rounded-2xl p-8 border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
            <div class="text-4xl mb-4">💰</div>
            <h3 class="text-xl font-bold mb-2 text-mendo-black dark:text-mendo-cream">Cost Effective</h3>
            <p class="text-gray-600 dark:text-gray-400">Less than $2 per minute of video content. No hidden fees.</p>
          </div>
          <div class="bg-mendo-light-grey dark:bg-white/5 rounded-2xl p-8 border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
            <div class="text-4xl mb-4">🤖</div>
            <h3 class="text-xl font-bold mb-2 text-mendo-black dark:text-mendo-cream">AI-Powered</h3>
            <p class="text-gray-600 dark:text-gray-400">Leveraging cutting-edge AI models including GPT-4, Replicate, and ElevenLabs.</p>
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
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

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
    adType: 'product',
  },
  {
    title: 'Fitness Product Launch',
    description: 'Generate a high-energy 60s YouTube ad showcasing a new fitness product with dynamic workout scenes and motivational voiceover',
    prompt: 'Generate a high-energy 60s YouTube ad showcasing a new fitness product with dynamic workout scenes and motivational voiceover',
    duration: 60,
    aspectRatio: '16:9',
    style: 'Energetic',
    icon: '💪',
    adType: 'lifestyle',
  },
  {
    title: 'Coffee Brand Story',
    description: 'Produce a cinematic 45s ad telling the story of artisanal coffee, from bean to cup, with warm lighting and ambient sounds',
    prompt: 'Produce a cinematic 45s ad telling the story of artisanal coffee, from bean to cup, with warm lighting and ambient sounds',
    duration: 45,
    aspectRatio: '16:9',
    style: 'Cinematic',
    icon: '☕',
    adType: 'brand_story',
  },
  {
    title: 'Tech Product Demo',
    description: 'Create a clean, minimal 30s ad demonstrating a new smartphone with smooth transitions and modern tech aesthetics',
    prompt: 'Create a clean, minimal 30s ad demonstrating a new smartphone with smooth transitions and modern tech aesthetics',
    duration: 30,
    aspectRatio: '16:9',
    style: 'Minimal',
    icon: '📱',
    adType: 'product',
  },
  {
    title: 'Fashion Brand Campaign',
    description: 'Design a stylish 45s fashion ad featuring seasonal clothing with elegant models, beautiful locations, and trendy music',
    prompt: 'Design a stylish 45s fashion ad featuring seasonal clothing with elegant models, beautiful locations, and trendy music',
    duration: 45,
    aspectRatio: '9:16',
    style: 'Elegant',
    icon: '👗',
    adType: 'lifestyle',
  },
  {
    title: 'Food Delivery Service',
    description: 'Make a vibrant 30s ad for a food delivery app showing delicious meals, happy customers, and quick delivery promise',
    prompt: 'Make a vibrant 30s ad for a food delivery app showing delicious meals, happy customers, and quick delivery promise',
    duration: 30,
    aspectRatio: '16:9',
    style: 'Energetic',
    icon: '🍔',
    adType: 'lifestyle',
  },
]

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
        adType: example.adType || 'lifestyle',
        mood: example.style,
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
      icon: 'i-heroicons-lock-closed',
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

    // Upload person reference if it's a File
    let uploadedPersonReferenceUrl: string | undefined
    
    if (formData.personReference && Array.isArray(formData.personReference) && formData.personReference.length > 0) {
      const personFile = formData.personReference[0]
      
      if (personFile instanceof File) {
        // Upload person reference to S3
        const formDataToSend = new FormData()
        formDataToSend.append('images', personFile)
        
        const uploadResult = await $fetch<{ urls: string[]; count: number }>('/api/upload-images-s3', {
          method: 'POST',
          body: formDataToSend,
        })
        
        uploadedPersonReferenceUrl = uploadResult.urls[0]
      } else if (typeof personFile === 'string') {
        uploadedPersonReferenceUrl = personFile
      }
    }

    // Store form data in sessionStorage with uploaded URLs
    if (process.client) {
      sessionStorage.setItem('promptData', JSON.stringify({
        prompt: formData.prompt,
        productImages: uploadedImageUrls,
        personReference: uploadedPersonReferenceUrl,
        aspectRatio: formData.aspectRatio,
        model: formData.model,
        mood: formData.mood,
        adType: formData.adType,
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
      color: 'red',
      icon: 'i-heroicons-exclamation-circle',
    })
    isLoading.value = false
  }
}
</script>

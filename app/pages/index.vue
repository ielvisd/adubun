<template>
  <div class="overflow-x-hidden">
    <!-- Hero Section - Modern Professional Design -->
    <div class="relative overflow-hidden bg-gradient-to-br from-brand-cream/40 via-brand-cream/20 to-brand-blue-light/20 dark:from-brand-blue-dark dark:via-brand-blue-dark/95 dark:to-brand-blue-dark">
      <!-- Decorative Background Elements -->
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <div class="absolute -top-40 -right-40 w-80 h-80 bg-brand-blue-light/30 dark:bg-brand-blue-light/20 rounded-full blur-3xl"></div>
        <div class="absolute top-60 -left-40 w-96 h-96 bg-brand-cream/40 dark:bg-brand-cream/10 rounded-full blur-3xl"></div>
      </div>
      
      <UContainer class="relative max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="flex flex-col gap-6 sm:gap-8 lg:gap-12 py-8 sm:py-12 md:py-14 lg:py-16">
          <!-- Hero Section: Text and Video side by side on desktop -->
          <div class="flex flex-col lg:grid lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 items-center min-h-[70vh]">
            <!-- Left Side - Content -->
            <div class="flex flex-col space-y-4 sm:space-y-5 lg:space-y-6 z-10 order-1 lg:order-1">
              <!-- Main Headline -->
              <h1 class="text-4xl sm:text-5xl md:text-6xl lg:text-6xl font-bold leading-tight tracking-tight text-brand-blue-dark dark:text-brand-cream">
                Transform
                <span class="block text-brand-blue-light dark:text-brand-cream">
                  Prompts
                </span>
                into Professional Ad Videos
              </h1>
              
              <!-- Subheadline -->
              <p class="text-lg sm:text-xl md:text-xl text-brand-blue-dark/90 dark:text-secondary leading-relaxed max-w-2xl">
                Create stunning, professional ad content in minutes with our AI-powered video generation platform. No editing skills required.
              </p>
            </div>
            
            <!-- Video - Between text and buttons on mobile, right side next to text on desktop -->
            <div class="relative order-2 lg:order-2 w-full lg:w-auto">
              <div class="relative">
              <!-- Main Showcase Card -->
              <div class="relative bg-brand-cream dark:bg-brand-cream rounded-xl sm:rounded-2xl shadow-xl sm:shadow-2xl p-3 sm:p-4 lg:p-5 border border-brand-cream-300 dark:border-brand-cream-300">
                <div class="aspect-video bg-brand-cream dark:bg-brand-cream rounded-xl sm:rounded-2xl overflow-hidden">
                  <video 
                    autoplay 
                    loop 
                    muted 
                    playsinline
                    class="w-full h-full object-contain"
                  >
                    <source src="/cameraguy.webm" type="video/webm">
                    <source src="/cameraguy.MP4" type="video/mp4">
                  </video>
                </div>
                <!-- Floating Stats Cards -->
                <div class="absolute -bottom-2 -left-2 sm:-bottom-3 sm:-left-3 bg-white/90 dark:bg-white/90 backdrop-blur-sm rounded-lg sm:rounded-xl shadow-lg p-2 sm:p-3 border border-brand-cream-300 dark:border-brand-cream-300">
                  <div class="flex items-center gap-1.5 sm:gap-2">
                    <div class="w-7 h-7 sm:w-9 sm:h-9 bg-brand-blue-light/20 dark:bg-brand-blue-dark/30 rounded-lg flex items-center justify-center">
                      <UIcon name="i-heroicons-check-circle" class="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue-dark dark:text-brand-blue-light" />
                    </div>
                    <div>
                      <p class="text-[10px] sm:text-xs text-gray-500 dark:text-gray-500">Status</p>
                      <p class="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-900">Completed</p>
                    </div>
                  </div>
                </div>
                <div class="absolute -top-2 -right-2 sm:-top-3 sm:-right-3 bg-white/90 dark:bg-white/90 backdrop-blur-sm rounded-lg sm:rounded-xl shadow-lg p-2 sm:p-3 border border-brand-cream-300 dark:border-brand-cream-300">
                  <div class="text-center">
                    <p class="text-base sm:text-lg lg:text-xl font-bold text-gray-900 dark:text-gray-900">AI-Powered</p>
                    <p class="text-[10px] sm:text-xs text-gray-500 dark:text-gray-500">Technology</p>
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>
          
          <!-- CTA Buttons and Trust Indicators - After video on mobile, below hero section on desktop -->
          <div class="flex flex-col space-y-4 sm:space-y-5 lg:space-y-6 z-10 order-3 lg:order-3">
            <!-- CTA Buttons -->
            <div class="flex flex-col sm:flex-row gap-4 pt-2">
              <UButton
                size="xl"
                variant="solid"
                class="bg-brand-blue-dark hover:bg-brand-blue-light text-white dark:bg-brand-blue-dark dark:hover:bg-brand-blue-light dark:text-[#FFDA9B] font-semibold px-8 py-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 text-base sm:text-lg"
                @click="scrollToPrompt"
              >
                Get Started Free
                <UIcon name="i-heroicons-arrow-right" class="ml-2 w-5 h-5" />
              </UButton>
              <UButton
                size="xl"
                variant="outline"
                class="border-2 border-brand-blue-dark text-brand-blue-dark dark:border-[#8FABD4] dark:text-[#8FABD4] hover:bg-brand-blue-light/10 dark:hover:bg-brand-blue-dark/20 font-semibold px-8 py-6 rounded-lg transition-all duration-300 text-base sm:text-lg"
                @click="scrollToExamples"
              >
                View Examples
              </UButton>
            </div>
            
            <!-- Trust Indicators -->
            <div class="flex flex-wrap items-center gap-6 pt-4 text-sm text-gray-600 dark:text-[#8FABD4]">
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-brand-blue-dark dark:text-[#FFDA9B]" />
                <span>No credit card required</span>
              </div>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-clock" class="w-5 h-5 text-brand-blue-dark dark:text-[#FFDA9B]" />
                <span>Fully Automated</span>
              </div>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-shield-check" class="w-5 h-5 text-brand-blue-dark dark:text-[#FFDA9B]" />
                <span>Professional quality</span>
              </div>
            </div>
          </div>
        </div>
      </UContainer>
    </div>

    <!-- Quick Start Section - Modern Card Design -->
    <div id="prompt-section" class="py-12 sm:py-16 md:py-20 bg-gradient-to-br from-brand-blue-light/10 via-white to-brand-cream/20 dark:from-brand-blue-dark dark:via-brand-blue-dark/95 dark:to-brand-blue-dark">
      <UContainer class="max-w-4xl px-4 sm:px-6">
        <div class="text-center mb-8 sm:mb-12">
          <h2 class="text-3xl sm:text-4xl md:text-5xl lg:text-5xl font-bold mb-3 sm:mb-4 text-brand-blue-dark dark:text-[#FFDA9B]">
            Create Your Video
          </h2>
          <p class="text-lg sm:text-xl md:text-xl text-gray-700 dark:text-[#8FABD4] max-w-2xl mx-auto mb-6">
            Just describe your product. We'll handle the rest.
          </p>
          
          <!-- Trust Indicators -->
          <div class="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-sm">
            <div class="flex items-center gap-2 text-brand-blue-dark/80 dark:text-[#8FABD4]">
              <div class="w-5 h-5 rounded-full bg-brand-blue-light/30 dark:bg-[#FFDA9B]/20 flex items-center justify-center">
                <UIcon name="i-heroicons-check" class="w-3 h-3 text-brand-blue-dark dark:text-[#FFDA9B]" />
              </div>
              <span>No video editing needed</span>
            </div>
            <div class="flex items-center gap-2 text-brand-blue-dark/80 dark:text-[#8FABD4]">
              <div class="w-5 h-5 rounded-full bg-brand-blue-light/30 dark:bg-[#FFDA9B]/20 flex items-center justify-center">
                <UIcon name="i-heroicons-clock" class="w-3 h-3 text-brand-blue-dark dark:text-[#FFDA9B]" />
              </div>
              <span>Ready in ~3 minutes</span>
            </div>
            <div class="flex items-center gap-2 text-brand-blue-dark/80 dark:text-[#8FABD4]">
              <div class="w-5 h-5 rounded-full bg-brand-blue-light/30 dark:bg-[#FFDA9B]/20 flex items-center justify-center">
                <UIcon name="i-heroicons-sparkles" class="w-3 h-3 text-brand-blue-dark dark:text-[#FFDA9B]" />
              </div>
              <span>Professional quality</span>
            </div>
          </div>
        </div>
        <div class="bg-[#FFDA9B] dark:bg-brand-blue-dark/80 rounded-2xl shadow-xl border-2 border-brand-blue-dark/20 dark:border-[#FFDA9B]/30 p-6 sm:p-8 md:p-10">
          <UiPromptInput :loading="isLoading" @submit="handleSubmit" />
        </div>
      </UContainer>
    </div>

    <!-- Example Prompts Section - Modern Grid Design -->
    <div id="examples-section" class="py-12 sm:py-16 md:py-20 bg-gradient-to-br from-white via-brand-cream/30 to-brand-blue-light/10 dark:from-brand-blue-dark/50 dark:via-brand-blue-dark dark:to-brand-blue-dark/90">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <div class="text-center mb-8 sm:mb-12">
          <h2 class="text-3xl sm:text-4xl md:text-5xl lg:text-5xl font-bold mb-3 sm:mb-4 text-brand-blue-dark dark:text-[#FFDA9B]">
            Try These Examples
          </h2>
          <p class="text-lg sm:text-xl md:text-xl text-gray-700 dark:text-[#8FABD4] max-w-2xl mx-auto">
            Get inspired with these ready-to-use templates. Click any example to get started instantly.
          </p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6" ref="examplesGrid" v-auto-animate>
          <UCard
            v-for="(example, index) in examplePrompts"
            :key="index"
            class="cursor-pointer bg-white dark:bg-brand-blue-dark/60 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 border-2 border-brand-blue-light/30 dark:border-[#FFDA9B]/20 rounded-xl overflow-hidden group"
            @click="useExample(example)"
            role="button"
            tabindex="0"
            @keydown.enter="useExample(example)"
            @keydown.space.prevent="useExample(example)"
          >
            <template #header>
              <div class="flex items-start gap-3">
                <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-brand-blue-light/20 dark:bg-[#FFDA9B]/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                  <span class="text-2xl sm:text-3xl">{{ example.icon }}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <h3 class="font-bold text-base sm:text-lg text-brand-blue-dark dark:text-[#FFDA9B] mb-1">{{ example.title }}</h3>
                  <div class="flex items-center gap-2 text-xs sm:text-sm text-brand-blue-dark/70 dark:text-[#8FABD4]">
                    <span>{{ example.duration }}s</span>
                    <span>•</span>
                    <span>{{ example.aspectRatio }}</span>
                    <span>•</span>
                    <span>{{ example.style }}</span>
                  </div>
                </div>
              </div>
            </template>
            <p class="text-gray-700 dark:text-[#8FABD4] mb-4 leading-relaxed text-sm sm:text-base">
              {{ example.description }}
            </p>
            <div class="pt-4 border-t border-brand-blue-light/30 dark:border-[#FFDA9B]/20">
              <UButton
                size="sm"
                variant="solid"
                class="w-full bg-brand-blue-dark hover:bg-brand-blue-light text-white dark:bg-brand-blue-dark dark:hover:bg-brand-blue-light dark:text-[#FFDA9B] font-semibold rounded-lg transition-all duration-300"
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
    <div class="py-12 sm:py-16 md:py-20 bg-gradient-to-br from-brand-cream/40 via-white to-brand-blue-light/10 dark:from-brand-blue-dark dark:via-brand-blue-dark/95 dark:to-brand-blue-dark" ref="featuresSection">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <div class="text-center mb-8 sm:mb-12">
          <h2 class="text-3xl sm:text-4xl md:text-5xl lg:text-5xl font-bold mb-3 sm:mb-4 text-brand-blue-dark dark:text-[#FFDA9B]">
            Why Choose AdUbun?
          </h2>
          <p class="text-lg sm:text-xl md:text-xl text-gray-700 dark:text-[#8FABD4] max-w-2xl mx-auto">
            Everything you need to create professional videos at scale, powered by cutting-edge AI
          </p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6" ref="featuresGrid" v-auto-animate>
          <UCard class="text-center bg-white dark:bg-brand-blue-dark/60 border-2 border-brand-blue-light/30 dark:border-[#FFDA9B]/20 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] p-5 sm:p-6">
            <template #header>
              <div class="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-2xl bg-brand-blue-light/30 dark:bg-[#FFDA9B]/20 flex items-center justify-center">
                <span class="text-3xl sm:text-4xl">⚡</span>
              </div>
              <h3 class="font-bold text-lg sm:text-xl text-brand-blue-dark dark:text-[#FFDA9B] mb-2">Fast Generation</h3>
            </template>
            <p class="text-gray-700 dark:text-[#8FABD4] leading-relaxed text-sm sm:text-base">
              Generate professional ad videos with fully automated AI-powered pipeline
            </p>
          </UCard>

          <UCard class="text-center bg-white dark:bg-brand-blue-dark/60 border-2 border-brand-blue-light/30 dark:border-[#FFDA9B]/20 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] p-5 sm:p-6">
            <template #header>
              <div class="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-2xl bg-brand-blue-light/30 dark:bg-[#FFDA9B]/20 flex items-center justify-center">
                <span class="text-3xl sm:text-4xl">💰</span>
              </div>
              <h3 class="font-bold text-lg sm:text-xl text-brand-blue-dark dark:text-[#FFDA9B] mb-2">Cost Effective</h3>
            </template>
            <p class="text-gray-700 dark:text-[#8FABD4] leading-relaxed text-sm sm:text-base">
              Less than $2 per minute of video content. No hidden fees, transparent pricing
            </p>
          </UCard>

          <UCard class="text-center bg-white dark:bg-brand-blue-dark/60 border-2 border-brand-blue-light/30 dark:border-[#FFDA9B]/20 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] p-5 sm:p-6">
            <template #header>
              <div class="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-2xl bg-brand-blue-light/30 dark:bg-[#FFDA9B]/20 flex items-center justify-center">
                <span class="text-3xl sm:text-4xl">🤖</span>
              </div>
              <h3 class="font-bold text-lg sm:text-xl text-brand-blue-dark dark:text-[#FFDA9B] mb-2">AI-Powered</h3>
            </template>
            <p class="text-gray-700 dark:text-[#8FABD4] leading-relaxed text-sm sm:text-base">
              Leveraging cutting-edge AI models including GPT-4, Replicate, and ElevenLabs
            </p>
          </UCard>
        </div>
      </UContainer>
    </div>

    <!-- Stats Section - Modern Design -->
    <div class="py-12 sm:py-16 md:py-20 bg-gradient-to-br from-brand-blue-dark via-brand-blue-dark to-brand-blue-dark/90 dark:from-brand-blue-dark dark:via-brand-blue-dark dark:to-brand-blue-dark/90" ref="statsSection">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
          <div class="flex flex-col justify-center text-center p-5 sm:p-6 bg-white/10 dark:bg-[#FFDA9B]/10 backdrop-blur-sm rounded-2xl shadow-lg border-2 border-white/20 dark:border-[#FFDA9B]/20">
            <div class="text-4xl sm:text-5xl md:text-6xl font-bold text-white dark:text-[#FFDA9B] mb-2 sm:mb-3" ref="stat1">
              AI-Powered
            </div>
            <div class="text-white/90 dark:text-[#8FABD4] text-sm sm:text-base font-medium">Fully Automated</div>
          </div>
          <div class="flex flex-col justify-center text-center p-5 sm:p-6 bg-white/10 dark:bg-[#FFDA9B]/10 backdrop-blur-sm rounded-2xl shadow-lg border-2 border-white/20 dark:border-[#FFDA9B]/20">
            <div class="text-4xl sm:text-5xl md:text-6xl font-bold text-white dark:text-[#FFDA9B] mb-2 sm:mb-3" ref="stat2">
              $2/min
            </div>
            <div class="text-white/90 dark:text-[#8FABD4] text-sm sm:text-base font-medium">Cost Per Minute</div>
          </div>
          <div class="flex flex-col justify-center text-center p-5 sm:p-6 bg-white/10 dark:bg-[#FFDA9B]/10 backdrop-blur-sm rounded-2xl shadow-lg border-2 border-white/20 dark:border-[#FFDA9B]/20">
            <div class="text-4xl sm:text-5xl md:text-6xl font-bold text-white dark:text-[#FFDA9B] mb-2 sm:mb-3" ref="stat3">
              100%
            </div>
            <div class="text-white/90 dark:text-[#8FABD4] text-sm sm:text-base font-medium">AI Generated</div>
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

    // Store form data in sessionStorage with uploaded URLs
    if (process.client) {
      sessionStorage.setItem('promptData', JSON.stringify({
        prompt: formData.prompt,
        productImages: uploadedImageUrls,
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

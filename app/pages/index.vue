<template>
  <div class="overflow-x-hidden bg-mendo-white dark:bg-mendo-black text-mendo-black dark:text-mendo-white">
    <!-- Hero Section -->
    <LandingHeroSection
      :primary-cta="{ label: 'Get Started Free', action: scrollToPrompt }"
      :secondary-cta="{ label: 'View Examples', action: scrollToExamples }"
    />

    <!-- Create Section -->
    <div id="prompt-section" class="py-20 bg-mendo-light-blue dark:bg-black border-y border-gray-100 dark:border-gray-800">
      <UContainer class="max-w-4xl px-4 sm:px-6">
        <LandingSectionHeader
          title="Create Your Video"
          description="Just describe your product. We'll handle the rest."
        />
        
        <div class="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 p-8 sm:p-10">
          <UiPromptInput :loading="isLoading" @submit="handleSubmit" />
        </div>

        <!-- Long Form / Scene Builder CTA -->
        <div class="mt-8 text-center space-y-4">
          <p class="text-gray-600 dark:text-gray-400 mb-4">Want more control? Use our advanced tools.</p>
          <div class="flex justify-center gap-4">
              <UButton
                to="/manual"
                variant="outline"
                color="primary"
                size="lg"
                icon="i-heroicons-film"
              >
                Open Scene Builder
              </UButton>
              <UButton
                to="/frame-match"
                variant="outline"
                color="black"
                size="lg"
                icon="i-heroicons-arrows-right-left"
              >
                Split Screen Tool
              </UButton>
          </div>
        </div>
      </UContainer>
    </div>

    <!-- Examples Section -->
    <div id="examples-section" class="py-20 bg-mendo-white dark:bg-black">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <LandingSectionHeader
          title="Try These Examples"
          description="Get inspired with these ready-to-use templates."
        />
        
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" ref="examplesGrid" v-auto-animate>
          <LandingExampleCard
            v-for="(example, index) in examplePrompts"
            :key="index"
            :example="example"
            @click="(ex) => useExample(ex)"
          />
        </div>
      </UContainer>
    </div>

    <!-- Features Section -->
    <div class="py-20 bg-mendo-white dark:bg-mendo-black text-mendo-black dark:text-mendo-white transition-colors duration-300">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <LandingSectionHeader
          title="Why Choose AdUbun?"
          description="Everything you need to create professional videos at scale."
        />
        
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <LandingFeatureCard
            icon="⚡"
            title="Fast Generation"
            description="Generate professional ad videos with fully automated AI-powered pipeline."
          />
          <LandingFeatureCard
            icon="💰"
            title="Cost Effective"
            description="Less than $2 per minute of video content. No hidden fees."
          />
          <LandingFeatureCard
            icon="🤖"
            title="AI-Powered"
            description="Leveraging cutting-edge AI models including GPT-4, Replicate, and ElevenLabs."
          />
        </div>
      </UContainer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DEFAULT_MODEL_ID } from '~/config/video-models'

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

const useExample = (example: { prompt: string; aspectRatio: string; adType?: string; style: string }) => {
  if (process.client) {
    scrollToPrompt()
    setTimeout(() => {
      handleSubmit({
        prompt: example.prompt,
        productImages: [],
        aspectRatio: example.aspectRatio as '16:9' | '9:16',
        model: DEFAULT_MODEL_ID,
        generateVoiceover: false,
        adType: example.adType || 'lifestyle',
        mood: example.style,
        seamlessTransition: true, // Examples default to seamless
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
        seamlessTransition: formData.seamlessTransition ?? true, // Default to true (seamless ON)
      }))
    }

    // Navigate to appropriate stories page based on seamlessTransition flag
    const seamlessTransition = formData.seamlessTransition ?? true
    const targetPage = seamlessTransition ? '/stories' : '/stories-seam'
    console.log(`[Index] Navigating to ${targetPage} (seamlessTransition: ${seamlessTransition})`)
    await navigateTo(targetPage)
  } catch (error: any) {
    const errorMessage = error.data?.message || error.message || 'Failed to upload images'
    toast.add({
      title: 'Error',
      description: errorMessage,
      color: 'error',
      icon: 'i-heroicons-exclamation-circle',
    })
    isLoading.value = false
  }
}
</script>

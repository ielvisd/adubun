<template>
  <div class="overflow-x-hidden bg-mendo-white dark:bg-mendo-black text-mendo-black dark:text-mendo-white">
    <!-- Content temporarily disabled - set showContent to true to enable -->
    <ClientOnly>
      <template v-if="showContent">
    <!-- Hero Section -->
    <LandingHeroSection
          :primary-cta="{ label: 'Get Started Free', action: () => router.push('/create') }"
          :secondary-cta="{ label: 'Model Generator', action: () => router.push('/models/create') }"
          :show-video-badge="false"
          />

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
      </template>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
const { user, loading: authLoading } = useAuth()
const router = useRouter()
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

// Content visibility toggle - set to true to show content
const showContent = ref(true)

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
</script>

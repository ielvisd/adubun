<template>
  <div class="relative overflow-hidden bg-mendo-white dark:bg-mendo-black transition-colors duration-300">
    <UContainer class="relative max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="flex flex-col lg:grid lg:grid-cols-2 gap-8 lg:gap-16 py-12 md:py-20 items-start lg:items-center min-h-[80vh]">
        <!-- Left Side - Content -->
        <div class="flex flex-col space-y-6 z-10 order-1 w-full">
          <!-- Main Headline -->
          <h1 class="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight tracking-tight text-mendo-black dark:text-mendo-white">
            <span class="block">{{ headlineLine1 }}</span>
            <span class="block">{{ headlineLine2 }}</span>
          </h1>
          
          <!-- Subheadline -->
          <p class="text-xl sm:text-2xl text-gray-600 dark:text-gray-300 leading-relaxed max-w-lg">
            {{ subheadline }}
          </p>
          
          <!-- Mobile Video - Only visible on mobile -->
          <LandingVideoShowcase variant="mobile" :show-badge="showVideoBadge" />
          
          <!-- CTA Buttons -->
          <div class="flex flex-col sm:flex-row gap-4 pt-4">
            <UButton
              v-if="primaryCta"
              size="xl"
              variant="solid"
              class="bg-mendo-black text-mendo-white hover:bg-gray-800 dark:bg-mendo-cream dark:text-mendo-black dark:hover:bg-[#d9b592] font-semibold px-8 py-4 rounded-lg transition-all duration-300 text-lg"
              @click="primaryCta.action"
            >
              {{ primaryCta.label }}
              <UIcon name="i-heroicons-arrow-right" class="ml-2 w-5 h-5" />
            </UButton>
            <UButton
              v-if="secondaryCta"
              size="xl"
              variant="outline"
              class="border-2 border-mendo-black text-mendo-black hover:bg-gray-50 dark:border-gray-500 dark:text-gray-300 dark:hover:bg-white/5 font-semibold px-8 py-4 rounded-lg transition-all duration-300 text-lg"
              @click="secondaryCta.action"
            >
              {{ secondaryCta.label }}
            </UButton>
          </div>
          
          <!-- Trust Indicators -->
          <LandingTrustIndicators />
        </div>
        
        <!-- Right Side - Showcase Card (Desktop only) -->
        <div class="relative order-2 w-full">
          <LandingVideoShowcase variant="desktop" :show-badge="showVideoBadge" />
        </div>
      </div>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
interface CTA {
  label: string
  action: () => void
}

interface Props {
  headlineLine1?: string
  headlineLine2?: string
  subheadline?: string
  primaryCta?: CTA
  secondaryCta?: CTA
  showVideoBadge?: boolean
}

withDefaults(defineProps<Props>(), {
  headlineLine1: 'Transform Prompts',
  headlineLine2: 'into Professional Ads',
  subheadline: 'Create stunning, high-converting video content in minutes with our AI-powered platform. No editing skills required.',
  showVideoBadge: true,
})
</script>




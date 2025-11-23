<template>
  <div class="min-h-screen bg-mendo-white dark:bg-mendo-black py-8 sm:py-12">
    <UContainer class="max-w-6xl px-4 sm:px-6">
      <!-- Header -->
      <div class="text-center mb-8 sm:mb-12">
        <h1 class="text-3xl sm:text-4xl font-bold text-mendo-black dark:text-mendo-white mb-3">
          Choose Your Category
        </h1>
        <p class="text-lg text-mendo-black/70 dark:text-mendo-white/70">
          We'll auto-fill everything else for you
        </p>
      </div>

      <!-- Category Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
        <CategoryTile
          v-for="category in categories"
          :key="category.id"
          :category="category"
          @select="handleCategorySelect(category.id)"
        />
      </div>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
import CategoryTile from '~/components/create/CategoryTile.vue'
import { useCategoryAutoFill } from '~/composables/useCategoryAutoFill'
import { getAvatarForCategory } from '~/config/avatars'

const router = useRouter()
const toast = useToast()
const { getCategories, getAvatarIdForCategory } = useCategoryAutoFill()

// Get regular categories and add custom option
const regularCategories = getCategories()
const customCategory = {
  id: 'custom',
  name: 'Custom (Power Users)',
  icon: '⚙️',
  description: 'Full control over all settings',
  problemPhrase: '',
  timePeriod: '',
  emotionalAdjectives: [],
  salesRange: { min: 0, max: 0 },
  timeFrames: [],
  discountOptions: [],
  background: '',
  character: { age: '', gender: '' },
  voiceTone: '',
  voiceSpeed: '',
  priceRange: { min: 0, max: 0 },
  benefitSuggestions: [],
  avatarId: 'mia', // Default avatar for custom category
}

const categories = [...regularCategories, customCategory]

const handleCategorySelect = async (categoryId: string) => {
  console.log('[Create] Category selected:', categoryId)
  
  // Ensure we're on the client side
  if (import.meta.client) {
    try {
      if (categoryId === 'custom') {
        // Clear any category flow data to show full PromptInput
        sessionStorage.removeItem('selectedCategory')
        sessionStorage.removeItem('categoryFlow')
        sessionStorage.removeItem('promptData')
        // Navigate to generate page which will show the full PromptInput
        console.log('[Create] Navigating to /generate (custom category)')
        await router.push('/generate')
      } else {
        sessionStorage.setItem('selectedCategory', categoryId)
        
        // Auto-select avatar for this category
        const avatarId = getAvatarIdForCategory(categoryId)
        if (avatarId) {
          sessionStorage.setItem('selectedAvatarId', avatarId)
          console.log('[Create] Auto-selected avatar:', avatarId, 'for category:', categoryId)
        }
        
        console.log('[Create] Navigating to /create/details (category:', categoryId, ')')
        await router.push('/create/details')
      }
    } catch (error: any) {
      console.error('[Create] Navigation error:', error)
      toast.add({
        title: 'Navigation Error',
        description: error.message || 'Failed to navigate. Please try again.',
        color: 'error',
        icon: 'i-heroicons-exclamation-triangle',
      })
    }
  } else {
    console.warn('[Create] handleCategorySelect called on server side, ignoring')
  }
}
</script>


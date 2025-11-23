<template>
  <div class="space-y-6">
    <!-- Product Name -->
    <UFormField label="Product Name" name="productName" required>
      <UInput
        v-model="form.productName"
        placeholder="e.g., Acne Clear Serum"
        class="w-full"
        size="xl"
      />
      <template #description>
        <span class="text-mendo-black/70 dark:text-mendo-white/70">
          The name of your product
        </span>
      </template>
    </UFormField>

    <!-- Magic Benefit -->
    <UFormField label="Your Magic Benefit" name="magicBenefit" required>
      <BenefitSuggestions
        v-model="form.magicBenefit"
        :suggestions="benefitSuggestions"
      />
      <template #description>
        <span class="text-mendo-black/70 dark:text-mendo-white/70">
          What makes your product special? (4 words max)
        </span>
      </template>
    </UFormField>

    <!-- Sale Price -->
    <UFormField label="Sale Price" name="salePrice" required>
      <PriceSelector v-model="form.salePrice" />
      <template #description>
        <span class="text-mendo-black/70 dark:text-mendo-white/70">
          Choose a quick price or enter custom
        </span>
      </template>
    </UFormField>

    <!-- Generate Button -->
    <UButton
      :disabled="!isValid || loading"
      :loading="loading"
      size="xl"
      color="secondary"
      class="w-full bg-secondary-500 hover:bg-secondary-600 text-white font-semibold py-4 rounded-lg shadow-lg hover:shadow-xl transition-all"
      @click="handleSubmit"
    >
      <span v-if="!loading">Generate Video</span>
      <span v-else>Generating...</span>
    </UButton>
  </div>
</template>

<script setup lang="ts">
import { z } from 'zod'
import BenefitSuggestions from './BenefitSuggestions.vue'
import PriceSelector from './PriceSelector.vue'
import { useCategoryAutoFill } from '~/composables/useCategoryAutoFill'
import { getAvatarForCategory, getAvatarReferenceImageUrl } from '~/config/avatars'

const router = useRouter()
const toast = useToast()
const { getCategoryConfig, generatePrompt } = useCategoryAutoFill()

const loading = ref(false)

const form = reactive({
  productName: '',
  magicBenefit: '',
  salePrice: null as number | null,
})

const selectedCategory = ref<string | null>(null)

// Load selected category from sessionStorage
onMounted(async () => {
  console.log('[ProductDetailsForm] Component mounted, import.meta.client:', import.meta.client)
  
  if (import.meta.client) {
    // Use nextTick to ensure sessionStorage is available after navigation
    await nextTick()
    
    console.log('[ProductDetailsForm] Loading category from sessionStorage')
    const category = sessionStorage.getItem('selectedCategory')
    console.log('[ProductDetailsForm] Category from sessionStorage:', category)
    console.log('[ProductDetailsForm] All sessionStorage keys:', Object.keys(sessionStorage))
    
    if (category && category !== 'custom') {
      selectedCategory.value = category
      console.log('[ProductDetailsForm] Category loaded successfully:', category)
    } else {
      // No category selected, redirect to category selection
      console.warn('[ProductDetailsForm] No valid category found, redirecting to /create')
      console.warn('[ProductDetailsForm] Category value was:', category)
      await router.push('/create')
    }
  } else {
    console.warn('[ProductDetailsForm] Not on client side, cannot load category')
  }
})

const categoryConfig = computed(() => {
  if (!selectedCategory.value) return null
  return getCategoryConfig(selectedCategory.value)
})

const benefitSuggestions = computed(() => {
  return categoryConfig.value?.benefitSuggestions || []
})

const validationSchema = z.object({
  productName: z.string().min(1, 'Product name is required'),
  magicBenefit: z.string().min(1, 'Magic benefit is required'),
  salePrice: z.number().min(1, 'Sale price must be at least $1'),
})

const isValid = computed(() => {
  try {
    validationSchema.parse({
      productName: form.productName.trim(),
      magicBenefit: form.magicBenefit.trim(),
      salePrice: form.salePrice,
    })
    return true
  } catch {
    return false
  }
})

const handleSubmit = async () => {
  if (!isValid.value || !selectedCategory.value) return

  try {
    // Validate form
    validationSchema.parse({
      productName: form.productName.trim(),
      magicBenefit: form.magicBenefit.trim(),
      salePrice: form.salePrice,
    })
  } catch (error: any) {
    if (error.errors && error.errors.length > 0) {
      toast.add({
        title: 'Validation Error',
        description: error.errors[0].message,
        color: 'error',
      })
    }
    return
  }

  loading.value = true

  try {
    // Generate full prompt from category + inputs
    const fullPrompt = generatePrompt(
      selectedCategory.value,
      form.productName.trim(),
      form.magicBenefit.trim(),
      form.salePrice!
    )

    // Store in sessionStorage for compatibility with existing flow
    if (import.meta.client) {
      // Automatically determine avatar based on category
      const avatar = getAvatarForCategory(selectedCategory.value)
      const avatarReference: string[] = []
      let avatarId: string | undefined = undefined
      
      if (avatar) {
        avatarId = avatar.id
        // Add avatar reference images
        const referenceUrl = getAvatarReferenceImageUrl(avatar)
        const previewUrl = `/avatars/${avatar.id}/preview.jpg`
        avatarReference.push(referenceUrl, previewUrl)
        console.log('[ProductDetailsForm] Selected avatar:', avatar.id, 'Reference images:', avatarReference)
        
        // Set selectedAvatarId for finalize page
        sessionStorage.setItem('selectedAvatarId', avatar.id)
      }

      sessionStorage.setItem('promptData', JSON.stringify({
        prompt: fullPrompt,
        productImages: [],
        personReference: undefined,
        avatarReference,
        avatarId,
        aspectRatio: '9:16', // Fixed for TikTok
        model: 'google/veo-3.1-fast', // Default model
        mood: 'energetic', // Default mood
        adType: 'lifestyle', // Default ad type
        generateVoiceover: true,
        seamlessTransition: true, // Fixed ON
      }))

      // Also store category-specific data for reference
      sessionStorage.setItem('categoryFlow', JSON.stringify({
        category: selectedCategory.value,
        productName: form.productName.trim(),
        magicBenefit: form.magicBenefit.trim(),
        salePrice: form.salePrice,
        generatedPrompt: fullPrompt,
      }))
    }

    // Navigate to finalize page (avatar + product photos)
    await router.push('/create/finalize')
  } catch (error: any) {
    console.error('Error generating prompt:', error)
    toast.add({
      title: 'Error',
      description: error.message || 'Failed to generate prompt. Please try again.',
      color: 'error',
    })
  } finally {
    loading.value = false
  }
}
</script>



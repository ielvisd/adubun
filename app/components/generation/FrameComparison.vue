<template>
  <div v-if="hasImages" class="mt-4 space-y-4">
    <div class="flex items-center justify-between">
      <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
        {{ frameLabel }} - Model Comparison
      </h4>
      <UButton
        v-if="isComparisonVisible"
        variant="ghost"
        size="xs"
        @click="hideComparison"
      >
        Hide
      </UButton>
      <UButton
        v-else
        variant="outline"
        size="xs"
        @click="showComparison"
      >
        Show Comparison
      </UButton>
    </div>
    
    <div v-if="isComparisonVisible" class="grid grid-cols-2 gap-4">
      <!-- Nano-Banana Output -->
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <UBadge color="yellow" variant="solid" size="sm">
            Nano-Banana
          </UBadge>
          <span class="text-xs text-gray-500 dark:text-gray-400">Original</span>
        </div>
        <div class="relative w-full border-2 border-yellow-300 dark:border-yellow-600 rounded-lg overflow-hidden">
          <NuxtImg
            v-if="nanoImageUrl"
            :src="nanoImageUrl"
            alt="Nano-Banana output"
            class="w-full h-auto"
            loading="lazy"
          />
          <div v-else class="w-full h-48 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <span class="text-sm text-gray-400">No nano-banana image</span>
          </div>
        </div>
      </div>
      
      <!-- Seedream-4 Enhanced -->
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <UBadge color="blue" variant="solid" size="sm">
            Seedream-4
          </UBadge>
          <span class="text-xs text-gray-500 dark:text-gray-400">Enhanced</span>
        </div>
        <div class="relative w-full border-2 border-blue-300 dark:border-blue-600 rounded-lg overflow-hidden">
          <NuxtImg
            v-if="seedreamImageUrl"
            :src="seedreamImageUrl"
            alt="Seedream-4 enhanced output"
            class="w-full h-auto"
            loading="lazy"
          />
          <div v-else class="w-full h-48 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <span class="text-sm text-gray-400">Nano-banana used (no enhancement)</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  nanoImageUrl?: string
  seedreamImageUrl?: string
  showComparison?: boolean
  frameLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  showComparison: false,
  frameLabel: 'Frame'
})

const emit = defineEmits<{
  show: []
  close: []
}>()

const hasImages = computed(() => {
  return !!(props.nanoImageUrl || props.seedreamImageUrl)
})

const hasBothImages = computed(() => {
  return !!(props.nanoImageUrl && props.seedreamImageUrl)
})

// Track if we should auto-show when both images first become available
const shouldAutoShow = ref(true)

// Watch for when both images become available to auto-show
watch(hasBothImages, (newVal) => {
  if (newVal && shouldAutoShow.value) {
    // Auto-show when both images first become available
    emit('show')
    shouldAutoShow.value = false // Only auto-show once
  }
}, { immediate: true })

// Auto-show when both images exist, otherwise use prop
const isComparisonVisible = computed(() => {
  // If we have both images, auto-show by default (unless user has hidden it)
  if (hasBothImages.value) {
    // Use prop value if set, otherwise default to true for auto-show
    return props.showComparison !== false
  }
  // If we don't have both images, use the prop value
  return props.showComparison || false
})

const showComparison = () => {
  emit('show')
}

const hideComparison = () => {
  emit('close')
}
</script>

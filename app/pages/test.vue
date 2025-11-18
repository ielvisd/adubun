<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 sm:py-12">
    <UContainer class="max-w-4xl px-4 sm:px-6">
      <div class="text-center mb-8">
        <h1 class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
          Gemini Veo 3.1 Test
        </h1>
        <p class="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
          Test the Gemini Veo 3.1 video generation and extension functionality
        </p>
      </div>

      <!-- Test Button -->
      <div class="flex justify-center mb-8">
        <UButton
          :loading="loading"
          :disabled="loading"
          size="lg"
          variant="solid"
          class="bg-black hover:bg-gray-900 text-white font-semibold px-8 py-3 rounded-none min-h-[48px]"
          @click="handleTestClick"
        >
          <span v-if="!loading">Test</span>
          <span v-else>Testing...</span>
        </UButton>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-16 h-16 text-gray-500 dark:text-gray-400 animate-spin mb-4" />
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">Running Test</h2>
        <p class="text-gray-600 dark:text-gray-400 text-center">
          This may take several minutes. Please wait...
        </p>
        <p v-if="currentStep" class="text-sm text-gray-500 dark:text-gray-500 mt-2">
          {{ currentStep }}
        </p>
      </div>

      <!-- Error State -->
      <UAlert
        v-if="error && !loading"
        color="error"
        variant="soft"
        :title="error"
        class="mb-6"
      >
        <template #description>
          <div v-if="errorDetails" class="mt-2">
            <details class="text-xs">
              <summary class="cursor-pointer text-red-700 dark:text-red-300">Show error details</summary>
              <pre class="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded overflow-auto text-xs">{{ errorDetails }}</pre>
            </details>
          </div>
        </template>
      </UAlert>

      <!-- Success State - Videos -->
      <div v-if="!loading && (baseVideoUrl || extendedVideoUrl)" class="space-y-6">
        <!-- Base Video -->
        <UCard v-if="baseVideoUrl" class="bg-white dark:bg-gray-800">
          <template #header>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Base Video</h2>
          </template>
          <div class="aspect-video w-full bg-black flex items-center justify-center rounded-lg overflow-hidden">
            <video
              :src="baseVideoUrl"
              controls
              class="w-full h-full object-contain"
              preload="metadata"
            >
              Your browser does not support the video tag.
            </video>
          </div>
        </UCard>

        <!-- Extended Video -->
        <UCard v-if="extendedVideoUrl" class="bg-white dark:bg-gray-800">
          <template #header>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Extended Video</h2>
          </template>
          <div class="aspect-video w-full bg-black flex items-center justify-center rounded-lg overflow-hidden">
            <video
              :src="extendedVideoUrl"
              controls
              class="w-full h-full object-contain"
              preload="metadata"
            >
              Your browser does not support the video tag.
            </video>
          </div>
        </UCard>

        <!-- Operation IDs -->
        <UCard v-if="baseOperationId || extendedOperationId" class="bg-white dark:bg-gray-800">
          <template #header>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Operation IDs</h2>
          </template>
          <div class="space-y-2 text-sm">
            <div v-if="baseOperationId">
              <span class="font-medium text-gray-700 dark:text-gray-300">Base Video:</span>
              <code class="ml-2 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">{{ baseOperationId }}</code>
            </div>
            <div v-if="extendedOperationId">
              <span class="font-medium text-gray-700 dark:text-gray-300">Extended Video:</span>
              <code class="ml-2 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">{{ extendedOperationId }}</code>
            </div>
          </div>
        </UCard>
      </div>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
console.log('[Test Page] Script setup executing...')

const loading = ref(false)
const error = ref<string | null>(null)
const errorDetails = ref<string | null>(null)
const baseVideoUrl = ref<string | null>(null)
const extendedVideoUrl = ref<string | null>(null)
const baseOperationId = ref<string | null>(null)
const extendedOperationId = ref<string | null>(null)
const currentStep = ref<string | null>(null)

// Debug: Log when component is mounted
onMounted(() => {
  console.log('[Test Page] Component mounted, button should be clickable')
})

const handleTestClick = async () => {
  console.log('[Test Page] Button clicked!')
  
  // Immediate visual feedback - show alert to confirm click is working
  if (process.client) {
    console.log('[Test Page] Client-side, button click registered')
  }
  
  // Immediate visual feedback
  if (loading.value) {
    console.log('[Test Page] Already loading, ignoring click')
    return
  }
  
  // Set loading immediately to show something is happening
  loading.value = true
  error.value = null
  currentStep.value = 'Starting test...'
  
  // Small delay to ensure UI updates
  await new Promise(resolve => setTimeout(resolve, 100))
  
  try {
    await runTest()
  } catch (err: any) {
    console.error('[Test Page] Unhandled error in runTest:', err)
    error.value = 'Unexpected error: ' + (err.message || String(err))
    errorDetails.value = err.stack || null
    loading.value = false
    currentStep.value = null
  }
}

const runTest = async () => {
  console.log('[Test Page] runTest called, starting test...')
  
  // Reset state (loading is already set in handleTestClick)
  error.value = null
  errorDetails.value = null
  baseVideoUrl.value = null
  extendedVideoUrl.value = null
  baseOperationId.value = null
  extendedOperationId.value = null
  currentStep.value = 'Initializing test...'

  try {
    console.log('[Test Page] Calling API endpoint: /api/test-gemini-veo')
    currentStep.value = 'Generating base video...'
    const result = await $fetch<{
      success: boolean
      baseVideoUrl?: string
      extendedVideoUrl?: string
      baseOperationId?: string
      extendedOperationId?: string
      error?: string
      details?: string
    }>('/api/test-gemini-veo', {
      method: 'POST',
    })

    console.log('[Test Page] API response received:', result)
    
    if (result.success) {
      console.log('[Test Page] Test succeeded!')
      baseVideoUrl.value = result.baseVideoUrl || null
      extendedVideoUrl.value = result.extendedVideoUrl || null
      baseOperationId.value = result.baseOperationId || null
      extendedOperationId.value = result.extendedOperationId || null
      currentStep.value = 'Test completed successfully!'
    } else {
      console.log('[Test Page] Test failed:', result.error)
      error.value = result.error || 'Test failed'
      errorDetails.value = result.details || null
      baseVideoUrl.value = result.baseVideoUrl || null
      // If we got a base video but extension failed, still show it
    }
  } catch (err: any) {
    console.error('[Test Page] Test error:', err)
    error.value = err.data?.message || err.message || 'Failed to run test'
    errorDetails.value = err.data?.details || err.stack || null
  } finally {
    console.log('[Test Page] Test completed, setting loading to false')
    loading.value = false
    currentStep.value = null
  }
}
</script>


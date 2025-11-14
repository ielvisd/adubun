<template>
  <div class="space-y-6">
    <UCard class="letsignit-card">
      <template #header>
        <div class="flex justify-between items-center">
          <h3 class="text-2xl font-semibold text-black">Generating Assets</h3>
          <UBadge :color="statusColor" size="lg">{{ status }}</UBadge>
        </div>
      </template>

      <!-- Overall Progress -->
      <UProgress :value="overallProgress" class="mb-4" />

      <!-- Overall Error Message -->
      <div
        v-if="status === 'failed' && overallError"
        class="mb-4 p-4 bg-error-50 border border-error-200 rounded-lg"
      >
        <p class="text-sm font-medium text-error-800">Generation Failed:</p>
        <p class="text-sm text-error-600 mt-1">{{ overallError }}</p>
      </div>

      <!-- Segment Progress -->
      <div class="space-y-3">
        <template
          v-for="(segment, idx) in segments"
          :key="idx"
        >
          <div class="flex items-center gap-3">
            <UIcon
              :name="getStatusIcon(segment.status)"
              :class="getStatusClass(segment.status)"
              class="w-5 h-5"
            />
            <span class="flex-1">Segment {{ idx + 1 }}: {{ segment.type }}</span>
            <span class="text-sm text-gray-500">{{ segment.status }}</span>
          </div>
          <!-- Error Messages -->
          <div
            v-if="segment.status === 'failed' && segment.error"
            class="mt-2 p-3 bg-error-50 border border-error-200 rounded-lg"
          >
            <p class="text-sm font-medium text-error-800">Segment {{ idx + 1 }} Error:</p>
            <p class="text-sm text-error-600 mt-1">{{ segment.error }}</p>
            <UButton
              v-if="segment.metadata"
              size="xs"
              variant="outline"
              color="error"
              class="mt-2"
              @click="downloadMetadata(segment, idx)"
            >
              <UIcon name="i-heroicons-arrow-down-tray" class="mr-1" />
              Download Error Metadata
            </UButton>
          </div>
          
          <!-- Success Metadata -->
          <div
            v-if="segment.status === 'completed' && segment.metadata"
            class="mt-2 p-3 bg-success-50 border border-success-200 rounded-lg"
          >
            <div class="flex justify-between items-start">
              <div class="flex-1">
                <p class="text-sm font-medium text-success-800 mb-2">Segment {{ idx + 1 }} Metadata:</p>
                <div class="text-xs text-success-700 space-y-1">
                  <p v-if="segment.metadata.predictionId">
                    <strong>Prediction ID:</strong> 
                    <code class="bg-success-100 px-1 rounded">{{ segment.metadata.predictionId }}</code>
                  </p>
                  <p v-if="segment.metadata.replicateVideoUrl">
                    <strong>Replicate Video URL:</strong>
                    <a 
                      :href="segment.metadata.replicateVideoUrl" 
                      target="_blank" 
                      class="text-blue-600 hover:underline ml-1"
                    >
                      View Video
                    </a>
                  </p>
                  <p v-if="segment.metadata.videoUrl">
                    <strong>Video URL:</strong> 
                    <code class="bg-success-100 px-1 rounded break-all">{{ segment.metadata.videoUrl }}</code>
                  </p>
                </div>
              </div>
              <UButton
                size="xs"
                variant="outline"
                color="success"
                @click="downloadMetadata(segment, idx)"
              >
                <UIcon name="i-heroicons-arrow-down-tray" class="mr-1" />
                Download Metadata
              </UButton>
            </div>
          </div>
        </template>
      </div>
    </UCard>

    <!-- Cost Tracker -->
    <UCard class="letsignit-card">
      <template #header>
        <h4 class="text-xl font-semibold text-black">Cost Tracking</h4>
      </template>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-sm text-gray-500">Current Cost</p>
          <p class="text-2xl font-bold">${{ currentCost.toFixed(3) }}</p>
        </div>
        <div>
          <p class="text-sm text-gray-500">Estimated Total</p>
          <p class="text-2xl font-bold">${{ estimatedTotal.toFixed(3) }}</p>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { Asset } from '~/app/types/generation'

const props = defineProps<{
  segments: Array<{
    type: string
    status: string
    progress?: number
    error?: string
    metadata?: Asset['metadata']
  }>
  overallProgress: number
  status: string
  currentCost: number
  estimatedTotal: number
  overallError?: string
}>()

const downloadMetadata = (segment: any, index: number) => {
  const metadata = {
    segmentIndex: index,
    segmentType: segment.type,
    status: segment.status,
    error: segment.error,
    metadata: segment.metadata,
    timestamp: new Date().toISOString(),
  }
  
  const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `segment-${index + 1}-metadata-${Date.now()}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  
  // Also log to console for easy access
  console.log(`[GenerationProgress] Segment ${index + 1} Metadata:`, metadata)
}

const statusColor = computed(() => {
  if (props.status === 'completed') return 'success'
  if (props.status === 'failed') return 'error'
  return 'accent'
})

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return 'i-heroicons-check-circle'
    case 'failed':
      return 'i-heroicons-x-circle'
    case 'processing':
      return 'i-heroicons-arrow-path'
    default:
      return 'i-heroicons-clock'
  }
}

const getStatusClass = (status: string) => {
  switch (status) {
    case 'completed':
      return 'text-success-500'
    case 'failed':
      return 'text-error-500'
    case 'processing':
      return 'text-accent-500 animate-spin'
    default:
      return 'text-gray-400'
  }
}
</script>


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
const props = defineProps<{
  segments: Array<{
    type: string
    status: string
    progress?: number
    error?: string
  }>
  overallProgress: number
  status: string
  currentCost: number
  estimatedTotal: number
  overallError?: string
}>()

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


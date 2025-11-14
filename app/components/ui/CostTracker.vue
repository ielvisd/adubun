<template>
  <UCard>
    <template #header>
      <h3 class="text-lg font-semibold">Cost Analytics</h3>
    </template>

    <div class="space-y-4">
      <div class="grid grid-cols-3 gap-4">
        <div>
          <p class="text-sm text-gray-500">Total Spent (24h)</p>
          <p class="text-2xl font-bold">${{ totalSpent.toFixed(2) }}</p>
        </div>
        <div>
          <p class="text-sm text-gray-500">Avg Cost/Video</p>
          <p class="text-2xl font-bold">${{ avgCost.toFixed(2) }}</p>
        </div>
        <div>
          <p class="text-sm text-gray-500">Videos Generated</p>
          <p class="text-2xl font-bold">{{ videoCount }}</p>
        </div>
      </div>

      <!-- Cost Breakdown -->
      <div v-if="Object.keys(breakdown).length > 0">
        <h4 class="font-semibold mb-2">Cost Breakdown</h4>
        <div class="space-y-2">
          <div
            v-for="(amount, operation) in breakdown"
            :key="operation"
            class="flex justify-between items-center"
          >
            <span class="text-sm">{{ operation }}</span>
            <span class="font-semibold">${{ amount.toFixed(3) }}</span>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const { breakdown } = useCostTracking()

const totalSpent = computed(() => 
  Object.values(breakdown.value).reduce((sum, val) => sum + val, 0)
)

const videoCount = computed(() => {
  // Estimate based on average cost per video
  return Math.max(1, Math.ceil(totalSpent.value / 1.5))
})

const avgCost = computed(() => 
  totalSpent.value / videoCount.value
)
</script>


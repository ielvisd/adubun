<template>
  <div class="relative">
    <!-- Timeline connector line (except for first stage) -->
    <div v-if="stageNumber > 1" class="absolute left-6 top-0 w-0.5 h-8 bg-gray-300 dark:bg-gray-600 -translate-y-8" />
    
    <div class="flex gap-4">
      <!-- Stage Icon -->
      <div :class="[
        'flex-shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center',
        `bg-${iconColor}-100 dark:bg-${iconColor}-900/30`,
        `border-${iconColor}-300 dark:border-${iconColor}-700`
      ]">
        <UIcon 
          :name="icon" 
          :class="`w-6 h-6 text-${iconColor}-600 dark:text-${iconColor}-400`"
        />
      </div>
      
      <!-- Stage Content -->
      <div class="flex-1 pb-4">
        <!-- Stage Header -->
        <div class="flex items-start justify-between mb-4">
          <div>
            <div class="flex items-center gap-3 mb-1">
              <UBadge :color="iconColor" variant="subtle">Step {{ stageNumber }}</UBadge>
              <h3 class="text-lg font-bold text-gray-900 dark:text-white">
                {{ stageName }}
              </h3>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ stageDescription }}
            </p>
          </div>
        </div>
        
        <!-- Stage Body (slot for content) -->
        <div class="space-y-4">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  stageNumber: number
  stageName: string
  stageDescription: string
  icon: string
  iconColor: string
}>()
</script>



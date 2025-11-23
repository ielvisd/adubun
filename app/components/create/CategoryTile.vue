<template>
  <button
    :class="[
      'w-full p-6 rounded-2xl border-2 transition-all duration-200',
      'bg-mendo-white dark:bg-mendo-black',
      'border-mendo-light-grey dark:border-mendo-light-grey/30',
      'hover:border-mendo-cream dark:hover:border-mendo-cream hover:bg-mendo-light-blue/50 dark:hover:bg-mendo-light-blue/10 hover:shadow-lg',
      'active:scale-95',
      'focus:outline-none focus:ring-2 focus:ring-mendo-cream focus:ring-offset-2',
      'flex flex-col items-center justify-center gap-3',
      'min-h-[140px] sm:min-h-[160px]',
    ]"
    @click="$emit('select')"
  >
    <span class="text-4xl sm:text-5xl">{{ category.icon }}</span>
    <div class="text-center">
      <h3 class="text-lg sm:text-xl font-semibold text-mendo-black dark:text-mendo-white">
        {{ category.name }}
      </h3>
      <p v-if="category.description" class="text-sm text-mendo-black/70 dark:text-mendo-white/70 mt-1">
        {{ category.description }}
      </p>
    </div>
  </button>
</template>

<script setup lang="ts">
import type { CategoryConfig } from '~/composables/useCategoryAutoFill'

defineProps<{
  category: CategoryConfig
}>()

defineEmits<{
  select: []
}>()
</script>



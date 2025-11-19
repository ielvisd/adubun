<template>
  <div class="w-full mb-6 sm:mb-8">
    <UStepper
      :items="steps"
      :model-value="currentStep"
      color="secondary"
      size="md"
      orientation="horizontal"
      :disabled="true"
      class="w-full"
    />
  </div>
</template>

<script setup lang="ts">
import type { StepperItem } from '@nuxt/ui'

interface Props {
  currentStep: number
}

const props = defineProps<Props>()

const steps: StepperItem[] = [
  {
    title: 'Creating Stories',
    description: 'Generate story options',
    icon: 'i-heroicons-document-text',
  },
  {
    title: 'Creating Storyboard',
    description: 'Plan and edit scenes',
    icon: 'i-heroicons-film',
  },
  {
    title: 'Creating Images',
    description: 'Generate frame images',
    icon: 'i-heroicons-photo',
  },
  {
    title: 'Generating Videos',
    description: 'Generate video segments',
    icon: 'i-heroicons-video-camera',
  },
  {
    title: 'Extending/Trimming Video',
    description: 'Edit video clips',
    icon: 'i-heroicons-scissors',
  },
  {
    title: 'Composing Video',
    description: 'Final composed video',
    icon: 'i-heroicons-check-circle',
  },
]
</script>


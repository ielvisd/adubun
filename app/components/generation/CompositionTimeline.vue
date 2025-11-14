<template>
  <UCard>
    <template #header>
      <h3 class="text-xl font-semibold">Video Composition</h3>
    </template>

    <div class="space-y-4">
      <!-- Timeline Visualization -->
      <div class="relative h-24 bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden">
        <div
          v-for="(clip, idx) in clips"
          :key="idx"
          :style="{
            left: `${(clip.startTime / totalDuration) * 100}%`,
            width: `${((clip.endTime - clip.startTime) / totalDuration) * 100}%`,
          }"
          class="absolute top-0 h-full bg-primary-600 border-r-2 border-white"
        >
          <div class="p-2 text-xs text-white truncate">
            {{ clip.type }}
          </div>
        </div>
      </div>

      <!-- Composition Options -->
      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Transition Style" name="transition">
          <USelect
            v-model="composition.transition"
            :items="['fade', 'dissolve', 'wipe', 'none']"
          />
        </UFormField>

        <UFormField label="Music Volume" name="musicVolume">
          <USlider
            v-model="composition.musicVolume"
            :min="0"
            :max="100"
          />
        </UFormField>
      </div>

      <UButton
        :loading="composing"
        size="lg"
        class="w-full"
        @click="startComposition"
      >
        <UIcon name="i-heroicons-film" class="mr-2" />
        Compose Video
      </UButton>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{
  clips: Array<{
    videoUrl: string
    voiceUrl?: string
    startTime: number
    endTime: number
    type: string
  }>
  totalDuration: number
}>()

const emit = defineEmits<{
  compose: [options: typeof composition]
}>()

const composition = reactive({
  transition: 'fade' as 'fade' | 'dissolve' | 'wipe' | 'none',
  musicVolume: 70,
})

const composing = ref(false)

const startComposition = async () => {
  composing.value = true
  try {
    emit('compose', { ...composition })
  } finally {
    composing.value = false
  }
}
</script>


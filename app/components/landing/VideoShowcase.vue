<template>
  <div
    :class="[
      'relative w-full',
      variant === 'desktop' ? 'hidden lg:block' : 'block lg:hidden',
    ]"
  >
    <div
      :class="[
        'bg-mendo-cream dark:bg-mendo-cream rounded-3xl shadow-2xl transition-transform duration-500',
        variant === 'desktop' ? 'p-3 sm:p-4 lg:p-6 transform rotate-1 hover:rotate-0' : 'p-3 sm:p-4 transform rotate-1',
      ]"
    >
      <div class="aspect-video bg-mendo-black rounded-2xl overflow-hidden relative border-4 border-mendo-black">
        <video
          autoplay
          loop
          muted
          playsinline
          class="w-full h-full object-cover"
        >
          <source :src="videoSrcWebm" type="video/webm">
          <source :src="videoSrcMp4" type="video/mp4">
        </video>
      </div>
      
      <LandingAIGeneratedBadge v-if="showBadge" />
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  videoSrc?: string
  showBadge?: boolean
  variant?: 'mobile' | 'desktop'
}

const props = withDefaults(defineProps<Props>(), {
  videoSrc: '/cameraguy',
  showBadge: true,
  variant: 'desktop',
})

const videoSrcWebm = computed(() => `${props.videoSrc}.webm`)
const videoSrcMp4 = computed(() => `${props.videoSrc}.MP4`)
</script>

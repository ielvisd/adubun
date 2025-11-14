<template>
  <div>
    <VideoPreview
      v-if="videoUrl"
      :video-url="videoUrl"
      :duration="duration"
      :cost="cost"
    />
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const videoUrl = ref(route.state?.videoUrl || '')
const duration = ref(route.state?.duration || 30)
const cost = ref(route.state?.cost || 0)

if (!videoUrl.value) {
  navigateTo('/')
}
</script>


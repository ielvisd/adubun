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

console.log('[Preview] Page mounted')
console.log('[Preview] Route query:', JSON.stringify(route.query, null, 2))
console.log('[Preview] Route params:', JSON.stringify(route.params, null, 2))
console.log('[Preview] Route state:', JSON.stringify(route.state, null, 2))

const videoUrl = ref(route.state?.videoUrl || route.query?.videoUrl as string || '')
const duration = ref(route.state?.duration || route.query?.duration ? Number(route.query.duration) : 30)
const cost = ref(route.state?.cost || route.query?.cost ? Number(route.query.cost) : 0)

console.log('[Preview] Extracted videoUrl:', videoUrl.value)
console.log('[Preview] Extracted duration:', duration.value)
console.log('[Preview] Extracted cost:', cost.value)

// Ensure videoUrl is a full URL if it's a relative path
if (videoUrl.value && !videoUrl.value.startsWith('http') && !videoUrl.value.startsWith('/')) {
  console.warn('[Preview] VideoUrl is not a valid URL or path:', videoUrl.value)
  videoUrl.value = `/api/watch/${route.query?.videoId || route.state?.videoId || ''}`
  console.log('[Preview] Converted videoUrl to:', videoUrl.value)
} else if (videoUrl.value && videoUrl.value.startsWith('/api/')) {
  console.log('[Preview] VideoUrl is already an API path:', videoUrl.value)
}

if (!videoUrl.value) {
  console.error('[Preview] No videoUrl found, redirecting to home')
  console.error('[Preview] Route state:', route.state)
  console.error('[Preview] Route query:', route.query)
  navigateTo('/')
} else {
  console.log('[Preview] Video URL is valid, proceeding to display')
}

onMounted(() => {
  console.log('[Preview] Component mounted, videoUrl:', videoUrl.value)
})
</script>


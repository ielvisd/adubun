<template>
  <div>
    <VideoPreview
      v-if="videoUrl"
      :video-url="videoUrl"
      :duration="duration"
      :cost="cost"
      :segments="segments"
    />
  </div>
</template>

<script setup lang="ts">
const route = useRoute()

const videoUrl = ref('')
const duration = ref(30)
const cost = ref(0)
const segments = ref<Array<{
  segmentId: number
  type: string
  audioNotes: string
  voiceUrl: string
  startTime: number
  endTime: number
}>>([])

// Load video data from sessionStorage or fallback to query params
onMounted(() => {
  console.log('[Preview] Page mounted')
  console.log('[Preview] Route query:', JSON.stringify(route.query, null, 2))
  console.log('[Preview] Route params:', JSON.stringify(route.params, null, 2))
  
  if (process.client) {
    try {
      // Try to load from sessionStorage first (new flow)
      const storedVideoData = sessionStorage.getItem('videoPreview')
      
      if (storedVideoData) {
        const videoData = JSON.parse(storedVideoData)
        console.log('[Preview] Video data loaded from sessionStorage:', JSON.stringify(videoData, null, 2))
        
        videoUrl.value = videoData.videoUrl || ''
        duration.value = videoData.duration || 30
        cost.value = videoData.cost || 0
        segments.value = videoData.segments || []
        
        console.log('[Preview] Extracted videoUrl:', videoUrl.value)
        console.log('[Preview] Extracted duration:', duration.value)
        console.log('[Preview] Extracted cost:', cost.value)
        console.log('[Preview] Segments with audio:', segments.value.length)
        console.log('[Preview] Segments details:', JSON.stringify(segments.value, null, 2))
        
        // Validate videoUrl
        if (!videoUrl.value) {
          console.error('[Preview] WARNING: videoUrl is empty in stored data')
        }
        
        // Validate segments
        if (segments.value.length === 0) {
          console.warn('[Preview] WARNING: No segments with audio found')
        } else {
          segments.value.forEach((seg: any, idx: number) => {
            if (!seg.audioNotes) {
              console.warn(`[Preview] WARNING: Segment ${idx} missing audioNotes`)
            }
            if (!seg.voiceUrl) {
              console.warn(`[Preview] WARNING: Segment ${idx} missing voiceUrl`)
            }
          })
        }
        
        // Clear sessionStorage after reading to avoid stale data
        sessionStorage.removeItem('videoPreview')
        console.log('[Preview] SessionStorage cleared')
      } else {
        // Fallback to query params (backward compatibility)
        console.log('[Preview] No sessionStorage data, checking query params')
        videoUrl.value = (route.query?.videoUrl as string) || ''
        duration.value = route.query?.duration ? Number(route.query.duration) : 30
        cost.value = route.query?.cost ? Number(route.query.cost) : 0
        
        // If we have videoId but no videoUrl, construct the URL
        if (!videoUrl.value && route.query?.videoId) {
          videoUrl.value = `/api/watch/${route.query.videoId}`
          console.log('[Preview] Constructed videoUrl from videoId:', videoUrl.value)
        }
      }
      
      // Ensure videoUrl is a full URL if it's a relative path
      if (videoUrl.value && !videoUrl.value.startsWith('http') && !videoUrl.value.startsWith('/')) {
        console.warn('[Preview] VideoUrl is not a valid URL or path:', videoUrl.value)
        const videoId = route.query?.videoId as string || ''
        if (videoId) {
          videoUrl.value = `/api/watch/${videoId}`
          console.log('[Preview] Converted videoUrl to:', videoUrl.value)
        }
      } else if (videoUrl.value && videoUrl.value.startsWith('/api/')) {
        console.log('[Preview] VideoUrl is already an API path:', videoUrl.value)
      }
      
      console.log('[Preview] Final videoUrl:', videoUrl.value)
      console.log('[Preview] Final duration:', duration.value)
      console.log('[Preview] Final cost:', cost.value)
      console.log('[Preview] Final segments count:', segments.value.length)
      
      if (!videoUrl.value) {
        console.error('[Preview] ERROR: No videoUrl found, redirecting to home')
        const toast = useToast()
        toast.add({
          title: 'Video not found',
          description: 'Unable to load video. Please try generating again.',
          color: 'error',
        })
        navigateTo('/')
      } else {
        console.log('[Preview] Video URL is valid, proceeding to display')
        if (segments.value.length > 0) {
          console.log('[Preview] Audio segments will be displayed:', segments.value.length)
        }
      }
    } catch (error) {
      console.error('[Preview] Failed to load video data:', error)
      navigateTo('/')
    }
  }
})
</script>


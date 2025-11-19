<template>
  <div class="mask-drawer space-y-3">
    <!-- Mode Toggle -->
    <div class="flex items-center justify-between">
      <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Video Preview & Mask</label>
      <UButton
        size="xs"
        variant="outline"
        @click="maskMode = !maskMode"
        :color="maskMode ? 'primary' : 'gray'"
      >
        <UIcon :name="maskMode ? 'i-heroicons-pencil' : 'i-heroicons-play'" class="mr-1 w-4 h-4" />
        {{ maskMode ? 'Mask Mode' : 'Preview Mode' }}
      </UButton>
    </div>
    
    <!-- Video Container with Canvas Overlay -->
    <div class="relative bg-black rounded-lg overflow-hidden" style="aspect-ratio: 16/9">
      <!-- Video Element -->
      <video
        ref="videoRef"
        :src="videoUrl"
        class="w-full h-full object-contain"
        :class="{ 'pointer-events-none': maskMode }"
        @loadedmetadata="onVideoLoaded"
        @timeupdate="onTimeUpdate"
        @play="isPlaying = true"
        @pause="isPlaying = false"
        @ended="handleVideoEnded"
      />
      
      <!-- Canvas Overlay (visible in both modes, but only interactive in mask mode) -->
      <canvas
        v-if="hasMask || maskMode"
        ref="canvasRef"
        class="absolute inset-0 w-full h-full"
        :style="{ opacity: maskVisible ? 1 : 0.3, pointerEvents: maskMode ? 'auto' : 'none' }"
        :class="maskMode ? (isDrawing ? 'cursor-none' : 'cursor-crosshair') : ''"
        @mousedown="handleCanvasMouseDown"
        @mousemove="handleCanvasMouseMove"
        @mouseup="handleCanvasMouseUp"
        @mouseleave="handleCanvasMouseUp"
        @touchstart.prevent="handleCanvasTouchStart"
        @touchmove.prevent="handleCanvasTouchMove"
        @touchend.prevent="handleCanvasMouseUp"
      />
      
      <!-- Brush cursor indicator -->
      <div
        v-if="maskMode && showCursor && !isDrawing"
        class="absolute pointer-events-none border-2 border-red-500 rounded-full"
        :style="{
          left: cursorPos.x - brushSize / 2 + 'px',
          top: cursorPos.y - brushSize / 2 + 'px',
          width: brushSize + 'px',
          height: brushSize + 'px',
        }"
      />
    </div>
    
    <!-- Controls (Outside video area) -->
    <div class="flex items-center justify-between gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <!-- Playback Controls (only in preview mode) -->
      <div v-if="!maskMode" class="flex items-center gap-2 flex-1">
        <UButton
          size="sm"
          variant="outline"
          @click="togglePlay"
        >
          <UIcon :name="isPlaying ? 'i-heroicons-pause' : 'i-heroicons-play'" class="w-4 h-4" />
        </UButton>
        
        <input
          v-model.number="currentFrame"
          type="range"
          :min="0"
          :max="totalFrames"
          class="flex-1"
          :disabled="isPlaying"
          @input="seekToFrame"
        />
        
        <span class="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
          {{ formatTime(Math.max(0, currentTime - (props.startOffset || 0))) }} / {{ formatTime(clipDuration) }}
        </span>
        
        <!-- Mask visibility toggle in preview mode -->
        <UButton
          v-if="hasMask"
          size="sm"
          variant="outline"
          @click="maskVisible = !maskVisible"
        >
          <UIcon :name="maskVisible ? 'i-heroicons-eye' : 'i-heroicons-eye-slash'" class="w-4 h-4" />
        </UButton>
        
        <!-- Clear mask button in preview mode -->
        <UButton
          v-if="hasMask"
          size="sm"
          variant="outline"
          color="red"
          @click="clearMask"
        >
          Clear
        </UButton>
      </div>
      
      <!-- Mask Controls (only in mask mode) -->
      <div v-else class="flex items-center gap-3 flex-1">
        <div class="flex items-center gap-2">
          <label class="text-xs text-gray-600 dark:text-gray-400">Brush:</label>
          <input
            v-model.number="brushSize"
            type="range"
            min="10"
            max="100"
            class="w-24"
          />
          <span class="text-xs text-gray-600 dark:text-gray-400 w-12">{{ brushSize }}px</span>
        </div>
        
        <UButton
          size="sm"
          variant="outline"
          @click="maskVisible = !maskVisible"
        >
          <UIcon :name="maskVisible ? 'i-heroicons-eye' : 'i-heroicons-eye-slash'" class="w-4 h-4" />
        </UButton>
        
        <UButton
          size="sm"
          variant="outline"
          color="red"
          @click="clearMask"
        >
          Clear
        </UButton>
      </div>
    </div>
    
    <!-- Instructions -->
    <UAlert v-if="maskMode" color="blue" variant="soft" class="text-xs">
      <template #description>
        <strong>How to use:</strong> Paint over the area you want to edit (shown in red). Everything you paint will be affected by your edit prompt. Unpainted areas will stay unchanged.
      </template>
    </UAlert>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  videoUrl: string
  startOffset?: number
  endOffset?: number
  originalDuration?: number
}>()

const emit = defineEmits<{
  maskCreated: [blob: Blob]
}>()

const videoRef = ref<HTMLVideoElement>()
const canvasRef = ref<HTMLCanvasElement>()
const maskMode = ref(false)
const isDrawing = ref(false)
const isPlaying = ref(false)
const brushSize = ref(30)
const maskVisible = ref(true)
const hasMask = ref(false)
const showCursor = ref(false)
const cursorPos = ref({ x: 0, y: 0 })
const currentTime = ref(0)
const currentFrame = ref(0)
const totalFrames = ref(0)

let ctx: CanvasRenderingContext2D | null = null
let videoWidth = 0
let videoHeight = 0

const clipDuration = computed(() => {
  if (!props.originalDuration) return 0
  return props.originalDuration - (props.startOffset || 0) - (props.endOffset || 0)
})

const onVideoLoaded = async () => {
  if (!videoRef.value) return
  
  const video = videoRef.value
  videoWidth = video.videoWidth
  videoHeight = video.videoHeight
  
  // Initialize canvas if it exists (wait for next tick if mask mode not enabled yet)
  await nextTick()
  if (canvasRef.value) {
    canvasRef.value.width = videoWidth
    canvasRef.value.height = videoHeight
    
    ctx = canvasRef.value.getContext('2d')
    if (ctx) {
      // Start with transparent canvas
      ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
    }
  }
  
  // Set initial time if we have offsets
  if (props.startOffset !== undefined && video) {
    video.currentTime = props.startOffset
    currentTime.value = props.startOffset
  }
  
  // Calculate total frames (assuming 30fps)
  totalFrames.value = Math.floor(clipDuration.value * 30)
  
  // Set initial frame to 0 (relative to clip start, not video start)
  currentFrame.value = 0
  
  // Set video end time
  const endTime = (props.originalDuration || video.duration) - (props.endOffset || 0)
  if (endTime < video.duration) {
    // We'll handle this in timeupdate
  }
}

const onTimeUpdate = () => {
  if (!videoRef.value) return
  
  const video = videoRef.value
  const endTime = (props.originalDuration || video.duration) - (props.endOffset || 0)
  
  // Stop video if it reaches the end
  if (video.currentTime >= endTime) {
    video.pause()
    video.currentTime = endTime
    isPlaying.value = false
  }
  
  currentTime.value = video.currentTime
  
  // Update frame based on time (relative to start offset)
  const startTime = props.startOffset || 0
  const relativeTime = Math.max(0, currentTime.value - startTime)
  const newFrame = Math.floor(relativeTime * 30)
  
  // Only update if frame actually changed to avoid infinite loops
  if (newFrame !== currentFrame.value && newFrame >= 0 && newFrame <= totalFrames.value) {
    currentFrame.value = newFrame
  }
}

const togglePlay = () => {
  if (!videoRef.value) return
  
  if (isPlaying.value) {
    videoRef.value.pause()
    isPlaying.value = false
  } else {
    const video = videoRef.value
    const startTime = props.startOffset || 0
    const endTime = (props.originalDuration || video.duration) - (props.endOffset || 0)
    
    // If at or past end, restart from beginning
    if (video.currentTime >= endTime) {
      video.currentTime = startTime
      currentTime.value = startTime
      currentFrame.value = 0
    }
    
    // Ensure we're within bounds before playing
    if (video.currentTime < startTime) {
      video.currentTime = startTime
      currentTime.value = startTime
    }
    
    video.play()
    isPlaying.value = true
  }
}

const seekToFrame = () => {
  if (!videoRef.value) return
  
  const startTime = props.startOffset || 0
  const endTime = (props.originalDuration || videoRef.value.duration) - (props.endOffset || 0)
  const targetTime = startTime + (currentFrame.value / 30)
  
  // Clamp to valid range
  const clampedTime = Math.max(startTime, Math.min(targetTime, endTime))
  videoRef.value.currentTime = clampedTime
  currentTime.value = clampedTime
  
  // Pause if playing (scrubbing should pause)
  if (isPlaying.value) {
    videoRef.value.pause()
    isPlaying.value = false
  }
}

const handleVideoEnded = () => {
  if (!videoRef.value) return
  
  const video = videoRef.value
  const startTime = props.startOffset || 0
  const endTime = (props.originalDuration || video.duration) - (props.endOffset || 0)
  
  // Clamp to end time
  video.currentTime = endTime
  isPlaying.value = false
  currentTime.value = endTime
  
  // Set frame to last frame (relative to clip)
  currentFrame.value = totalFrames.value
}

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = (seconds % 60).toFixed(1)
  return mins > 0 ? `${mins}:${secs.padStart(4, '0')}` : `${secs}s`
}

const getMousePos = (e: MouseEvent | Touch) => {
  if (!canvasRef.value) return { x: 0, y: 0 }
  
  const rect = canvasRef.value.getBoundingClientRect()
  const scaleX = canvasRef.value.width / rect.width
  const scaleY = canvasRef.value.height / rect.height
  
  const clientX = 'clientX' in e ? e.clientX : e.touches?.[0]?.clientX || 0
  const clientY = 'clientY' in e ? e.clientY : e.touches?.[0]?.clientY || 0
  
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  }
}

const handleCanvasMouseDown = (e: MouseEvent) => {
  if (maskMode.value) {
    startDrawing(e)
  }
}

const handleCanvasMouseMove = (e: MouseEvent) => {
  if (maskMode.value) {
    handleMouseMove(e)
  }
}

const handleCanvasMouseUp = () => {
  if (maskMode.value) {
    stopDrawing()
  }
}

const handleCanvasTouchStart = (e: TouchEvent) => {
  if (maskMode.value) {
    handleTouchStart(e)
  }
}

const handleCanvasTouchMove = (e: TouchEvent) => {
  if (maskMode.value) {
    handleTouchMove(e)
  }
}

const startDrawing = (e: MouseEvent) => {
  if (!maskMode.value || !ctx) return
  
  // Pause video when drawing starts
  if (videoRef.value) {
    videoRef.value.pause()
    isPlaying.value = false
  }
  
  isDrawing.value = true
  hasMask.value = true
  const pos = getMousePos(e)
  
  ctx.beginPath()
  ctx.moveTo(pos.x, pos.y)
  
  // Draw initial circle
  drawCircle(ctx, pos.x, pos.y, brushSize.value)
}

const drawCircle = (context: CanvasRenderingContext2D, x: number, y: number, radius: number) => {
  // Draw white circle for mask data (will be used in export)
  context.globalCompositeOperation = 'source-over'
  context.fillStyle = 'white'
  context.beginPath()
  context.arc(x, y, radius / 2, 0, Math.PI * 2)
  context.fill()
  
  // Draw red overlay on top for visibility
  context.globalCompositeOperation = 'source-atop'
  context.fillStyle = 'rgba(255, 0, 0, 0.6)' // More visible red overlay
  context.beginPath()
  context.arc(x, y, radius / 2, 0, Math.PI * 2)
  context.fill()
  
  context.globalCompositeOperation = 'source-over'
}

const handleMouseMove = (e: MouseEvent) => {
  if (!canvasRef.value) return
  
  // Update cursor position
  const rect = canvasRef.value.getBoundingClientRect()
  cursorPos.value = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  }
  showCursor.value = maskMode.value && !isDrawing.value
  
  if (!isDrawing.value || !ctx) return
  
  const pos = getMousePos(e)
  
  // Draw white line for mask data
  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = 'white'
  ctx.lineWidth = brushSize.value
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineTo(pos.x, pos.y)
  ctx.stroke()
  
  // Draw red overlay on top for visibility
  ctx.globalCompositeOperation = 'source-atop'
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)' // More visible red
  ctx.lineTo(pos.x, pos.y)
  ctx.stroke()
  
  // Draw circle at current position
  drawCircle(ctx, pos.x, pos.y, brushSize.value)
  
  ctx.globalCompositeOperation = 'source-over'
  ctx.beginPath()
  ctx.moveTo(pos.x, pos.y)
}

const stopDrawing = () => {
  isDrawing.value = false
  showCursor.value = false
}

const handleTouchStart = (e: TouchEvent) => {
  if (e.touches.length > 0) {
    startDrawing(e.touches[0] as any)
  }
}

const handleTouchMove = (e: TouchEvent) => {
  if (e.touches.length > 0) {
    handleMouseMove(e.touches[0] as any)
  }
}

const clearMask = () => {
  if (ctx && canvasRef.value) {
    ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
    hasMask.value = false
  }
}

// Watch mask mode to pause video when entering mask mode and initialize canvas
watch(maskMode, async (newMode) => {
  if (newMode && videoRef.value) {
    videoRef.value.pause()
    isPlaying.value = false
  }
  
  // Initialize canvas when switching modes (if canvas exists)
  await nextTick()
  if (canvasRef.value && videoRef.value) {
    const video = videoRef.value
    const width = video.videoWidth || videoWidth
    const height = video.videoHeight || videoHeight
    
    if (width && height) {
      canvasRef.value.width = width
      canvasRef.value.height = height
      
      ctx = canvasRef.value.getContext('2d')
      if (ctx && !hasMask.value) {
        // Only clear if no mask exists (preserve existing mask when switching to preview)
        ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
      }
    }
  }
})

// Export mask when component is used
const exportMask = () => {
  if (!canvasRef.value || !ctx || !hasMask.value) {
    console.warn('[MaskDrawer] Cannot export mask: canvas or context missing, or no mask drawn')
    return null
  }
  
  console.log('[MaskDrawer] Exporting mask...')
  console.log('[MaskDrawer] Canvas dimensions:', canvasRef.value.width, 'x', canvasRef.value.height)
  
  // Create a new canvas for the pure black/white mask
  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = canvasRef.value.width
  maskCanvas.height = canvasRef.value.height
  const maskCtx = maskCanvas.getContext('2d')
  
  if (!maskCtx) {
    console.error('[MaskDrawer] Failed to get 2D context for mask canvas')
    return null
  }
  
  // Fill with black background (preserve areas)
  maskCtx.fillStyle = 'black'
  maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height)
  
  // Get the drawn areas from the original canvas
  const imageData = ctx.getImageData(0, 0, canvasRef.value.width, canvasRef.value.height)
  const data = imageData.data
  
  console.log('[MaskDrawer] Original canvas image data length:', data.length)
  
  // Create mask data: white where we drew, black elsewhere
  const maskData = maskCtx.createImageData(maskCanvas.width, maskCanvas.height)
  
  let whitePixelCount = 0
  let blackPixelCount = 0
  let totalPixels = 0
  
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3]
    totalPixels++
    
    if (alpha > 0) {
      // If any alpha (we drew here), make it white (edit area)
      maskData.data[i] = 255     // R
      maskData.data[i + 1] = 255 // G
      maskData.data[i + 2] = 255 // B
      maskData.data[i + 3] = 255 // A
      whitePixelCount++
    } else {
      // Otherwise black (preserve area)
      maskData.data[i] = 0
      maskData.data[i + 1] = 0
      maskData.data[i + 2] = 0
      maskData.data[i + 3] = 255
      blackPixelCount++
    }
  }
  
  console.log('[MaskDrawer] Mask pixel analysis:')
  console.log('[MaskDrawer]   Total pixels:', totalPixels)
  console.log('[MaskDrawer]   White pixels (edit area):', whitePixelCount, `(${((whitePixelCount / totalPixels) * 100).toFixed(2)}%)`)
  console.log('[MaskDrawer]   Black pixels (preserve area):', blackPixelCount, `(${((blackPixelCount / totalPixels) * 100).toFixed(2)}%)`)
  
  if (whitePixelCount === 0) {
    console.error('[MaskDrawer] WARNING: Mask has zero white pixels! Mask will be completely black (no edit area)')
  }
  
  maskCtx.putImageData(maskData, 0, 0)
  
  // Convert to blob
  return new Promise<Blob | null>((resolve) => {
    maskCanvas.toBlob((blob) => {
      if (blob) {
        console.log('[MaskDrawer] Mask blob created successfully')
        console.log('[MaskDrawer] Mask blob size:', blob.size, 'bytes')
        console.log('[MaskDrawer] Mask blob type:', blob.type)
      } else {
        console.error('[MaskDrawer] Failed to create mask blob from canvas')
      }
      resolve(blob)
    }, 'image/png')
  })
}

// Expose methods (must be after all function definitions)
defineExpose({
  exportMask,
  clearMask,
  get hasMask() {
    return hasMask.value
  },
})
</script>

<style scoped>
.mask-drawer canvas {
  mix-blend-mode: normal;
}
</style>


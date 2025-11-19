<template>
  <!-- Fixed Overlay Background -->
  <Transition name="modal">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 overflow-y-auto"
      @click.self="handleClose"
    >
      <!-- Backdrop -->
      <div class="fixed inset-0 bg-black/50 backdrop-blur-sm" @click="handleClose" />
      
      <!-- Modal Container (centered) -->
      <div class="relative min-h-screen flex items-center justify-center p-4">
        <!-- Modal Content -->
        <div
          class="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Edit Frame Image
            </h3>
            <button
              type="button"
              @click="handleClose"
              class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <UIcon name="i-heroicons-x-mark" class="w-6 h-6" />
            </button>
          </div>

          <!-- Body (scrollable) -->
          <div class="flex-1 overflow-y-auto p-6">
            <!-- Tab Navigation -->
            <div class="mb-6">
              <div class="border-b border-gray-200 dark:border-gray-700">
                <nav class="-mb-px flex space-x-8" aria-label="Tabs">
                  <button
                    type="button"
                    v-for="(tab, idx) in tabs"
                    :key="tab.value"
                    @click.prevent="selectedTab = idx"
                    :class="[
                      selectedTab === idx
                        ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300',
                      'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm cursor-pointer'
                    ]"
                  >
                    {{ tab.label }}
                  </button>
                </nav>
              </div>
            </div>

            <!-- Upload Tab Content -->
            <div v-show="selectedTab === 0" class="space-y-4">
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Upload a new image to replace the current frame.
              </p>
              
              <!-- File Upload Area -->
              <div
                class="relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary-400 transition-colors"
                :class="isDragging ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-300 dark:border-gray-700'"
                @click.stop="triggerFileInput"
                @dragover.prevent="isDragging = true"
                @dragenter.prevent="isDragging = true"
                @dragleave.prevent="isDragging = false"
                @drop.prevent="handleFileDrop"
              >
                <input
                  ref="fileInputRef"
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="handleFileSelect"
                  @click.stop
                />
                
                <UIcon name="i-heroicons-cloud-arrow-up" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
                
                <div v-if="uploadedImage">
                  <img :src="uploadedImage" alt="Preview" class="max-w-xs mx-auto rounded-lg mb-4" />
                  <p class="text-sm text-green-600 dark:text-green-400 font-medium mb-2">✓ Image uploaded</p>
                </div>
                <div v-else>
                  <p class="text-base text-gray-700 dark:text-gray-300 font-medium mb-1">
                    Click to upload or drag and drop
                  </p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    PNG, JPG, GIF up to 10MB
                  </p>
                </div>
              </div>

              <div v-if="uploadedImage" class="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <UButton type="button" color="gray" variant="outline" @click.prevent="handleClose">
                  Cancel
                </UButton>
                <UButton type="button" color="primary" @click.prevent="handleUploadConfirm">
                  Replace Image
                </UButton>
              </div>
            </div>

            <!-- AI Edit Tab Content -->
            <div v-show="selectedTab === 1">
              <!-- Comparison View (After Generation) -->
              <div v-if="editedImageUrl && !isGenerating">
                <ImageComparisonView
                  :original-url="imageUrl"
                  :edited-url="editedImageUrl"
                  :loading="false"
                  @accept="handleAcceptEdit"
                  @reject="handleRejectEdit"
                />
              </div>

              <!-- Edit Form (Before Generation) -->
              <div v-else class="space-y-6">
                <!-- Loading State -->
                <div v-if="isGenerating" class="flex flex-col items-center justify-center py-12">
                  <UIcon name="i-heroicons-arrow-path" class="w-16 h-16 text-primary-500 animate-spin mb-4" />
                  <p class="text-lg font-semibold text-gray-900 dark:text-white">Generating edited image...</p>
                  <p class="text-sm text-gray-600 dark:text-gray-400">This may take 20-30 seconds</p>
                </div>

                <!-- Edit Form -->
                <div v-else class="space-y-6">
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    Describe how you'd like to modify the image. Optionally, draw on the image to specify which areas to edit.
                  </p>

                  <!-- Prompt Input -->
                  <div class="w-full">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Edit Prompt *
                    </label>
                    <UTextarea
                      v-model="editPrompt"
                      placeholder="e.g., Change the background to a sunset, make the product red, add snow..."
                      :rows="5"
                      class="w-full"
                    />
                  </div>

                  <!-- Draw Mask Controls -->
                  <div class="space-y-3">
                    <div class="flex items-center justify-between">
                      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Draw on Image to Create Mask (Optional)
                      </label>
                      <div class="flex items-center gap-2">
                        <UButton
                          size="xs"
                          :color="maskMode === 'draw' ? 'primary' : 'gray'"
                          variant="outline"
                          @click="maskMode = 'draw'"
                        >
                          <UIcon name="i-heroicons-pencil" class="w-3 h-3 mr-1" />
                          Draw
                        </UButton>
                        <UButton
                          size="xs"
                          :color="maskMode === 'erase' ? 'red' : 'gray'"
                          variant="outline"
                          @click="maskMode = 'erase'"
                        >
                          <UIcon name="i-heroicons-trash" class="w-3 h-3 mr-1" />
                          Erase
                        </UButton>
                        <UButton
                          v-if="hasMask"
                          size="xs"
                          color="gray"
                          variant="ghost"
                          @click="clearMask"
                        >
                          Clear All
                        </UButton>
                      </div>
                    </div>

                    <!-- Drawing Canvas -->
                    <div 
                      ref="canvasContainerRef"
                      class="relative bg-black rounded-lg overflow-hidden w-full border-2 border-gray-300 dark:border-gray-600"
                      style="height: 400px;"
                    >
                      <canvas
                        ref="drawingCanvasRef"
                        class="absolute inset-0"
                        :style="{
                          cursor: isDrawing ? 'none' : (showBrushCursor ? 'crosshair' : 'default'),
                          touchAction: 'none'
                        }"
                        @mousedown="startDrawing"
                        @mousemove="draw"
                        @mouseup="stopDrawing"
                        @mouseleave="stopDrawing"
                      />
                      
                      <!-- Brush Cursor (only shows within image bounds) -->
                      <div
                        v-if="showBrushCursor && !isDrawing"
                        class="absolute rounded-full pointer-events-none border-2"
                        :class="maskMode === 'draw' ? 'border-red-500 bg-red-500/30' : 'border-blue-500 bg-blue-500/30'"
                        :style="{
                          left: brushCursor.x - brushSize / 2 + 'px',
                          top: brushCursor.y - brushSize / 2 + 'px',
                          width: brushSize + 'px',
                          height: brushSize + 'px',
                        }"
                      />
                    </div>

                    <!-- Brush Size Control -->
                    <div class="flex items-center gap-3">
                      <label class="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        Brush Size: {{ brushSize }}px
                      </label>
                      <input
                        v-model.number="brushSize"
                        type="range"
                        min="5"
                        max="80"
                        step="5"
                        class="flex-1"
                      />
                    </div>

                    <p class="text-xs text-gray-500 dark:text-gray-400">
                      Draw in red over the areas you want to edit. Drawing is constrained to the image area only (black bars are not drawable). The mask will be properly scaled to match your image dimensions.
                    </p>
                  </div>

                  <!-- Generate Button -->
                  <div class="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <UButton
                      color="gray"
                      variant="outline"
                      @click="handleClose"
                    >
                      Cancel
                    </UButton>
                    <UButton
                      color="primary"
                      @click="handleGenerate"
                      :disabled="!editPrompt.trim()"
                    >
                      <UIcon name="i-heroicons-sparkles" class="mr-2" />
                      Generate
                    </UButton>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import ImageComparisonView from './ImageComparisonView.vue'

const props = defineProps<{
  modelValue: boolean
  imageUrl: string
  segmentIndex: number
  frameType: 'firstFrameImage' | 'lastFrameImage'
  aspectRatio: '16:9' | '9:16'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'image-replaced': [payload: { imageUrl: string; segmentIndex: number; frameType: string }]
  close: []
}>()

// Modal state
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

// Tab management
const selectedTab = ref(0)
const tabs = [
  { label: 'Upload', value: 'upload' },
  { label: 'AI Edit', value: 'ai-edit' },
]

// Upload tab state
const fileInputRef = ref<HTMLInputElement>()
const uploadedImage = ref<string | null>(null)
const isDragging = ref(false)

// AI Edit tab state
const editPrompt = ref('')
const editedImageUrl = ref<string | null>(null)
const isGenerating = ref(false)

// Drawing canvas state
const canvasContainerRef = ref<HTMLDivElement>()
const drawingCanvasRef = ref<HTMLCanvasElement>()
const isDrawing = ref(false)
const maskMode = ref<'draw' | 'erase'>('draw')
const brushSize = ref(30)
const hasMask = ref(false)
const showBrushCursor = ref(false)
const brushCursor = ref({ x: 0, y: 0 })
const lastPoint = ref<{ x: number; y: number } | null>(null)

// Image for canvas background
const loadedImage = ref<HTMLImageElement | null>(null)
const imageRenderBounds = ref<{ x: number; y: number; width: number; height: number } | null>(null)

// Initialize canvas when modal opens and AI Edit tab is selected
watch([isOpen, selectedTab], async ([open, tab]) => {
  if (open && tab === 1) {
    await nextTick()
    setTimeout(() => {
      initializeCanvas()
    }, 150)
  }
})

// Initialize canvas with image background
const initializeCanvas = async () => {
  const canvas = drawingCanvasRef.value
  const container = canvasContainerRef.value
  if (!canvas || !container) return

  // Wait for container to be visible and have dimensions
  let rect = container.getBoundingClientRect()
  let attempts = 0
  while ((rect.width === 0 || rect.height === 0) && attempts < 10) {
    await new Promise(resolve => setTimeout(resolve, 50))
    rect = container.getBoundingClientRect()
    attempts++
  }

  // Set canvas size to match container
  canvas.width = rect.width || 800 // Fallback if still 0
  canvas.height = rect.height || 400 // Fallback if still 0

  // Load and draw the base image
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = props.imageUrl
  
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
  })

  loadedImage.value = img

  // Draw image on canvas
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Draw image (centered and fitted) - calculate bounds
  const scale = Math.min(canvas.width / img.width, canvas.height / img.height)
  const x = (canvas.width - img.width * scale) / 2
  const y = (canvas.height - img.height * scale) / 2
  const width = img.width * scale
  const height = img.height * scale
  
  // Store the actual render bounds for drawing constraint
  imageRenderBounds.value = { x, y, width, height }
  
  ctx.drawImage(img, x, y, width, height)
}

// Check if a point is within the image bounds
const isPointInImage = (x: number, y: number): boolean => {
  if (!imageRenderBounds.value) return false
  const bounds = imageRenderBounds.value
  return x >= bounds.x && x <= bounds.x + bounds.width &&
         y >= bounds.y && y <= bounds.y + bounds.height
}

// Drawing handlers
const startDrawing = (e: MouseEvent) => {
  e.preventDefault()
  const canvas = drawingCanvasRef.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  // Only start drawing if within image bounds
  if (!isPointInImage(x, y)) return

  isDrawing.value = true
  lastPoint.value = { x, y }
  drawAt(x, y)
}

const draw = (e: MouseEvent) => {
  const canvas = drawingCanvasRef.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  brushCursor.value = { x, y }
  
  // Show cursor only if within image bounds
  showBrushCursor.value = isPointInImage(x, y)

  if (isDrawing.value && lastPoint.value && isPointInImage(x, y)) {
    drawLine(lastPoint.value.x, lastPoint.value.y, x, y)
    lastPoint.value = { x, y }
  }
}

const stopDrawing = () => {
  isDrawing.value = false
  lastPoint.value = null
  showBrushCursor.value = false
}

const drawAt = (x: number, y: number) => {
  const canvas = drawingCanvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  if (maskMode.value === 'erase') {
    // Erase mode: redraw the image in this area
    if (loadedImage.value) {
      const img = loadedImage.value
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height)
      const imgX = (canvas.width - img.width * scale) / 2
      const imgY = (canvas.height - img.height * scale) / 2

      ctx.save()
      ctx.globalCompositeOperation = 'source-over'
      ctx.beginPath()
      ctx.arc(x, y, brushSize.value / 2, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(img, imgX, imgY, img.width * scale, img.height * scale)
      ctx.restore()
    }
  } else {
    // Draw mode: paint red mask
    ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'
    ctx.beginPath()
    ctx.arc(x, y, brushSize.value / 2, 0, Math.PI * 2)
    ctx.fill()
    hasMask.value = true
  }
}

const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
  const canvas = drawingCanvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  if (maskMode.value === 'erase') {
    // Erase mode
    if (loadedImage.value) {
      const img = loadedImage.value
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height)
      const imgX = (canvas.width - img.width * scale) / 2
      const imgY = (canvas.height - img.height * scale) / 2

      ctx.save()
      ctx.globalCompositeOperation = 'source-over'
      ctx.lineWidth = brushSize.value
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.clip()
      ctx.drawImage(img, imgX, imgY, img.width * scale, img.height * scale)
      ctx.restore()
    }
  } else {
    // Draw mode
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'
    ctx.lineWidth = brushSize.value
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    hasMask.value = true
  }
}

const clearMask = () => {
  hasMask.value = false
  initializeCanvas()
}

// Extract mask from canvas, properly normalized to image dimensions
const getMaskDataUrl = (): string | null => {
  if (!hasMask.value || !imageRenderBounds.value) return null
  
  const canvas = drawingCanvasRef.value
  const img = loadedImage.value
  if (!canvas || !img) return null

  const bounds = imageRenderBounds.value

  // Create a reference canvas with just the original image at render size
  const refCanvas = document.createElement('canvas')
  refCanvas.width = canvas.width
  refCanvas.height = canvas.height
  const refCtx = refCanvas.getContext('2d')
  if (!refCtx) return null
  refCtx.drawImage(img, bounds.x, bounds.y, bounds.width, bounds.height)

  // Get pixel data from both canvases
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  
  const drawingData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const refData = refCtx.getImageData(0, 0, canvas.width, canvas.height)

  // Create mask at canvas size first
  const tempMaskCanvas = document.createElement('canvas')
  tempMaskCanvas.width = canvas.width
  tempMaskCanvas.height = canvas.height
  const tempMaskCtx = tempMaskCanvas.getContext('2d')
  if (!tempMaskCtx) return null

  const maskData = tempMaskCtx.createImageData(canvas.width, canvas.height)
  
  // Compare pixels to detect red mask
  for (let i = 0; i < drawingData.data.length; i += 4) {
    const drawR = drawingData.data[i]
    const drawG = drawingData.data[i + 1]
    const drawB = drawingData.data[i + 2]
    
    const refR = refData.data[i]
    const refG = refData.data[i + 1]
    const refB = refData.data[i + 2]

    // Check if red mask was applied (red channel increased, others decreased/same)
    const isRedMask = (drawR > refR + 50) && (drawG < refG + 30) && (drawB < refB + 30)
    
    if (isRedMask) {
      // White = area to edit
      maskData.data[i] = 255
      maskData.data[i + 1] = 255
      maskData.data[i + 2] = 255
      maskData.data[i + 3] = 255
    } else {
      // Black = area to keep
      maskData.data[i] = 0
      maskData.data[i + 1] = 0
      maskData.data[i + 2] = 0
      maskData.data[i + 3] = 255
    }
  }

  tempMaskCtx.putImageData(maskData, 0, 0)

  // Now crop to just the image area and scale to actual image dimensions
  const finalMaskCanvas = document.createElement('canvas')
  finalMaskCanvas.width = img.width
  finalMaskCanvas.height = img.height
  const finalMaskCtx = finalMaskCanvas.getContext('2d')
  if (!finalMaskCtx) return null

  // Draw only the image area from temp mask, scaled to original image size
  finalMaskCtx.drawImage(
    tempMaskCanvas,
    bounds.x, bounds.y, bounds.width, bounds.height,  // Source: rendered image area
    0, 0, img.width, img.height                        // Dest: full original dimensions
  )

  return finalMaskCanvas.toDataURL('image/png')
}

// Upload tab handlers
const triggerFileInput = () => {
  fileInputRef.value?.click()
}

const handleFileSelect = (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    processFile(file)
  }
}

const handleFileDrop = (e: DragEvent) => {
  isDragging.value = false
  const file = e.dataTransfer?.files[0]
  if (file) {
    processFile(file)
  }
}

const processFile = (file: File) => {
  if (!file.type.startsWith('image/')) {
    alert('Please upload an image file')
    return
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    uploadedImage.value = e.target?.result as string
  }
  reader.readAsDataURL(file)
}

const handleUploadConfirm = async () => {
  if (!uploadedImage.value) return

  try {
    // Upload to S3
    const response = await $fetch<{ url: string }>('/api/upload-images-s3', {
      method: 'POST',
      body: {
        images: [uploadedImage.value],
        type: 'edited_frames',
      },
    })

    // Emit the new image URL
    emit('image-replaced', {
      imageUrl: response.url,
      segmentIndex: props.segmentIndex,
      frameType: props.frameType,
    })

    // Close modal
    handleClose()
  } catch (error) {
    console.error('Failed to upload image:', error)
    alert('Failed to upload image. Please try again.')
  }
}

// AI Edit handlers
const handleGenerate = async () => {
  if (!editPrompt.value.trim()) return

  isGenerating.value = true
  editedImageUrl.value = null

  try {
    const mask = getMaskDataUrl()

    const response = await $fetch<{ imageUrl: string }>('/api/edit-frame-image', {
      method: 'POST',
      body: {
        imageUrl: props.imageUrl,
        prompt: editPrompt.value,
        ...(mask ? { mask } : {}), // Only include mask if it exists
        aspectRatio: props.aspectRatio,
        segmentIndex: props.segmentIndex,
      },
    })

    editedImageUrl.value = response.imageUrl
  } catch (error: any) {
    console.error('Failed to generate edited image:', error)
    const errorMessage = error.data?.message || error.message || 'Failed to generate edited image. Please try again.'
    alert(`Image generation failed: ${errorMessage}`)
    isGenerating.value = false
  } finally {
    isGenerating.value = false
  }
}

const handleAcceptEdit = () => {
  if (!editedImageUrl.value) return

  emit('image-replaced', {
    imageUrl: editedImageUrl.value,
    segmentIndex: props.segmentIndex,
    frameType: props.frameType,
  })

  handleClose()
}

const handleRejectEdit = async () => {
  editedImageUrl.value = null
  editPrompt.value = ''
  hasMask.value = false
  isDrawing.value = false
  lastPoint.value = null
  showBrushCursor.value = false
  
  // Wait for DOM to update (canvas section to become visible again)
  await nextTick()
  
  // Wait a bit more for the container to be properly sized
  setTimeout(async () => {
    await initializeCanvas()
  }, 100)
}

// Modal handlers
const handleClose = () => {
  // Reset state
  selectedTab.value = 0
  uploadedImage.value = null
  editPrompt.value = ''
  editedImageUrl.value = null
  isGenerating.value = false
  hasMask.value = false
  isDrawing.value = false
  lastPoint.value = null
  showBrushCursor.value = false
  loadedImage.value = null

  emit('update:modelValue', false)
  emit('close')
}

// Prevent body scroll when modal is open
watch(isOpen, (open) => {
  if (open) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})

// Cleanup on unmount
onUnmounted(() => {
  document.body.style.overflow = ''
})
</script>

<style scoped>
/* Modal transition */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .relative,
.modal-leave-active .relative {
  transition: transform 0.2s ease;
}

.modal-enter-from .relative,
.modal-leave-to .relative {
  transform: scale(0.95);
}
</style>

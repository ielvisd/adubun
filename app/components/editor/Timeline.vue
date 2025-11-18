<template>
  <div class="w-full">
    <!-- Timeline Header -->
    <div class="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
      <h4 class="font-semibold text-gray-100">Timeline</h4>
      <div class="flex items-center gap-4">
        <!-- Zoom Controls -->
        <div class="flex items-center gap-2 bg-gray-800 rounded-lg px-2 py-1">
          <button
            @click="zoomOut"
            :disabled="zoomLevel <= 0.25"
            class="p-1 hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Zoom Out"
          >
            <UIcon name="i-heroicons-minus" class="w-4 h-4 text-gray-300" />
          </button>
          <span class="text-xs text-gray-300 min-w-[50px] text-center font-medium">
            {{ Math.round(zoomLevel * 100) }}%
          </span>
          <button
            @click="zoomIn"
            :disabled="zoomLevel >= 4"
            class="p-1 hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Zoom In"
          >
            <UIcon name="i-heroicons-plus" class="w-4 h-4 text-gray-300" />
          </button>
          <button
            @click="resetZoom"
            class="p-1 hover:bg-gray-700 rounded transition-colors"
            title="Reset Zoom"
          >
            <UIcon name="i-heroicons-arrows-pointing-out" class="w-4 h-4 text-gray-300" />
          </button>
        </div>
        <div class="text-sm text-gray-400">
          {{ formatTime(totalDuration) }}
        </div>
      </div>
    </div>

    <!-- Timeline Container -->
    <div 
      ref="timelineContainer"
      class="relative bg-gray-900 rounded-lg border border-gray-800 overflow-x-auto"
      @click="handleTimelineClick"
      @mousemove="handleTimelineMouseMove"
      @wheel.prevent="handleWheel"
      style="scrollbar-width: thin; scrollbar-color: #4b5563 #1f2937;"
    >
      <!-- Time Ruler -->
      <div class="sticky top-0 z-20 bg-gray-900 border-b border-gray-800" :style="{ width: `${timelineWidth}px`, minWidth: '100%' }">
        <div class="relative h-10">
          <div
            v-for="mark in timeMarks"
            :key="mark"
            class="absolute border-l border-gray-700"
            :style="{ left: `${mark * pixelsPerSecond}px` }"
          >
            <span class="absolute -top-6 left-0 text-xs text-gray-400 whitespace-nowrap font-medium">
              {{ formatTime(mark) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Video Clips Track -->
      <div class="relative bg-gray-950" :style="{ width: `${timelineWidth}px`, minWidth: '100%', height: '140px' }">
        <!-- Grid Background -->
        <div 
          class="absolute inset-0 opacity-20"
          :style="{
            backgroundImage: `repeating-linear-gradient(to right, transparent, transparent ${pixelsPerSecond}px, #374151 ${pixelsPerSecond}px, #374151 ${pixelsPerSecond * 2}px)`
          }"
        />

        <!-- Clips -->
        <div
          v-for="(clip, index) in clips"
          :key="clip.id"
          ref="clipElements"
          class="absolute bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg border-2 border-blue-400 cursor-move hover:from-blue-500 hover:to-blue-400 transition-all shadow-lg select-none group"
          :class="{ 
            'ring-2 ring-yellow-400 ring-offset-2 ring-offset-gray-950': isClipSelected(clip.id),
            'opacity-60': draggingClipId === clip.id,
            'z-10': draggingClipId === clip.id || isClipSelected(clip.id),
            'z-0': draggingClipId !== clip.id && !isClipSelected(clip.id)
          }"
          :style="getClipStyle(clip)"
          @mousedown.stop="handleClipMouseDown($event, clip, index)"
        >
          <!-- Clip Content -->
          <div class="h-full flex items-center justify-between px-4 text-white text-sm pointer-events-none">
            <div class="flex items-center gap-2 flex-1 min-w-0">
              <div class="w-2 h-2 bg-white rounded-full"></div>
              <span class="font-semibold truncate">{{ clip.name || `Clip ${index + 1}` }}</span>
              <span class="text-xs opacity-75">{{ formatTime(getClipDuration(clip)) }}</span>
            </div>
            <div class="flex items-center gap-1">
              <button
                v-if="getClipDuration(clip) < 5 && isClipSelected(clip.id)"
                @click.stop="$emit('aleph-edit', clip)"
                class="p-1.5 hover:bg-purple-600 bg-purple-700 rounded-lg transition-colors pointer-events-auto opacity-0 group-hover:opacity-100"
                title="Edit with AI (Aleph)"
              >
                <UIcon name="i-heroicons-sparkles" class="w-4 h-4" />
              </button>
              <button
                @click.stop="$emit('delete', clip.id)"
                class="p-1.5 hover:bg-white/20 rounded-lg transition-colors pointer-events-auto opacity-0 group-hover:opacity-100"
                title="Delete"
              >
                <UIcon name="i-heroicons-trash" class="w-4 h-4" />
              </button>
            </div>
          </div>
          <!-- Start/End Labels -->
          <div class="absolute inset-0 pointer-events-none text-xs font-medium text-white/80">
            <span class="absolute top-1 left-3 bg-black/30 px-2 py-0.5 rounded-full backdrop-blur-sm">
              {{ formatTime(clip.startOffset) }}
            </span>
            <span class="absolute top-1 right-3 bg-black/30 px-2 py-0.5 rounded-full backdrop-blur-sm">
              {{ formatTime(clip.originalDuration - clip.endOffset) }}
            </span>
          </div>

          <!-- Left Trim Handle (Start) -->
          <div
            class="absolute left-0 top-0 bottom-0 w-4 bg-blue-700 cursor-ew-resize hover:bg-blue-600 rounded-l-lg flex items-center justify-center group/trim z-20"
            @mousedown.stop="startTrimStart($event, clip)"
            title="Trim start"
          >
            <div class="w-0.5 h-12 bg-white/70 rounded group-hover/trim:bg-white transition-colors"></div>
          </div>
          
          <!-- Right Trim Handle (End) -->
          <div
            class="absolute right-0 top-0 bottom-0 w-4 bg-blue-700 cursor-ew-resize hover:bg-blue-600 rounded-r-lg flex items-center justify-center group/trim z-20"
            @mousedown.stop="startTrimEnd($event, clip)"
            title="Trim end"
          >
            <div class="w-0.5 h-12 bg-white/70 rounded group-hover/trim:bg-white transition-colors"></div>
          </div>

          <!-- Duration Tooltip (while trimming) -->
          <div 
            v-if="trimmingClipId === clip.id"
            class="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-30 border border-gray-700"
          >
            {{ formatTime(getClipDuration(clip)) }}
          </div>
        </div>

        <!-- Playhead -->
        <div
          class="absolute top-0 bottom-0 w-0.5 bg-red-500 z-40 pointer-events-none shadow-lg"
          :style="{ left: `${currentTime * pixelsPerSecond}px` }"
        >
          <div class="absolute -top-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-transparent border-t-red-500" />
        </div>

        <!-- Snap Indicator -->
        <div
          v-if="snapPosition !== null"
          class="absolute top-0 bottom-0 w-0.5 bg-yellow-400 z-35 pointer-events-none"
          :style="{ left: `${snapPosition * pixelsPerSecond}px` }"
        />
      </div>

      <!-- Empty State -->
      <div v-if="clips.length === 0" class="flex items-center justify-center py-16 text-gray-500">
        <div class="text-center">
          <UIcon name="i-heroicons-film" class="w-16 h-16 mx-auto mb-3 opacity-30" />
          <p class="text-sm font-medium">No clips on timeline</p>
          <p class="text-xs mt-1">Add videos from the media bin to get started</p>
        </div>
      </div>
    </div>

    <!-- Instructions -->
    <div class="mt-3 flex items-center gap-4 text-xs text-gray-400">
      <div class="flex items-center gap-1">
        <UIcon name="i-heroicons-arrows-pointing-out" class="w-4 h-4" />
        <span>Drag clips to reorder</span>
      </div>
      <div class="flex items-center gap-1">
        <UIcon name="i-heroicons-scissors" class="w-4 h-4" />
        <span>Drag handles to trim</span>
      </div>
      <div class="flex items-center gap-1">
        <UIcon name="i-heroicons-magnifying-glass" class="w-4 h-4" />
        <span>Ctrl+Scroll to zoom</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface EditorClip {
  id: string
  videoId: string
  sourceUrl: string
  originalDuration: number
  startOffset: number
  endOffset: number
  inTimelineStart: number
  name: string
}

const props = defineProps<{
  clips: EditorClip[]
  currentTime: number
  snapThreshold?: number
}>()

interface SeekOptions {
  keepPlaying?: boolean
}

const emit = defineEmits<{
  'trim': [clipId: string, startOffset: number, endOffset: number]
  'split': [clipId: string, time: number]
  'delete': [clipId: string]
  'seek': [time: number, options?: SeekOptions]
  'reorder': [clips: EditorClip[], options?: { finalize?: boolean }]
  'aleph-edit': [clip: EditorClip]
}>()

const timelineContainer = ref<HTMLElement>()
const clipElements = ref<HTMLElement[]>([])
const trimmingClipId = ref<string | null>(null)
const draggingClipId = ref<string | null>(null)
const snapPosition = ref<number | null>(null)
const selectedClipId = ref<string | null>(null)
const zoomLevel = ref(1) // 1x = 50px per second (normalized so old 200% becomes new 100%)

const pixelsPerSecond = computed(() => {
  return 50 * zoomLevel.value // Base: 50px per second (old 200% now 100%)
})

const totalDuration = computed(() => {
  if (props.clips.length === 0) return 0
  return props.clips.reduce((sum, clip) => {
    return sum + getClipDuration(clip)
  }, 0)
})

const MIN_TIMELINE_SECONDS = 120

const visualDuration = computed(() => {
  return Math.max(MIN_TIMELINE_SECONDS, totalDuration.value + 5)
})

const timelineWidth = computed(() => {
  return Math.max(1600, visualDuration.value * pixelsPerSecond.value)
})

const timeMarks = computed(() => {
  const marks: number[] = []
  // Adjust interval based on zoom level
  const interval = zoomLevel.value >= 2 ? 1 : zoomLevel.value >= 1 ? 5 : 10
  for (let i = 0; i <= visualDuration.value; i += interval) {
    marks.push(i)
  }
  return marks
})

const getClipDuration = (clip: EditorClip): number => {
  return clip.originalDuration - clip.startOffset - clip.endOffset
}

const getClipStyle = (clip: EditorClip) => {
  const duration = getClipDuration(clip)
  return {
    left: `${clip.inTimelineStart * pixelsPerSecond.value}px`,
    width: `${duration * pixelsPerSecond.value}px`,
    height: '120px',
    top: '10px',
    minWidth: '60px', // Minimum width for visibility
  }
}

const isClipSelected = (clipId: string) => {
  return selectedClipId.value === clipId
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const zoomIn = () => {
  zoomLevel.value = Math.min(4, zoomLevel.value + 0.25)
}

const zoomOut = () => {
  zoomLevel.value = Math.max(0.25, zoomLevel.value - 0.25)
}

const resetZoom = () => {
  zoomLevel.value = 1
}

onMounted(() => {
  zoomLevel.value = 1
})

const handleWheel = (event: WheelEvent) => {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    if (event.deltaY < 0) {
      zoomIn()
    } else {
      zoomOut()
    }
  }
}

const handleTimelineClick = (event: MouseEvent) => {
  if (trimmingClipId.value || draggingClipId.value) return // Don't seek while trimming/dragging
  
  const rect = timelineContainer.value?.getBoundingClientRect()
  if (!rect) return
  
  const scrollLeft = timelineContainer.value?.scrollLeft || 0
  const x = event.clientX - rect.left + scrollLeft
  const time = x / pixelsPerSecond.value
  emit('seek', Math.max(0, Math.min(time, totalDuration.value)))
}

const handleTimelineMouseMove = (event: MouseEvent) => {
  if (!trimmingClipId.value) {
    snapPosition.value = null
    return
  }
  
  // Check for snap points while trimming
  const rect = timelineContainer.value?.getBoundingClientRect()
  if (!rect) return
  
  const scrollLeft = timelineContainer.value?.scrollLeft || 0
  const x = event.clientX - rect.left + scrollLeft
  const mouseTime = x / pixelsPerSecond.value
  
  // Check snap to playhead
  const playheadDistance = Math.abs(mouseTime - props.currentTime)
  const snapThreshold = (props.snapThreshold || 8) / pixelsPerSecond.value
  if (playheadDistance < snapThreshold) {
    snapPosition.value = props.currentTime
    return
  }
  
  // Check snap to clip edges
  let closestSnap: number | null = null
  let closestDistance = Infinity
  
  props.clips.forEach(clip => {
    const clipStart = clip.inTimelineStart
    const clipEnd = clip.inTimelineStart + getClipDuration(clip)
    
    const startDist = Math.abs(mouseTime - clipStart)
    const endDist = Math.abs(mouseTime - clipEnd)
    
    if (startDist < closestDistance) {
      closestDistance = startDist
      closestSnap = clipStart
    }
    if (endDist < closestDistance) {
      closestDistance = endDist
      closestSnap = clipEnd
    }
  })
  
  if (closestDistance < snapThreshold) {
    snapPosition.value = closestSnap
  } else {
    snapPosition.value = null
  }
}

const lastReorderedClips = ref<EditorClip[] | null>(null)

const handleClipMouseDown = (event: MouseEvent, clip: EditorClip, index: number) => {
  // Only drag if clicking on the clip body, not on trim handles
  const target = event.target as HTMLElement
  if (target.closest('.cursor-ew-resize')) {
    return // Let trim handles handle their own events
  }
  
  event.preventDefault()
  event.stopPropagation()
  
  selectedClipId.value = clip.id
  draggingClipId.value = clip.id
  
  const timelineRect = timelineContainer.value?.getBoundingClientRect()
  if (!timelineRect) return
  
  const initialScrollLeft = timelineContainer.value?.scrollLeft || 0
  const startX = event.clientX - timelineRect.left + initialScrollLeft
  const startTime = clip.inTimelineStart
  const clipDuration = getClipDuration(clip)

  // Check for snap points while dragging
  const checkSnapPoints = (time: number) => {
    snapPosition.value = null
    
    // Snap to playhead
    const playheadDistance = Math.abs(time - props.currentTime)
    const snapThreshold = 0.2 // 200ms snap threshold
    if (playheadDistance < snapThreshold) {
      snapPosition.value = props.currentTime
      return
    }
    
    // Snap to other clip edges
    let closestSnap: number | null = null
    let closestDistance = Infinity
    
    props.clips.forEach(c => {
      if (c.id === clip.id) return
      
      const clipStart = c.inTimelineStart
      const clipEnd = c.inTimelineStart + getClipDuration(c)
      
      const startDist = Math.abs(time - clipStart)
      const endDist = Math.abs(time - clipEnd)
      
      if (startDist < closestDistance) {
        closestDistance = startDist
        closestSnap = clipStart
      }
      if (endDist < closestDistance) {
        closestDistance = endDist
        closestSnap = clipEnd
      }
    })
    
    if (closestDistance < snapThreshold) {
      snapPosition.value = closestSnap
    }
  }

  let animationFrameId: number | null = null

  const handleMouseMove = (e: MouseEvent) => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
    }

    animationFrameId = requestAnimationFrame(() => {
      const currentScrollLeft = timelineContainer.value?.scrollLeft || 0
      const currentX = e.clientX - timelineRect.left + currentScrollLeft
      const deltaX = currentX - startX
      const deltaTime = deltaX / pixelsPerSecond.value
      
      let newStartTime = startTime + deltaTime
      
      // Allow overlap beyond edges (CapCut-style) so clips can pass ends while reordering
      const minStart = -clipDuration + 0.05
      const maxStart = visualDuration.value - 0.05
      newStartTime = Math.max(minStart, Math.min(newStartTime, maxStart))
      
      // Check for snapping
      checkSnapPoints(newStartTime)
      if (snapPosition.value !== null) {
        const snapDistance = Math.abs(newStartTime - snapPosition.value)
        if (snapDistance < 0.1) {
          newStartTime = snapPosition.value
        }
      }
      
      // Update clip position on a cloned array
      const updatedClips = props.clips.map(c => ({ ...c }))
      const draggedClip = updatedClips.find(c => c.id === clip.id)
      if (!draggedClip) return
      draggedClip.inTimelineStart = newStartTime

      // Sort clips by timeline start to mimic CapCut ordering
      const reordered = [...updatedClips].sort((a, b) => a.inTimelineStart - b.inTimelineStart)
      lastReorderedClips.value = reordered
      
      emit('reorder', reordered, { finalize: false })
    })
  }

  const handleMouseUp = () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
    }
    draggingClipId.value = null
    snapPosition.value = null
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)

    if (lastReorderedClips.value) {
      emit('reorder', lastReorderedClips.value, { finalize: true })
      lastReorderedClips.value = null
    }
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

const startTrimStart = (event: MouseEvent, clip: EditorClip) => {
  event.stopPropagation()
  event.preventDefault()
  
  trimmingClipId.value = clip.id
  selectedClipId.value = clip.id
  
  const startX = event.clientX
  const initialStartOffset = clip.startOffset

  let animationFrameId: number | null = null

  const handleMouseMove = (e: MouseEvent) => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
    }

    animationFrameId = requestAnimationFrame(() => {
      const deltaX = e.clientX - startX
      const deltaTime = deltaX / pixelsPerSecond.value
      
      // Calculate new start offset
      let newStartOffset = initialStartOffset + deltaTime
      
      // Clamp to valid range
      newStartOffset = Math.max(0, Math.min(newStartOffset, clip.originalDuration - clip.endOffset - 0.1))
      
      // Apply snap if active
      if (snapPosition.value !== null) {
        const clipStartTime = clip.inTimelineStart
        const snapTime = snapPosition.value - clipStartTime
        const snapOffset = snapTime
        if (Math.abs(newStartOffset - snapOffset) < 0.1) {
          newStartOffset = snapOffset
        }
      }
      
      emit('trim', clip.id, newStartOffset, clip.endOffset)
    })
  }

  const handleMouseUp = () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
    }
    trimmingClipId.value = null
    snapPosition.value = null
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

const startTrimEnd = (event: MouseEvent, clip: EditorClip) => {
  event.stopPropagation()
  event.preventDefault()
  
  trimmingClipId.value = clip.id
  selectedClipId.value = clip.id
  
  const startX = event.clientX
  const initialEndOffset = clip.endOffset

  let animationFrameId: number | null = null

  const handleMouseMove = (e: MouseEvent) => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
    }

    animationFrameId = requestAnimationFrame(() => {
      const deltaX = startX - e.clientX // Inverted for end trim
      const deltaTime = deltaX / pixelsPerSecond.value
      
      // Calculate new end offset
      let newEndOffset = initialEndOffset + deltaTime
      
      // Clamp to valid range
      const maxEndOffset = clip.originalDuration - clip.startOffset - 0.1
      newEndOffset = Math.max(0, Math.min(newEndOffset, maxEndOffset))
      
      // Apply snap if active
      if (snapPosition.value !== null) {
        const clipEndTime = clip.inTimelineStart + getClipDuration(clip)
        const snapTime = snapPosition.value - clipEndTime
        const snapOffset = clip.endOffset - snapTime
        if (Math.abs(newEndOffset - snapOffset) < 0.1) {
          newEndOffset = snapOffset
        }
      }
      
      emit('trim', clip.id, clip.startOffset, newEndOffset)
    })
  }

  const handleMouseUp = () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
    }
    trimmingClipId.value = null
    snapPosition.value = null
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}
</script>

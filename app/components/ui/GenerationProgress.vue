<template>
  <div class="space-y-6">
    <UCard class="bg-white dark:bg-gray-800 shadow-lg">
      <template #header>
        <div class="flex justify-between items-center">
          <h3 class="text-2xl font-semibold text-gray-900 dark:text-white">Generating Assets</h3>
          <UBadge :color="statusColor" size="lg" class="uppercase">{{ status }}</UBadge>
        </div>
      </template>

      <!-- Overall Progress -->
      <div v-if="status !== 'completed' && overallProgress < 100" class="mb-6">
        <div class="flex justify-between items-center mb-2">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Overall Progress</span>
          <span class="text-sm font-semibold text-gray-900 dark:text-white">{{ overallProgress }}%</span>
        </div>
        <UProgress :value="overallProgress" class="mb-4" />
      </div>

      <!-- Overall Error Message -->
      <UAlert
        v-if="status === 'failed' && overallError"
        color="red"
        variant="soft"
        title="Generation Failed"
        :description="overallError"
        class="mb-4"
      />

      <!-- Segment Progress -->
      <div class="space-y-4">
        <template
          v-for="(segment, idx) in segments"
          :key="idx"
        >
          <div class="p-5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
            <!-- Segment Header -->
            <div class="flex items-center gap-3 mb-4">
              <UIcon
                :name="getStatusIcon(segment.status)"
                :class="getStatusClass(segment.status)"
                class="w-6 h-6"
              />
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-gray-900 dark:text-white">
                    {{ getSegmentLabel(segment.type, idx) }}
                  </span>
                  <UBadge :color="getSegmentBadgeColor(segment.type)" size="xs" variant="subtle">
                    {{ segment.type }}
                  </UBadge>
                </div>
                <p v-if="segment.startTime !== undefined && segment.endTime !== undefined" class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {{ segment.startTime }}s - {{ segment.endTime }}s
                </p>
              </div>
              <UBadge :color="getStatusBadgeColor(segment.status)" size="sm" variant="subtle">
                {{ segment.status }}
              </UBadge>
            </div>

            <!-- Audio Script (if available) -->
            <div v-if="getScriptText(segment)" class="mb-4 p-3 bg-white dark:bg-gray-800 rounded-lg border-l-4 border-primary-500">
              <p class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Audio Script:</p>
              <p class="text-sm text-gray-800 dark:text-gray-200 italic">
                "{{ getScriptText(segment) }}"
              </p>
            </div>
            
            <!-- Progress bar for processing segments -->
            <div v-if="segment.status === 'processing' || segment.status === 'pending'" class="mb-4">
              <div class="flex justify-between items-center mb-1">
                <span class="text-xs text-gray-600 dark:text-gray-400">Generating assets...</span>
                <span v-if="segment.progress" class="text-xs font-medium text-gray-700 dark:text-gray-300">{{ segment.progress }}%</span>
              </div>
              <UProgress :value="segment.progress || 0" :indeterminate="!segment.progress" size="sm" />
            </div>
            
            <!-- Skeleton placeholders for processing segments -->
            <div v-if="(segment.status === 'processing' || segment.status === 'pending') && !getVideoUrl(segment)" class="mt-3 space-y-2">
              <div class="flex gap-2">
                <USkeleton class="w-32 h-20 rounded-lg" />
                <USkeleton class="w-32 h-20 rounded-lg" />
                <USkeleton class="w-32 h-20 rounded-lg" />
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400">Generating video and audio assets...</p>
            </div>
          <!-- Error Messages -->
          <UAlert
            v-if="segment.status === 'failed' && segment.error"
            color="red"
            variant="soft"
            :title="`Segment ${idx + 1} Error`"
            :description="segment.error"
            class="mt-4"
          >
            <template v-if="segment.metadata" #actions>
              <UButton
                size="xs"
                variant="outline"
                color="red"
                @click="downloadMetadata(segment, idx)"
              >
                <UIcon name="i-heroicons-arrow-down-tray" class="mr-1" />
                Download Error Metadata
              </UButton>
            </template>
          </UAlert>
          
          <!-- Completed Segment: Video and Audio Previews -->
          <div v-if="segment.status === 'completed'" class="mt-4 space-y-4">
            <!-- Video Preview -->
            <div v-if="getVideoUrl(segment)" class="space-y-2">
              <div class="flex items-center justify-between">
                <p class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Video Preview</p>
                <UButton
                  v-if="retrySegment && segment.segmentId !== undefined"
                  icon="i-heroicons-arrow-path"
                  size="xs"
                  variant="outline"
                  color="primary"
                  :loading="regeneratingSegments[segment.segmentId]"
                  :disabled="regeneratingSegments[segment.segmentId]"
                  @click="handleRegenerateSegment(segment.segmentId, idx)"
                  class="flex items-center gap-1"
                >
                  Regenerate
                </UButton>
              </div>
              <div class="aspect-video bg-black rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-700">
                <video
                  :src="getVideoUrl(segment)"
                  class="w-full h-full object-contain"
                  controls
                  preload="metadata"
                />
              </div>
            </div>

            <!-- Metadata Details (Collapsible) -->
            <div v-if="segment.metadata" class="pt-2 border-t border-gray-200 dark:border-gray-700">
              <UButton
                size="xs"
                variant="ghost"
                color="gray"
                @click="toggleMetadataExpanded(idx)"
                class="mb-2"
              >
                <UIcon :name="isMetadataExpanded(idx) ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="mr-1" />
                {{ isMetadataExpanded(idx) ? 'Hide' : 'Show' }} Metadata
              </UButton>
              <div v-if="isMetadataExpanded(idx)" class="text-xs text-gray-700 dark:text-gray-300 space-y-1 mt-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <p v-if="segment.metadata.predictionId">
                  <strong class="text-gray-900 dark:text-white">Prediction ID:</strong> 
                  <code class="bg-gray-200 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-800 dark:text-gray-200">{{ segment.metadata.predictionId }}</code>
                </p>
                <p v-if="segment.metadata.replicateVideoUrl">
                  <strong class="text-gray-900 dark:text-white">Replicate Video URL:</strong>
                  <a 
                    :href="segment.metadata.replicateVideoUrl" 
                    target="_blank" 
                    class="text-primary-600 dark:text-primary-400 hover:underline ml-1"
                  >
                    View Video
                  </a>
                </p>
                <p v-if="segment.metadata.videoUrl">
                  <strong class="text-gray-900 dark:text-white">Video URL:</strong> 
                  <code class="bg-gray-200 dark:bg-gray-800 px-2 py-0.5 rounded break-all text-gray-800 dark:text-gray-200">{{ segment.metadata.videoUrl }}</code>
                </p>
              </div>
              <UButton
                size="xs"
                variant="outline"
                color="gray"
                class="mt-2"
                @click="downloadMetadata(segment, idx)"
              >
                <UIcon name="i-heroicons-arrow-down-tray" class="mr-1" />
                Download Metadata
              </UButton>
            </div>
          </div>
          </div>
        </template>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { Asset } from '~/app/types/generation'

const props = defineProps<{
  segments: Array<{
    type: string
    status: string
    progress?: number
    error?: string
    metadata?: Asset['metadata']
    videoUrl?: string
    voiceUrl?: string
    startTime?: number
    endTime?: number
    audioNotes?: string
    segmentId?: number
  }>
  overallProgress: number
  status: string
  currentCost: number
  estimatedTotal: number
  overallError?: string
  retrySegment?: (segmentId: number, storyboard?: any) => Promise<void>
  storyboard?: any
}>()

const metadataExpanded = ref<Record<number, boolean>>({})
const regeneratingSegments = ref<Record<number, boolean>>({})

// Helper function to get video URL
const getVideoUrl = (segment: any): string | null => {
  return segment.videoUrl || segment.metadata?.videoUrl || segment.metadata?.replicateVideoUrl || null
}

// Metadata expansion
const isMetadataExpanded = (segmentIdx: number): boolean => {
  return metadataExpanded.value[segmentIdx] || false
}

const toggleMetadataExpanded = (segmentIdx: number) => {
  metadataExpanded.value[segmentIdx] = !metadataExpanded.value[segmentIdx]
}

const downloadMetadata = (segment: any, index: number) => {
  const metadata = {
    segmentIndex: index,
    segmentType: segment.type,
    status: segment.status,
    error: segment.error,
    metadata: segment.metadata,
    timestamp: new Date().toISOString(),
  }
  
  const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `segment-${index + 1}-metadata-${Date.now()}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  
  console.log(`[GenerationProgress] Segment ${index + 1} Metadata:`, metadata)
}

const statusColor = computed(() => {
  if (props.status === 'completed') return 'green'
  if (props.status === 'failed') return 'red'
  return 'blue'
})

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return 'i-heroicons-check-circle'
    case 'failed':
      return 'i-heroicons-x-circle'
    case 'processing':
      return 'i-heroicons-arrow-path'
    default:
      return 'i-heroicons-clock'
  }
}

const getStatusClass = (status: string) => {
  switch (status) {
    case 'completed':
      return 'text-green-500 dark:text-green-400'
    case 'failed':
      return 'text-red-500 dark:text-red-400'
    case 'processing':
      return 'text-blue-500 dark:text-blue-400 animate-spin'
    default:
      return 'text-gray-400 dark:text-gray-500'
  }
}

const getStatusBadgeColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'green'
    case 'failed':
      return 'red'
    case 'processing':
      return 'blue'
    default:
      return 'gray'
  }
}

// Get segment label
const getSegmentLabel = (type: string, index: number): string => {
  const labels: Record<string, string> = {
    hook: 'Hook',
    body: `Body ${index === 1 ? '1' : '2'}`,
    cta: 'Call to Action',
  }
  return labels[type] || `Segment ${index + 1}`
}

// Get segment badge color
const getSegmentBadgeColor = (type: string) => {
  const colors: Record<string, string> = {
    hook: 'purple',
    body: 'blue',
    cta: 'green',
  }
  return colors[type] || 'gray'
}

// Extract script text from audioNotes (same logic as AudioScriptView)
const getScriptText = (segment: any): string | null => {
  if (!segment.audioNotes || !segment.audioNotes.trim()) {
    return null
  }
  
  const trimmed = segment.audioNotes.trim()
  const lowerTrimmed = trimmed.toLowerCase()
  
  // Pattern 1: "Music: [description]. Voiceover: [script]"
  const musicAndVoiceoverMatch = trimmed.match(/music:\s*[^.]*\.\s*voiceover:\s*(.+)/i)
  if (musicAndVoiceoverMatch) {
    const voText = musicAndVoiceoverMatch[1].trim()
    return voText.replace(/\.$/, '').trim()
  }
  
  // Pattern 2: "Voiceover: [text]" or "VO: [text]"
  const voiceoverMatch = trimmed.match(/(?:voiceover|vo):\s*(.+?)(?:\.\s*$|$)/i)
  if (voiceoverMatch) {
    let voText = voiceoverMatch[1].trim()
    // Check if it's descriptive text
    const isDescriptive = voText.toLowerCase().match(/^(a |an |the )?(narrator|voiceover|voice|speaker|announcer)/i) ||
                         voText.toLowerCase().match(/(describes|explains|discusses|talks about|says|tells)/i)
    
    if (!isDescriptive && voText.length > 5) {
      return voText
    }
  }
  
  // Pattern 3: Text in quotes after "Voiceover:" or "VO:"
  const quotedMatch = trimmed.match(/(?:voiceover|vo):\s*['"](.+?)['"]/i)
  if (quotedMatch) {
    return quotedMatch[1].trim()
  }
  
  // Pattern 4: Text in quotes (standalone) - only if no music/sound keywords
  const standaloneQuoted = trimmed.match(/['"](.+?)['"]/)
  if (standaloneQuoted && !lowerTrimmed.includes('music') && !lowerTrimmed.includes('sound')) {
    const quotedText = standaloneQuoted[1].trim()
    const isDescriptive = quotedText.toLowerCase().match(/^(a |an |the )?(narrator|voiceover|voice|speaker)/i)
    if (!isDescriptive && quotedText.length > 5) {
      return quotedText
    }
  }
  
  // Pattern 5: Check for descriptive indicators and reject if found
  const descriptiveIndicators = [
    'a narrator', 'an announcer', 'the voiceover', 'the voice', 'the speaker',
    'describes', 'explains', 'discusses', 'talks about', 'says that', 'tells',
    'music begins', 'music plays', 'music reaches', 'music fades',
    'sound of', 'ambient music', 'instrumental music'
  ]
  
  const isDescriptiveNote = descriptiveIndicators.some(indicator => lowerTrimmed.includes(indicator))
  
  if (!isDescriptiveNote && trimmed.length > 10) {
    const startsWithDescriptive = /^(a |an |the )?(narrator|voiceover|voice|speaker|announcer|professional)/i.test(trimmed)
    if (!startsWithDescriptive) {
      return trimmed
    }
  }
  
  return null
}

// Handle segment regeneration
const handleRegenerateSegment = async (segmentId: number, idx: number) => {
  if (!props.retrySegment) {
    console.warn('[GenerationProgress] retrySegment function not provided')
    return
  }

  regeneratingSegments.value[segmentId] = true
  
  try {
    // Pass the current storyboard so regeneration uses latest modified data
    await props.retrySegment(segmentId, props.storyboard)
    // The polling will automatically update the segment
  } catch (error: any) {
    console.error('[GenerationProgress] Error regenerating segment:', error)
    // Error handling can be added here if needed
  } finally {
    regeneratingSegments.value[segmentId] = false
  }
}
</script>



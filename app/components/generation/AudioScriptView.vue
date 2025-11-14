<template>
  <UCard class="letsignit-card">
    <template #header>
      <h3 class="text-2xl font-semibold text-black">Audio Scripts</h3>
    </template>

    <div class="space-y-4">
      <div
        v-for="(segment, idx) in segments"
        :key="idx"
        class="p-4 bg-white border border-gray-200 rounded-lg"
      >
        <div class="flex items-start gap-3">
          <UBadge :color="getSegmentColor(segment.type)" size="sm">
            {{ segment.type }}
          </UBadge>
          <div class="flex-1">
            <p class="text-sm font-medium text-gray-700 mb-1">
              Segment {{ idx + 1 }} ({{ segment.startTime }}s - {{ segment.endTime }}s)
            </p>
            <div v-if="getScriptText(segment)" class="mt-2">
              <p class="text-sm font-medium text-gray-600 mb-1">Script:</p>
              <p class="text-sm text-gray-800 bg-gray-50 p-3 rounded border-l-4 border-primary-500 italic">
                "{{ getScriptText(segment) }}"
              </p>
            </div>
            <div v-else class="mt-2">
              <p class="text-sm text-gray-500 italic">No script available for this segment</p>
            </div>
            <div v-if="segment.audioNotes && !getScriptText(segment)" class="mt-2">
              <p class="text-xs text-gray-500">Original audio notes:</p>
              <p class="text-xs text-gray-400 italic">{{ segment.audioNotes }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { Segment } from '~/app/types/generation'

const props = defineProps<{
  segments: Segment[]
}>()

// Extract script text from audioNotes
const getScriptText = (segment: Segment): string | null => {
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

const getSegmentColor = (type: string) => {
  const colors: Record<string, string> = {
    hook: 'secondary',
    body: 'primary',
    cta: 'success',
  }
  return colors[type] || 'neutral'
}
</script>


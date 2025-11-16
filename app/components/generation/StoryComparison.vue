<template>
  <div class="story-comparison">
    <div class="comparison-header">
      <h4 class="text-base font-semibold text-gray-900">Story Comparison</h4>
      <p class="text-xs text-gray-500 mt-1">Compare key differences between story options</p>
    </div>

    <div class="comparison-grid">
      <!-- Story column headers -->
      <div class="comparison-row comparison-header-row">
        <div class="comparison-label-cell">
          <span class="text-xs font-semibold text-gray-600">Story</span>
        </div>
        <div 
          v-for="story in stories" 
          :key="`header-${story.id}`"
          class="comparison-story-cell"
          :class="{ 'is-selected': selectedStoryId === story.id }"
        >
          <span class="text-sm font-semibold">Story {{ story.id }}</span>
          <UBadge 
            v-if="story.id === selectedStoryId" 
            color="green" 
            variant="soft" 
            size="xs"
          >
            Selected
          </UBadge>
        </div>
      </div>

      <!-- Title row -->
      <div class="comparison-row">
        <div class="comparison-label-cell">
          <UIcon name="i-heroicons-bookmark" class="text-gray-500" />
          <span>Title</span>
        </div>
        <div 
          v-for="story in stories" 
          :key="`title-${story.id}`"
          class="comparison-story-cell"
          :class="{ 'is-selected': selectedStoryId === story.id }"
        >
          <span class="cell-value">{{ story.title }}</span>
        </div>
      </div>

      <!-- Emotional Arc row -->
      <div class="comparison-row">
        <div class="comparison-label-cell">
          <UIcon name="i-heroicons-heart" class="text-gray-500" />
          <span>Emotional Arc</span>
        </div>
        <div 
          v-for="story in stories" 
          :key="`arc-${story.id}`"
          class="comparison-story-cell"
          :class="{ 'is-selected': selectedStoryId === story.id }"
        >
          <span class="cell-value">{{ story.emotionalArc }}</span>
          <div class="arc-visualization">
            <div 
              v-for="(_, index) in 5" 
              :key="index"
              class="arc-dot"
              :class="getArcLevel(story.emotionalArc, index)"
            />
          </div>
        </div>
      </div>

      <!-- Target Audience row -->
      <div class="comparison-row">
        <div class="comparison-label-cell">
          <UIcon name="i-heroicons-user-group" class="text-gray-500" />
          <span>Target Audience</span>
        </div>
        <div 
          v-for="story in stories" 
          :key="`audience-${story.id}`"
          class="comparison-story-cell"
          :class="{ 'is-selected': selectedStoryId === story.id }"
        >
          <span class="cell-value">{{ story.targetAudience }}</span>
        </div>
      </div>

      <!-- Key Beats count row -->
      <div class="comparison-row">
        <div class="comparison-label-cell">
          <UIcon name="i-heroicons-list-bullet" class="text-gray-500" />
          <span>Story Beats</span>
        </div>
        <div 
          v-for="story in stories" 
          :key="`beats-${story.id}`"
          class="comparison-story-cell"
          :class="{ 'is-selected': selectedStoryId === story.id }"
        >
          <span class="cell-value font-semibold">{{ story.keyBeats.length }} beats</span>
          <div class="beats-preview">
            <div v-for="(beat, index) in story.keyBeats.slice(0, 2)" :key="index" class="beat-preview">
              {{ truncate(beat, 30) }}
            </div>
            <div v-if="story.keyBeats.length > 2" class="text-xs text-gray-400">
              +{{ story.keyBeats.length - 2 }} more
            </div>
          </div>
        </div>
      </div>

      <!-- Narrative approach (analysis) row -->
      <div class="comparison-row">
        <div class="comparison-label-cell">
          <UIcon name="i-heroicons-sparkles" class="text-gray-500" />
          <span>Approach</span>
        </div>
        <div 
          v-for="story in stories" 
          :key="`approach-${story.id}`"
          class="comparison-story-cell"
          :class="{ 'is-selected': selectedStoryId === story.id }"
        >
          <div class="approach-tags">
            <UBadge 
              v-for="tag in analyzeApproach(story)" 
              :key="tag"
              size="xs"
              variant="soft"
              :color="getTagColor(tag)"
            >
              {{ tag }}
            </UBadge>
          </div>
        </div>
      </div>

      <!-- Length indicator row -->
      <div class="comparison-row">
        <div class="comparison-label-cell">
          <UIcon name="i-heroicons-bars-3" class="text-gray-500" />
          <span>Narrative Length</span>
        </div>
        <div 
          v-for="story in stories" 
          :key="`length-${story.id}`"
          class="comparison-story-cell"
          :class="{ 'is-selected': selectedStoryId === story.id }"
        >
          <div class="length-bar">
            <div 
              class="length-fill" 
              :style="{ width: `${getLengthPercentage(story)}%` }"
            />
          </div>
          <span class="text-xs text-gray-500">{{ story.narrative.length }} chars</span>
        </div>
      </div>
    </div>

    <!-- Key differences summary -->
    <div v-if="keyDifferences.length > 0" class="comparison-summary">
      <h5 class="summary-title">
        <UIcon name="i-heroicons-light-bulb" />
        Key Differences
      </h5>
      <ul class="summary-list">
        <li v-for="(diff, index) in keyDifferences" :key="index" class="summary-item">
          <UIcon name="i-heroicons-arrow-right" class="summary-icon" />
          <span>{{ diff }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Story } from '~/types/generation'

interface Props {
  /** Array of story options to compare */
  stories: Story[]
  /** Currently selected story ID */
  selectedStoryId?: number
}

const props = withDefaults(defineProps<Props>(), {})

// Helper: Truncate text
function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
}

// Helper: Get emotional arc visualization level
function getArcLevel(emotionalArc: string, index: number): string {
  const arc = emotionalArc.toLowerCase()
  
  // Simple heuristic: map common emotional arcs to patterns
  if (arc.includes('tension')) {
    return index <= 3 ? 'arc-active' : ''
  } else if (arc.includes('excitement') || arc.includes('joy')) {
    return index <= 4 ? 'arc-active' : ''
  } else if (arc.includes('curiosity') || arc.includes('interest')) {
    return index <= 2 ? 'arc-active' : ''
  } else if (arc.includes('surprise') || arc.includes('delight')) {
    return index <= 4 ? 'arc-active' : ''
  } else {
    return index <= 3 ? 'arc-active' : ''
  }
}

// Helper: Analyze narrative approach
function analyzeApproach(story: Story): string[] {
  const tags: string[] = []
  const narrative = story.narrative.toLowerCase()
  const title = story.title.toLowerCase()
  
  if (narrative.includes('problem') || narrative.includes('challenge')) {
    tags.push('Problem-Solution')
  }
  if (narrative.includes('transform') || narrative.includes('before')) {
    tags.push('Transformation')
  }
  if (narrative.includes('discover') || narrative.includes('journey')) {
    tags.push('Discovery')
  }
  if (narrative.includes('emotion') || narrative.includes('feel')) {
    tags.push('Emotional')
  }
  if (title.includes('story') || narrative.includes('story')) {
    tags.push('Storytelling')
  }
  if (narrative.includes('benefit') || narrative.includes('feature')) {
    tags.push('Feature-Focused')
  }
  
  // Default if no tags
  if (tags.length === 0) {
    tags.push('Direct')
  }
  
  return tags.slice(0, 3) // Max 3 tags
}

// Helper: Get tag color
function getTagColor(tag: string): string {
  const colorMap: Record<string, string> = {
    'Problem-Solution': 'blue',
    'Transformation': 'purple',
    'Discovery': 'green',
    'Emotional': 'pink',
    'Storytelling': 'amber',
    'Feature-Focused': 'cyan',
    'Direct': 'gray',
  }
  return colorMap[tag] || 'gray'
}

// Helper: Get narrative length percentage (relative to longest)
function getLengthPercentage(story: Story): number {
  if (props.stories.length === 0) return 100
  
  const lengths = props.stories.map(s => s.narrative.length)
  const maxLength = Math.max(...lengths)
  
  return (story.narrative.length / maxLength) * 100
}

// Computed: Key differences between stories
const keyDifferences = computed(() => {
  if (props.stories.length < 2) return []
  
  const differences: string[] = []
  
  // Compare emotional arcs
  const uniqueArcs = new Set(props.stories.map(s => s.emotionalArc))
  if (uniqueArcs.size > 1) {
    differences.push(`Different emotional arcs: ${Array.from(uniqueArcs).join(', ')}`)
  }
  
  // Compare target audiences
  const uniqueAudiences = new Set(props.stories.map(s => s.targetAudience))
  if (uniqueAudiences.size > 1) {
    differences.push(`Tailored for different audiences: ${Array.from(uniqueAudiences).join(', ')}`)
  }
  
  // Compare narrative lengths
  const lengths = props.stories.map(s => s.narrative.length)
  const lengthDiff = Math.max(...lengths) - Math.min(...lengths)
  if (lengthDiff > 100) {
    differences.push(`Narrative length varies from ${Math.min(...lengths)} to ${Math.max(...lengths)} characters`)
  }
  
  // Compare beat counts
  const beatCounts = props.stories.map(s => s.keyBeats.length)
  const uniqueBeatCounts = new Set(beatCounts)
  if (uniqueBeatCounts.size > 1) {
    differences.push(`Different story complexity: ${Math.min(...beatCounts)} to ${Math.max(...beatCounts)} key beats`)
  }
  
  return differences.slice(0, 4) // Max 4 differences
})
</script>

<style scoped>
.story-comparison {
  @apply space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200;
}

.comparison-header {
  @apply pb-3 border-b border-gray-300;
}

.comparison-grid {
  @apply space-y-2;
}

.comparison-row {
  @apply grid gap-3;
  grid-template-columns: 150px repeat(auto-fit, minmax(0, 1fr));
}

.comparison-header-row {
  @apply pb-2 border-b border-gray-300;
}

.comparison-label-cell {
  @apply flex items-center gap-2 text-sm font-medium text-gray-700 py-2;
}

.comparison-story-cell {
  @apply flex flex-col gap-1 p-3 bg-white rounded border border-gray-200;
}

.comparison-story-cell.is-selected {
  @apply bg-green-50 border-green-300;
}

.cell-value {
  @apply text-sm text-gray-800;
}

.arc-visualization {
  @apply flex gap-1 mt-2;
}

.arc-dot {
  @apply w-2 h-2 rounded-full bg-gray-200;
}

.arc-dot.arc-active {
  @apply bg-blue-500;
}

.beats-preview {
  @apply mt-2 space-y-1 text-xs text-gray-600;
}

.beat-preview {
  @apply truncate;
}

.approach-tags {
  @apply flex flex-wrap gap-1;
}

.length-bar {
  @apply h-2 bg-gray-200 rounded-full overflow-hidden mt-1;
}

.length-fill {
  @apply h-full bg-blue-500 transition-all;
}

.comparison-summary {
  @apply mt-4 p-3 bg-blue-50 rounded border border-blue-200;
}

.summary-title {
  @apply flex items-center gap-2 text-sm font-semibold text-blue-900 mb-2;
}

.summary-list {
  @apply space-y-1;
}

.summary-item {
  @apply flex items-start gap-2 text-sm text-blue-800;
}

.summary-icon {
  @apply flex-shrink-0 mt-0.5 text-blue-600;
}
</style>


<template>
  <div class="story-selector">
    <div class="story-selector-header">
      <h3 class="text-lg font-semibold text-gray-900">Choose Your Story</h3>
      <p class="text-sm text-gray-600 mt-1">
        Select one of {{ stories.length}} AI-generated story narratives for your video
      </p>
    </div>

    <div class="story-options" :class="{ 'is-loading': isLoading }">
      <div 
        v-for="story in stories" 
        :key="story.id"
        class="story-option"
        :class="{ 
          'is-selected': selectedStoryId === story.id,
          'is-recommended': story.id === recommendedId 
        }"
        @click="handleSelect(story)"
      >
        <!-- Selection indicator -->
        <div class="story-selection-indicator">
          <UIcon 
            v-if="selectedStoryId === story.id" 
            name="i-heroicons-check-circle-solid" 
            class="text-green-600 text-xl"
          />
          <UIcon 
            v-else 
            name="i-heroicons-circle" 
            class="text-gray-300 text-xl"
          />
        </div>

        <!-- Story content -->
        <div class="story-content">
          <!-- Header -->
          <div class="story-header">
            <h4 class="story-title">
              {{ story.title }}
            </h4>
            <UBadge 
              v-if="story.id === recommendedId" 
              color="blue" 
              variant="soft" 
              size="xs"
            >
              Recommended
            </UBadge>
          </div>

          <!-- Narrative -->
          <p class="story-narrative">
            {{ story.narrative }}
          </p>

          <!-- Emotional arc -->
          <div class="story-meta">
            <div class="meta-item">
              <span class="meta-label">Emotional Arc:</span>
              <span class="meta-value">{{ story.emotionalArc }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Target Audience:</span>
              <span class="meta-value">{{ story.targetAudience }}</span>
            </div>
          </div>

          <!-- Key beats -->
          <div v-if="expandedStoryId === story.id" class="story-details">
            <div class="story-detail-section">
              <h5 class="detail-title">Key Story Beats</h5>
              <ul class="beat-list">
                <li v-for="(beat, index) in story.keyBeats" :key="index" class="beat-item">
                  <UIcon name="i-heroicons-check" class="beat-icon" />
                  <span>{{ beat }}</span>
                </li>
              </ul>
            </div>

            <div class="story-detail-section">
              <h5 class="detail-title">Why This Story Works</h5>
              <p class="detail-text">{{ story.rationale }}</p>
            </div>
          </div>

          <!-- Expand/Collapse toggle -->
          <button 
            class="story-expand-button"
            @click.stop="toggleExpand(story.id)"
          >
            <span v-if="expandedStoryId === story.id">
              Show Less
              <UIcon name="i-heroicons-chevron-up" />
            </span>
            <span v-else>
              Show More
              <UIcon name="i-heroicons-chevron-down" />
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="story-loading">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl text-blue-600" />
      <p class="text-sm text-gray-600 mt-2">Generating story options...</p>
    </div>

    <!-- Empty state -->
    <div v-if="!isLoading && stories.length === 0" class="story-empty">
      <UIcon name="i-heroicons-light-bulb" class="text-4xl text-gray-400" />
      <h4 class="text-base font-semibold text-gray-700 mt-3">No Stories Yet</h4>
      <p class="text-sm text-gray-500 mt-1">
        Stories will be generated after you submit your prompt
      </p>
    </div>

    <!-- Action buttons -->
    <div v-if="!isLoading && stories.length > 0" class="story-actions">
      <UButton 
        v-if="onRegenerateStories"
        variant="soft" 
        color="gray"
        icon="i-heroicons-arrow-path"
        @click="onRegenerateStories"
      >
        Regenerate Stories
      </UButton>

      <UButton 
        v-if="onConfirm && selectedStoryId"
        color="primary"
        icon="i-heroicons-check"
        @click="handleConfirm"
      >
        Confirm Selection
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Story } from '~/types/generation'

interface Props {
  /** Array of story options */
  stories: Story[]
  /** Currently selected story ID */
  selectedStoryId?: number
  /** Recommended story ID (defaults to story 1) */
  recommendedId?: number
  /** Is loading stories */
  isLoading?: boolean
  /** Callback when story is selected */
  onSelect?: (story: Story) => void
  /** Callback when confirm button is clicked */
  onConfirm?: () => void
  /** Callback to regenerate stories */
  onRegenerateStories?: () => void
}

const props = withDefaults(defineProps<Props>(), {
  recommendedId: 1,
  isLoading: false,
})

const emit = defineEmits<{
  'update:selectedStoryId': [value: number]
  select: [story: Story]
  confirm: []
}>()

// Local state
const expandedStoryId = ref<number | null>(null)

// Handlers
function handleSelect(story: Story) {
  emit('update:selectedStoryId', story.id)
  emit('select', story)
  if (props.onSelect) {
    props.onSelect(story)
  }
}

function handleConfirm() {
  emit('confirm')
  if (props.onConfirm) {
    props.onConfirm()
  }
}

function toggleExpand(storyId: number) {
  expandedStoryId.value = expandedStoryId.value === storyId ? null : storyId
}
</script>

<style scoped>
.story-selector {
  @apply space-y-4;
}

.story-selector-header {
  @apply pb-4 border-b border-gray-200;
}

.story-options {
  @apply space-y-4;
}

.story-options.is-loading {
  @apply opacity-50 pointer-events-none;
}

.story-option {
  @apply relative flex gap-4 p-5 border-2 border-gray-200 rounded-lg cursor-pointer transition-all bg-white;
}

.story-option:hover {
  @apply border-gray-300 shadow-sm;
}

.story-option.is-selected {
  @apply border-green-500 bg-green-50;
}

.story-option.is-recommended {
  @apply border-blue-300;
}

.story-option.is-selected.is-recommended {
  @apply border-green-500;
}

.story-selection-indicator {
  @apply flex-shrink-0 pt-0.5;
}

.story-content {
  @apply flex-1 space-y-3;
}

.story-header {
  @apply flex items-start justify-between gap-3;
}

.story-title {
  @apply text-base font-semibold text-gray-900;
}

.story-narrative {
  @apply text-sm text-gray-700 leading-relaxed;
}

.story-meta {
  @apply flex flex-wrap gap-4 text-xs;
}

.meta-item {
  @apply flex gap-1.5;
}

.meta-label {
  @apply font-medium text-gray-500;
}

.meta-value {
  @apply text-gray-700;
}

.story-details {
  @apply space-y-3 pt-3 border-t border-gray-200;
}

.story-detail-section {
  @apply space-y-2;
}

.detail-title {
  @apply text-sm font-semibold text-gray-800;
}

.detail-text {
  @apply text-sm text-gray-600 leading-relaxed;
}

.beat-list {
  @apply space-y-1.5;
}

.beat-item {
  @apply flex items-start gap-2 text-sm text-gray-700;
}

.beat-icon {
  @apply text-green-600 flex-shrink-0 mt-0.5;
}

.story-expand-button {
  @apply flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors;
}

.story-loading,
.story-empty {
  @apply flex flex-col items-center justify-center py-12 text-center;
}

.story-actions {
  @apply flex items-center justify-between gap-3 pt-4 border-t border-gray-200;
}
</style>


<template>
  <UModal v-model:open="isOpen" title="Edit Segment" :ui="{ width: 'sm:max-w-4xl' }">
    <template #body>
      <div class="max-h-[80vh] overflow-y-auto pr-2">
        <UForm ref="formRef" :state="form" :schema="schema.value" @submit="handleSave" @error="handleError">
        <UFormField label="Type" name="type" required>
          <USelect
            v-model="form.type"
            :items="typeOptions"
          />
        </UFormField>

        <UFormField label="Description" name="description" required>
          <UTextarea
            v-model="form.description"
            placeholder="Describe what happens in this segment..."
            :rows="3"
            :maxlength="1000"
          />
          <template #description>
            <div class="flex justify-between items-center mt-1">
              <span class="text-xs text-gray-500">Maximum 1000 characters</span>
              <span 
                class="text-xs font-medium"
                :class="form.description.length > 1000 ? 'text-error-500' : form.description.length > 900 ? 'text-warning-500' : 'text-gray-500'"
              >
                {{ form.description.length }} / 1000
              </span>
            </div>
          </template>
        </UFormField>

        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Start Time (seconds)" name="startTime" required>
            <UInput
              v-model.number="form.startTime"
              type="number"
              :min="0"
              :step="0.1"
            />
          </UFormField>

          <UFormField label="End Time (seconds)" name="endTime" required>
            <UInput
              v-model.number="form.endTime"
              type="number"
              :min="0"
              :step="0.1"
            />
          </UFormField>
        </div>

        <!-- Prompt Selection -->
        <div v-if="form.visualPromptAlternatives && form.visualPromptAlternatives.length > 0" class="mb-4">
          <UFormField label="Select Visual Prompt" name="selectedPromptIndex">
            <URadioGroup
              v-model="form.selectedPromptIndex"
              :options="promptOptions"
              @update:model-value="updateSelectedPrompt"
            />
          </UFormField>
        </div>

        <UFormField label="Visual Prompt" name="visualPrompt" required>
          <UTextarea
            v-model="form.visualPrompt"
            placeholder="Detailed visual description for video generation..."
            :rows="4"
            :maxlength="1000"
          />
          <template #description>
            <div class="flex justify-between items-center mt-1">
              <p v-if="form.visualPromptAlternatives && form.visualPromptAlternatives.length > 0" class="text-xs text-gray-500">
                You can edit the selected prompt above, or choose a different alternative.
              </p>
              <span 
                class="text-xs font-medium ml-auto"
                :class="form.visualPrompt.length > 1000 ? 'text-error-500' : form.visualPrompt.length > 900 ? 'text-warning-500' : 'text-gray-500'"
              >
                {{ form.visualPrompt.length }} / 1000
              </span>
            </div>
          </template>
        </UFormField>

        <UFormField label="Audio Notes" name="audioNotes">
          <UTextarea
            v-model="form.audioNotes"
            placeholder="Optional notes about audio, voiceover, or music for this segment..."
            :rows="2"
            :maxlength="500"
          />
          <template #description>
            <div class="flex justify-end mt-1">
              <span 
                class="text-xs font-medium"
                :class="(form.audioNotes?.length || 0) > 500 ? 'text-error-500' : (form.audioNotes?.length || 0) > 450 ? 'text-warning-500' : 'text-gray-500'"
              >
                {{ form.audioNotes?.length || 0 }} / 500
              </span>
            </div>
          </template>
        </UFormField>

        <!-- Frame Images Section (Read-only) -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
          <h3 class="text-lg font-semibold mb-4">Frame Images for Video Generation</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                First Frame Image
                <UBadge v-if="form.firstFrameImage" color="green" variant="soft" class="ml-2">Set</UBadge>
                <UBadge v-else color="yellow" variant="soft" class="ml-2">Not Set</UBadge>
              </label>
              <div v-if="form.firstFrameImage" class="border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-gray-50 dark:bg-gray-800">
                <NuxtImg
                  :src="form.firstFrameImage"
                  alt="First frame preview"
                  class="w-full h-48 object-cover rounded"
                  loading="lazy"
                />
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-2 truncate" :title="form.firstFrameImage">
                  {{ form.firstFrameImage }}
                </p>
              </div>
              <div v-else class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center bg-gray-50 dark:bg-gray-800">
                <UIcon name="i-heroicons-photo" class="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                <p class="text-sm text-gray-500 dark:text-gray-400">No first frame image set</p>
                <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Generate frames to set this image</p>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Last Frame Image
                <UBadge v-if="form.lastFrameImage" color="green" variant="soft" class="ml-2">Set</UBadge>
                <UBadge v-else color="yellow" variant="soft" class="ml-2">Not Set</UBadge>
              </label>
              <div v-if="form.lastFrameImage" class="border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-gray-50 dark:bg-gray-800">
                <NuxtImg
                  :src="form.lastFrameImage"
                  alt="Last frame preview"
                  class="w-full h-48 object-cover rounded"
                  loading="lazy"
                />
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-2 truncate" :title="form.lastFrameImage">
                  {{ form.lastFrameImage }}
                </p>
              </div>
              <div v-else class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center bg-gray-50 dark:bg-gray-800">
                <UIcon name="i-heroicons-photo" class="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                <p class="text-sm text-gray-500 dark:text-gray-400">No last frame image set</p>
                <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Generate frames to set this image</p>
              </div>
            </div>
          </div>
          <UAlert v-if="!form.firstFrameImage || !form.lastFrameImage" color="yellow" variant="soft" class="mt-4">
            <template #title>Frame Images Required</template>
            <template #description>
              Both first and last frame images must be generated before proceeding to video generation. 
              Go back to the storyboard editor and click "Generate All Frames" to create these images.
            </template>
          </UAlert>
        </div>

        <!-- Veo Model Parameters Section -->
        <div class="border-t border-gray-200 pt-4 mt-4">
          <h3 class="text-lg font-semibold mb-4">Veo Model Parameters</h3>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UFormField label="Seed (Optional)" name="seed">
              <UInput
                v-model.number="form.seed"
                type="number"
                placeholder="Random seed (omit for random)"
              />
              <template #description>
                Random seed. Omit for random generations.
              </template>
            </UFormField>

            <UFormField label="Duration (seconds)" name="duration">
              <UInput
                v-model.number="form.duration"
                type="number"
                :min="1"
                :max="60"
                placeholder="8"
              />
              <template #description>
                Video duration in seconds. Default: 8
              </template>
            </UFormField>

            <UFormField label="Resolution" name="resolution">
              <USelect
                v-model="form.resolution"
                :items="resolutionOptions"
              />
              <template #description>
                Resolution of the generated video. Default: 1080p
              </template>
            </UFormField>

            <UFormField label="Aspect Ratio" name="aspectRatio">
              <USelect
                v-model="form.aspectRatio"
                :items="aspectRatioOptions"
              />
              <template #description>
                Video aspect ratio. Default: 16:9
              </template>
            </UFormField>

            <UFormField label="Generate Audio" name="generateAudio">
              <USwitch v-model="form.generateAudio" />
              <template #description>
                Generate audio with the video. Default: true
              </template>
            </UFormField>
          </div>

          <UFormField label="Negative Prompt (Optional)" name="negativePrompt" class="mt-4">
            <UTextarea
              v-model="form.negativePrompt"
              placeholder="Description of what to exclude from the generated video..."
              :rows="2"
              :maxlength="500"
            />
            <template #description>
              <div class="flex justify-between items-center mt-1">
                <span class="text-xs text-gray-500">Description of what to exclude from the generated video.</span>
                <span 
                  class="text-xs font-medium"
                  :class="(form.negativePrompt?.length || 0) > 500 ? 'text-error-500' : (form.negativePrompt?.length || 0) > 450 ? 'text-warning-500' : 'text-gray-500'"
                >
                  {{ form.negativePrompt?.length || 0 }} / 500
                </span>
              </div>
            </template>
          </UFormField>

        </div>
      </UForm>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-3">
        <UButton
          variant="ghost"
          color="gray"
          @click="close"
        >
          Cancel
        </UButton>
        <UButton
          :loading="saving"
          :disabled="saving"
          color="primary"
          @click="submitForm"
        >
          Save Changes
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { z } from 'zod'
import type { Segment } from '~/app/types/generation'

const props = defineProps<{
  modelValue: boolean
  segment: Segment | null
  segmentIndex: number | null
  totalDuration: number
  allSegments: Segment[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [segment: Segment, index: number]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const saving = ref(false)
const toast = useToast()
const formRef = ref<any>(null)

const typeOptions = ['hook', 'body', 'cta']

// Veo model options
const resolutionOptions = [
  { label: '720p', value: '720p' },
  { label: '1080p', value: '1080p' },
  { label: '1440p', value: '1440p' },
  { label: '4K', value: '4K' },
]

const aspectRatioOptions = [
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '1:1', value: '1:1' },
]

// Create base schema
const baseSchema = z.object({
  type: z.enum(['hook', 'body', 'cta']),
  description: z.string().min(1, 'Description is required').max(1000, 'Description must be less than 1000 characters'),
  startTime: z.number().min(0, 'Start time must be 0 or greater'),
  endTime: z.number().min(0, 'End time must be 0 or greater'),
  visualPrompt: z.string().min(1, 'Visual prompt is required').max(1000, 'Visual prompt must be less than 1000 characters'),
  audioNotes: z.union([z.string().max(500, 'Audio notes must be less than 500 characters'), z.literal(''), z.null()]).optional(),
  // Veo model parameters
  seed: z.number().int().optional().nullable(),
  duration: z.number().int().min(1).max(60).optional().nullable(),
  resolution: z.string().optional().nullable(),
  aspectRatio: z.string().optional().nullable(),
  generateAudio: z.boolean().optional().nullable(),
  negativePrompt: z.union([z.string().max(500, 'Negative prompt must be less than 500 characters'), z.literal(''), z.null()]).optional(),
})

// Create computed schema with dynamic validation
const schema = computed(() => {
  return baseSchema.refine((data) => data.startTime < data.endTime, {
    message: 'Start time must be less than end time',
    path: ['endTime']
  }).refine((data) => data.endTime <= props.totalDuration, {
    message: `End time cannot exceed total duration (${props.totalDuration}s)`,
    path: ['endTime']
  })
})

const form = reactive<Segment & { 
  audioNotes?: string
  // Veo model parameters
  seed?: number | null
  duration?: number | null
  resolution?: string | null
  aspectRatio?: string | null
  generateAudio?: boolean | null
  negativePrompt?: string | null
}>({
  type: 'hook',
  description: '',
  startTime: 0,
  endTime: 0,
  visualPrompt: '',
  visualPromptAlternatives: undefined,
  selectedPromptIndex: undefined,
  audioNotes: '',
  firstFrameImage: undefined,
  lastFrameImage: undefined,
  // Veo model parameters
  seed: null,
  duration: null,
  resolution: null,
  aspectRatio: null,
  generateAudio: true,
  negativePrompt: null,
})

// Prompt options for radio group
const promptOptions = computed(() => {
  const options: Array<{ label: string; value: number }> = []
  
  // Add primary prompt option
  options.push({
    label: 'Primary Prompt',
    value: 0,
  })
  
  // Add alternative prompts
  if (form.visualPromptAlternatives && form.visualPromptAlternatives.length > 0) {
    form.visualPromptAlternatives.forEach((alt, idx) => {
      options.push({
        label: `Alternative ${idx + 1}`,
        value: idx + 1,
      })
    })
  }
  
  return options
})

// Update selected prompt when radio selection changes
const updateSelectedPrompt = (value: number) => {
  if (value === 0) {
    // Use primary prompt - restore original if it was changed
    if (props.segment) {
      form.visualPrompt = props.segment.visualPrompt
    }
  } else {
    // Use alternative prompt
    const altIndex = value - 1
    if (form.visualPromptAlternatives && form.visualPromptAlternatives[altIndex]) {
      form.visualPrompt = form.visualPromptAlternatives[altIndex]
    }
  }
  form.selectedPromptIndex = value
}

// Watch for segment changes and populate form
watch(() => props.segment, (newSegment) => {
  if (newSegment) {
    form.type = newSegment.type
    form.description = newSegment.description
    form.startTime = newSegment.startTime
    form.endTime = newSegment.endTime
    form.visualPromptAlternatives = newSegment.visualPromptAlternatives
    form.selectedPromptIndex = newSegment.selectedPromptIndex ?? 0
    
    // Set visual prompt based on selected index
    if (form.selectedPromptIndex === 0 || form.selectedPromptIndex === undefined) {
      form.visualPrompt = newSegment.visualPrompt
    } else {
      const altIndex = form.selectedPromptIndex - 1
      if (form.visualPromptAlternatives && form.visualPromptAlternatives[altIndex]) {
        form.visualPrompt = form.visualPromptAlternatives[altIndex]
      } else {
        form.visualPrompt = newSegment.visualPrompt
      }
    }
    
    form.audioNotes = newSegment.audioNotes || ''
    
    // Frame images (read-only, from frame generation)
    form.firstFrameImage = newSegment.firstFrameImage
    form.lastFrameImage = newSegment.lastFrameImage
    
    // Veo model parameters (from segment or meta)
    form.seed = (newSegment as any).seed ?? null
    form.duration = (newSegment as any).duration ?? (newSegment.endTime - newSegment.startTime)
    form.resolution = (newSegment as any).resolution ?? null
    form.aspectRatio = (newSegment as any).aspectRatio ?? null
    form.generateAudio = (newSegment as any).generateAudio ?? true
    form.negativePrompt = (newSegment as any).negativePrompt ?? null
  }
}, { immediate: true })

// Check for overlapping segments (warning only, not blocking)
const checkOverlaps = (startTime: number, endTime: number, currentIndex: number): string[] => {
  const warnings: string[] = []
  props.allSegments.forEach((seg, idx) => {
    if (idx === currentIndex) return
    const overlaps = (startTime < seg.endTime && endTime > seg.startTime)
    if (overlaps) {
      warnings.push(`Segment ${idx + 1} (${seg.startTime}s-${seg.endTime}s) overlaps with this segment`)
    }
  })
  return warnings
}


const handleSave = async (event: any) => {
  console.log('[SegmentEditModal] handleSave called with event:', event)
  const data = event.data || form
  console.log('[SegmentEditModal] Data to validate:', data)
  
  saving.value = true
  
  try {
    // Validate with schema
    console.log('[SegmentEditModal] Validating with schema...')
    const validated = schema.value.parse(data)
    console.log('[SegmentEditModal] Validation successful:', validated)
    
    // Check for overlaps (warning only)
    const warnings = checkOverlaps(validated.startTime, validated.endTime, props.segmentIndex ?? -1)
    if (warnings.length > 0) {
      toast.add({
        title: 'Timing Overlap Warning',
        description: warnings.join('; '),
        color: 'warning',
        timeout: 5000,
      })
    }
    
    // Prepare segment data
    // Include File objects - they will be uploaded by the parent component
    const updatedSegment: Segment & { 
      // Veo model parameters
      seed?: number | null
      duration?: number | null
      resolution?: string | null
      aspectRatio?: string | null
      generateAudio?: boolean | null
      negativePrompt?: string | null
    } = {
      type: validated.type,
      description: validated.description,
      startTime: validated.startTime,
      endTime: validated.endTime,
      visualPrompt: validated.visualPrompt,
      ...(form.visualPromptAlternatives ? { visualPromptAlternatives: form.visualPromptAlternatives } : {}),
      ...(form.selectedPromptIndex !== undefined ? { selectedPromptIndex: form.selectedPromptIndex } : {}),
      ...(validated.audioNotes ? { audioNotes: validated.audioNotes } : {}),
      // Veo model parameters
      ...(validated.seed !== null && validated.seed !== undefined ? { seed: validated.seed } : {}),
      ...(validated.duration !== null && validated.duration !== undefined ? { duration: validated.duration } : {}),
      ...(validated.resolution ? { resolution: validated.resolution } : {}),
      ...(validated.aspectRatio ? { aspectRatio: validated.aspectRatio } : {}),
      ...(validated.generateAudio !== null && validated.generateAudio !== undefined ? { generateAudio: validated.generateAudio } : {}),
      ...(validated.negativePrompt ? { negativePrompt: validated.negativePrompt } : {}),
    }
    
    // Emit saved event with updated segment
    console.log('[SegmentEditModal] Emitting saved event:', { segment: updatedSegment, index: props.segmentIndex })
    emit('saved', updatedSegment, props.segmentIndex ?? -1)
    
    close()
  } catch (error: any) {
    console.error('[SegmentEditModal] Save error:', error)
    console.error('[SegmentEditModal] Error details:', {
      name: error.name,
      message: error.message,
      errors: error.errors,
      issues: error.issues,
      stack: error.stack,
    })
    
    // Handle Zod validation errors (uses 'issues')
    if (error.issues && Array.isArray(error.issues) && error.issues.length > 0) {
      const firstIssue = error.issues[0]
      const fieldName = firstIssue.path && firstIssue.path.length > 0 
        ? firstIssue.path.join('.') 
        : 'field'
      toast.add({
        title: 'Validation Error',
        description: `${fieldName}: ${firstIssue.message}`,
        color: 'error',
        timeout: 5000,
      })
    } else if (error.errors && Array.isArray(error.errors) && error.errors.length > 0) {
      // Handle other validation errors (uses 'errors')
      const firstError = error.errors[0]
      toast.add({
        title: 'Validation Error',
        description: firstError.message || 'Please check your input',
        color: 'error',
        timeout: 5000,
      })
    } else {
      toast.add({
        title: 'Save Failed',
        description: error.message || 'Failed to save segment. Please try again.',
        color: 'error',
        timeout: 5000,
      })
    }
  } finally {
    saving.value = false
  }
}

const handleError = (errors: any) => {
  console.error('[SegmentEditModal] Form validation errors:', errors)
  
  // Extract first error message for display
  let errorMessage = 'Please check the form for errors.'
  if (errors && typeof errors === 'object') {
    const firstErrorKey = Object.keys(errors)[0]
    if (firstErrorKey && errors[firstErrorKey]) {
      const firstError = Array.isArray(errors[firstErrorKey]) 
        ? errors[firstErrorKey][0] 
        : errors[firstErrorKey]
      errorMessage = `${firstErrorKey}: ${firstError?.message || firstError || 'Invalid value'}`
    }
  }
  
  toast.add({
    title: 'Validation Errors',
    description: errorMessage,
    color: 'error',
    timeout: 5000,
  })
}

const submitForm = () => {
  console.log('[SegmentEditModal] submitForm called, formRef:', formRef.value)
  
  if (!formRef.value) {
    console.error('[SegmentEditModal] formRef is null, cannot submit')
    toast.add({
      title: 'Form Error',
      description: 'Form reference is missing. Please try again.',
      color: 'error',
    })
    return
  }

  try {
    console.log('[SegmentEditModal] Calling formRef.submit()...')
    // Submit the form - this will trigger the @submit handler which validates and calls handleSave
    formRef.value.submit()
  } catch (error: any) {
    console.error('[SegmentEditModal] Error calling formRef.submit():', error)
    toast.add({
      title: 'Form Submission Error',
      description: error.message || 'Failed to submit form. Please check your inputs.',
      color: 'error',
    })
  }
}

const close = () => {
  isOpen.value = false
}
</script>


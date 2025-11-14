<template>
  <UModal v-model:open="isOpen" title="Edit Segment" :ui="{ width: 'sm:max-w-2xl' }">
    <template #body>
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
          />
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
          />
          <p v-if="form.visualPromptAlternatives && form.visualPromptAlternatives.length > 0" class="text-xs text-gray-500 mt-1">
            You can edit the selected prompt above, or choose a different alternative.
          </p>
        </UFormField>

        <UFormField label="Audio Notes" name="audioNotes">
          <UTextarea
            v-model="form.audioNotes"
            placeholder="Optional notes about audio, voiceover, or music for this segment..."
            :rows="2"
          />
        </UFormField>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <UFormField 
            label="First Frame Image (Optional)" 
            name="firstFrameImage"
            description="Override global first frame image for this segment."
          >
            <ImageUpload v-model="form.firstFrameImage" @upload="handleImageUpload('firstFrameImage', $event)" />
          </UFormField>

          <UFormField 
            label="Subject Reference (Optional)" 
            name="subjectReference"
            description="Override global subject reference for this segment."
          >
            <ImageUpload v-model="form.subjectReference" @upload="handleImageUpload('subjectReference', $event)" />
          </UFormField>
        </div>
      </UForm>
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
import ImageUpload from '~/components/ui/ImageUpload.vue'

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

// Create base schema
const baseSchema = z.object({
  type: z.enum(['hook', 'body', 'cta']),
  description: z.string().min(1, 'Description is required').max(500, 'Description must be less than 500 characters'),
  startTime: z.number().min(0, 'Start time must be 0 or greater'),
  endTime: z.number().min(0, 'End time must be 0 or greater'),
  visualPrompt: z.string().min(1, 'Visual prompt is required').max(1000, 'Visual prompt must be less than 1000 characters'),
  audioNotes: z.string().max(500, 'Audio notes must be less than 500 characters').optional().or(z.literal('')),
  firstFrameImage: z.union([z.instanceof(File), z.string()]).optional().nullable(),
  subjectReference: z.union([z.instanceof(File), z.string()]).optional().nullable(),
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

const form = reactive<Segment & { audioNotes?: string }>({
  type: 'hook',
  description: '',
  startTime: 0,
  endTime: 0,
  visualPrompt: '',
  visualPromptAlternatives: undefined,
  selectedPromptIndex: undefined,
  audioNotes: '',
  firstFrameImage: undefined,
  subjectReference: undefined,
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
    form.firstFrameImage = newSegment.firstFrameImage
    form.subjectReference = newSegment.subjectReference
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

const handleImageUpload = (field: 'firstFrameImage' | 'subjectReference', file: File | string | null) => {
  form[field] = file as any
}

const handleSave = async (event: any) => {
  const data = event.data || form
  
  saving.value = true
  
  try {
    // Validate with schema
    const validated = schema.value.parse(data)
    
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
    const updatedSegment: Segment & { firstFrameImage?: File | string, subjectReference?: File | string } = {
      type: validated.type,
      description: validated.description,
      startTime: validated.startTime,
      endTime: validated.endTime,
      visualPrompt: validated.visualPrompt,
      ...(form.visualPromptAlternatives ? { visualPromptAlternatives: form.visualPromptAlternatives } : {}),
      ...(form.selectedPromptIndex !== undefined ? { selectedPromptIndex: form.selectedPromptIndex } : {}),
      ...(validated.audioNotes ? { audioNotes: validated.audioNotes } : {}),
      ...(validated.firstFrameImage ? { firstFrameImage: validated.firstFrameImage } : {}),
      ...(validated.subjectReference ? { subjectReference: validated.subjectReference } : {}),
    }
    
    // Emit saved event with updated segment
    emit('saved', updatedSegment, props.segmentIndex ?? -1)
    
    close()
  } catch (error: any) {
    console.error('Save error:', error)
    if (error.errors && error.errors.length > 0) {
      const firstError = error.errors[0]
      toast.add({
        title: 'Validation Error',
        description: firstError.message || 'Please check your input',
        color: 'error',
      })
    } else {
      toast.add({
        title: 'Save Failed',
        description: error.message || 'Failed to save segment. Please try again.',
        color: 'error',
      })
    }
  } finally {
    saving.value = false
  }
}

const handleError = (errors: any) => {
  console.error('Form errors:', errors)
}

const submitForm = () => {
  if (formRef.value) {
    formRef.value.submit()
  }
}

const close = () => {
  isOpen.value = false
}
</script>


<template>
  <UModal v-model="isOpen" class="sm:max-w-md">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Choose Your Avatar
          </h3>
          <UButton
            variant="ghost"
            color="neutral"
            icon="i-heroicons-x-mark"
            @click="close"
          />
        </div>
      </template>

      <div class="grid grid-cols-3 gap-4 p-2">
        <button
          v-for="avatar in avatars"
          :key="avatar.id"
          :class="[
            'text-center p-3 rounded-lg transition-all',
            'hover:bg-gray-100 dark:hover:bg-gray-800',
            currentAvatarId === avatar.id
              ? 'ring-2 ring-secondary-500 bg-secondary-50 dark:bg-secondary-900/20'
              : '',
          ]"
          @click="selectAvatar(avatar.id)"
        >
          <img
            :src="avatar.thumbnailPath"
            :alt="avatar.displayName"
            class="w-24 h-24 rounded-full mx-auto mb-2 object-cover border-2"
            :class="currentAvatarId === avatar.id ? 'border-secondary-500' : 'border-gray-200 dark:border-gray-700'"
            @error="handleImageError"
          />
          <p class="mt-2 font-medium text-sm text-gray-900 dark:text-white">
            {{ avatar.displayName }}
          </p>
        </button>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton color="secondary" @click="close">
            Done
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import { getAllAvatars, type Avatar } from '~/config/avatars'

const props = defineProps<{
  modelValue: boolean
  currentAvatarId?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'select': [avatarId: string]
}>()

const avatars = getAllAvatars()
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const currentAvatarId = computed(() => props.currentAvatarId)

const selectAvatar = (avatarId: string) => {
  emit('select', avatarId)
  close()
}

const close = () => {
  isOpen.value = false
}

const handleImageError = (event: Event) => {
  // Fallback to placeholder if image fails to load
  const img = event.target as HTMLImageElement
  img.src = '/avatars/placeholder.png'
}
</script>


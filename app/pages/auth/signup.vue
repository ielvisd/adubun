<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-12 sm:px-6 lg:px-8">
    <UContainer class="max-w-md w-full">
      <UCard>
        <template #header>
          <h2 class="text-2xl font-bold text-center text-gray-900 dark:text-white">
            Create your account
          </h2>
        </template>

        <UForm :state="form" @submit="handleSubmit" class="space-y-4">
          <UFormField label="Email" name="email" required>
            <div class="relative">
              <UInput
                ref="emailInputRef"
                v-model="form.email"
                type="email"
                placeholder="you@example.com"
                autocomplete="email"
                :disabled="loading"
                class="w-full pr-10"
              />
              <div class="absolute right-3 top-1/2 -translate-y-1/2">
                <UiVoiceInputButton
                  :is-supported="emailVoiceInput.isSupported.value"
                  :is-listening="emailVoiceInput.isListening.value"
                  :error="emailVoiceInput.error.value"
                  :disabled="loading"
                  @click="handleEmailVoiceInput"
                />
              </div>
            </div>
          </UFormField>

          <UFormField label="Password" name="password" required>
            <div class="relative">
              <UInput
                ref="passwordInputRef"
                v-model="form.password"
                type="password"
                placeholder="••••••••"
                autocomplete="new-password"
                :disabled="loading"
                class="w-full pr-10"
              />
              <div class="absolute right-3 top-1/2 -translate-y-1/2">
                <UiVoiceInputButton
                  :is-supported="passwordVoiceInput.isSupported.value"
                  :is-listening="passwordVoiceInput.isListening.value"
                  :error="passwordVoiceInput.error.value"
                  :disabled="loading"
                  @click="handlePasswordVoiceInput"
                />
              </div>
            </div>
            <template #description>
              Password must be at least 6 characters
            </template>
          </UFormField>

          <UFormField label="Confirm Password" name="confirmPassword" required>
            <div class="relative">
              <UInput
                ref="confirmPasswordInputRef"
                v-model="form.confirmPassword"
                type="password"
                placeholder="••••••••"
                autocomplete="new-password"
                :disabled="loading"
                class="w-full pr-10"
              />
              <div class="absolute right-3 top-1/2 -translate-y-1/2">
                <UiVoiceInputButton
                  :is-supported="confirmPasswordVoiceInput.isSupported.value"
                  :is-listening="confirmPasswordVoiceInput.isListening.value"
                  :error="confirmPasswordVoiceInput.error.value"
                  :disabled="loading"
                  @click="handleConfirmPasswordVoiceInput"
                />
              </div>
            </div>
          </UFormField>

          <UAlert
            v-if="error"
            color="red"
            variant="soft"
            :title="error"
            class="mt-4"
          />

          <UButton
            type="submit"
            color="secondary"
            :loading="loading"
            :disabled="loading || form.password !== form.confirmPassword"
            class="w-full bg-secondary-500 hover:bg-secondary-600 text-white font-semibold"
          >
            Sign Up
          </UButton>
        </UForm>

        <template #footer>
          <p class="text-center text-sm text-gray-600 dark:text-gray-400">
            Already have an account?
            <NuxtLink to="/auth/login" class="text-secondary-500 hover:text-secondary-600 font-medium">
              Sign in
            </NuxtLink>
          </p>
        </template>
      </UCard>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
})

const { signUp, error: authError, loading: authLoading } = useAuth()
const toast = useToast()
const router = useRouter()

const form = reactive({
  email: '',
  password: '',
  confirmPassword: '',
})

const emailInputRef = ref<HTMLInputElement | null>(null)
const passwordInputRef = ref<HTMLInputElement | null>(null)
const confirmPasswordInputRef = ref<HTMLInputElement | null>(null)

// Voice input for email
const emailVoiceInput = useVoiceInput((text: string) => {
  form.email = form.email.trim() ? `${form.email} ${text}` : text
})

// Voice input for password
const passwordVoiceInput = useVoiceInput((text: string) => {
  form.password = form.password.trim() ? `${form.password} ${text}` : text
})

// Voice input for confirm password
const confirmPasswordVoiceInput = useVoiceInput((text: string) => {
  form.confirmPassword = form.confirmPassword.trim() ? `${form.confirmPassword} ${text}` : text
})

const handleEmailVoiceInput = async () => {
  if (emailVoiceInput.isListening.value) {
    emailVoiceInput.stopListening()
  } else {
    try {
      await emailVoiceInput.startListening()
    } catch (err) {
      // Error is handled by the composable
    }
  }
}

const handlePasswordVoiceInput = async () => {
  if (passwordVoiceInput.isListening.value) {
    passwordVoiceInput.stopListening()
  } else {
    try {
      await passwordVoiceInput.startListening()
    } catch (err) {
      // Error is handled by the composable
    }
  }
}

const handleConfirmPasswordVoiceInput = async () => {
  if (confirmPasswordVoiceInput.isListening.value) {
    confirmPasswordVoiceInput.stopListening()
  } else {
    try {
      await confirmPasswordVoiceInput.startListening()
    } catch (err) {
      // Error is handled by the composable
    }
  }
}

// Keyboard shortcut handler
const handleKeyDown = (event: KeyboardEvent) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const modifier = isMac ? event.metaKey : event.ctrlKey
  
  if (modifier && event.shiftKey && event.key === 'V') {
    const activeElement = document.activeElement
    if (activeElement === emailInputRef.value) {
      event.preventDefault()
      handleEmailVoiceInput()
    } else if (activeElement === passwordInputRef.value) {
      event.preventDefault()
      handlePasswordVoiceInput()
    } else if (activeElement === confirmPasswordInputRef.value) {
      event.preventDefault()
      handleConfirmPasswordVoiceInput()
    }
  }
}

onMounted(() => {
  if (process.client) {
    window.addEventListener('keydown', handleKeyDown)
  }
})

onUnmounted(() => {
  if (process.client) {
    window.removeEventListener('keydown', handleKeyDown)
    emailVoiceInput.stopListening()
    passwordVoiceInput.stopListening()
    confirmPasswordVoiceInput.stopListening()
  }
})

const loading = computed(() => authLoading.value)
const error = computed(() => authError.value)

const handleSubmit = async () => {
  if (form.password !== form.confirmPassword) {
    toast.add({
      title: 'Error',
      description: 'Passwords do not match',
      color: 'red',
    })
    return
  }

  if (form.password.length < 6) {
    toast.add({
      title: 'Error',
      description: 'Password must be at least 6 characters',
      color: 'red',
    })
    return
  }

  const { user, error: signUpError } = await signUp(form.email, form.password)
  
  if (user && !signUpError) {
    toast.add({
      title: 'Success',
      description: 'Account created successfully',
      color: 'green',
    })
    await router.push('/')
  } else if (signUpError) {
    toast.add({
      title: 'Error',
      description: signUpError,
      color: 'red',
    })
  }
}
</script>



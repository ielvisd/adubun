<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-12 sm:px-6 lg:px-8">
    <UContainer class="max-w-md w-full">
      <UCard>
        <template #header>
          <h2 class="text-2xl font-bold text-center text-gray-900 dark:text-white">
            Sign in to AdUbun
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
                autocomplete="current-password"
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
          </UFormField>

          <UAlert
            v-if="error"
            color="red"
            variant="soft"
            :title="error"
            class="mt-4"
          />

          <div class="flex flex-col gap-2">
            <UButton
              type="submit"
              color="secondary"
              :loading="loading"
              :disabled="loading"
              class="w-full bg-secondary-500 hover:bg-secondary-600 text-white font-semibold"
            >
              Sign In
            </UButton>

            <UButton
              v-if="isDev"
              type="button"
              variant="outline"
              @click="handleDemoLogin"
              :loading="loading"
              :disabled="loading"
              class="w-full"
            >
              Demo Login (Dev Only)
            </UButton>
          </div>
        </UForm>

        <template #footer>
          <p class="text-center text-sm text-gray-600 dark:text-gray-400">
            Don't have an account?
            <NuxtLink to="/auth/signup" class="text-secondary-500 hover:text-secondary-600 font-medium">
              Sign up
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

const { signIn, demoLogin, error: authError, loading: authLoading } = useAuth()
const toast = useToast()
const router = useRouter()

const isDev = process.dev

const form = reactive({
  email: '',
  password: '',
})

const emailInputRef = ref<HTMLInputElement | null>(null)
const passwordInputRef = ref<HTMLInputElement | null>(null)

// Voice input for email
const emailVoiceInput = useVoiceInput((text: string) => {
  form.email = form.email.trim() ? `${form.email} ${text}` : text
})

// Voice input for password
const passwordVoiceInput = useVoiceInput((text: string) => {
  form.password = form.password.trim() ? `${form.password} ${text}` : text
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
  }
})

const loading = computed(() => authLoading.value)
const error = computed(() => authError.value)

const handleSubmit = async () => {
  const { user, error: signInError } = await signIn(form.email, form.password)
  
  if (user && !signInError) {
    toast.add({
      title: 'Success',
      description: 'Signed in successfully',
      color: 'green',
    })
    await router.push('/')
  } else if (signInError) {
    toast.add({
      title: 'Error',
      description: signInError,
      color: 'red',
    })
  }
}

const handleDemoLogin = async () => {
  if (!isDev) {
    toast.add({
      title: 'Error',
      description: 'Demo login only available in development mode',
      color: 'red',
    })
    return
  }

  try {
    const { user, error: demoError } = await demoLogin()
    
    if (user && !demoError) {
      toast.add({
        title: 'Success',
        description: 'Demo login successful',
        color: 'green',
      })
      await router.push('/')
    } else if (demoError) {
      toast.add({
        title: 'Error',
        description: demoError,
        color: 'red',
      })
    }
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.message || 'Demo login failed',
      color: 'red',
    })
  }
}
</script>



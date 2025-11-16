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
            <UInput
              v-model="form.email"
              type="email"
              placeholder="you@example.com"
              autocomplete="email"
              :disabled="loading"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Password" name="password" required>
            <UInput
              v-model="form.password"
              type="password"
              placeholder="••••••••"
              autocomplete="current-password"
              :disabled="loading"
              class="w-full"
            />
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



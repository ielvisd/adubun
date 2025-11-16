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
              autocomplete="new-password"
              :disabled="loading"
              class="w-full"
            />
            <template #description>
              Password must be at least 6 characters
            </template>
          </UFormField>

          <UFormField label="Confirm Password" name="confirmPassword" required>
            <UInput
              v-model="form.confirmPassword"
              type="password"
              placeholder="••••••••"
              autocomplete="new-password"
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



<template>
  <div class="min-h-screen bg-mendo-white dark:bg-mendo-black py-8 sm:py-12">
    <UContainer class="max-w-2xl px-4 sm:px-6">
      <!-- Header -->
      <div class="mb-8">
        <UButton
          variant="ghost"
          color="gray"
          @click="router.push('/create')"
          class="mb-4"
        >
          <UIcon name="i-heroicons-arrow-left" class="w-4 h-4 mr-2" />
          Back to Categories
        </UButton>
        <h1 class="text-3xl sm:text-4xl font-bold text-mendo-black dark:text-mendo-white mb-3">
          Tell Us About Your Product
        </h1>
        <p class="text-lg text-mendo-black/70 dark:text-mendo-white/70">
          Just 3 quick fields and we'll handle the rest
        </p>
      </div>

      <!-- Form Card -->
      <div class="bg-mendo-white dark:bg-mendo-black rounded-3xl shadow-xl border border-mendo-light-grey dark:border-mendo-light-grey/30 p-6 sm:p-10">
        <ProductDetailsForm />
      </div>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
import ProductDetailsForm from '~/components/create/ProductDetailsForm.vue'

const router = useRouter()
</script>



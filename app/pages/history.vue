<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 sm:py-12">
    <UContainer class="max-w-6xl px-4 sm:px-6">
      <div class="mb-6 sm:mb-8">
        <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Your Ads
        </h1>
        <p class="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
          View and manage your generated ad videos
        </p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-24">
        <UIcon name="i-heroicons-arrow-path" class="w-16 h-16 text-secondary-500 animate-spin mb-4" />
        <p class="text-gray-600 dark:text-gray-400">Loading your ads...</p>
      </div>

      <!-- Error State -->
      <UAlert
        v-else-if="error"
        color="red"
        variant="soft"
        :title="error"
        class="mb-6"
      />

      <!-- Ads List -->
      <div v-else-if="ads.length > 0" class="space-y-4">
        <UCard
          v-for="ad in ads"
          :key="ad.id"
          class="bg-white dark:bg-gray-800 hover:shadow-lg transition-shadow cursor-pointer"
          @click="viewAd(ad.id)"
          role="button"
          tabindex="0"
          @keydown.enter="viewAd(ad.id)"
          @keydown.space.prevent="viewAd(ad.id)"
        >
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div class="flex-1 min-w-0">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-1 truncate">
                {{ ad.title || `Ad ${ad.id}` }}
              </h3>
              <div class="flex flex-wrap items-center gap-3 sm:gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span class="flex items-center gap-1">
                  <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
                  {{ formatDate(ad.createdAt || ad.date) }}
                </span>
                <UBadge
                  :color="getStatusColor(ad.status)"
                  variant="soft"
                  size="sm"
                >
                  {{ ad.status || 'unknown' }}
                </UBadge>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <UButton
                variant="ghost"
                color="gray"
                size="sm"
                @click.stop="viewAd(ad.id)"
                class="min-h-[44px]"
              >
                View
              </UButton>
              <UButton
                variant="ghost"
                color="red"
                size="sm"
                @click.stop="deleteAd(ad.id)"
                class="min-h-[44px]"
              >
                <UIcon name="i-heroicons-trash" class="w-4 h-4" />
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Pagination -->
        <UPagination
          v-if="total > limit"
          v-model="page"
          :total="total"
          :page-size="limit"
          class="mt-6 justify-center"
        />
      </div>

      <!-- Empty State -->
      <UCard v-else class="bg-white dark:bg-gray-800 text-center py-12">
        <UIcon name="i-heroicons-video-camera" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          No Ads Yet
        </h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          Create your first ad to get started
        </p>
        <UButton
          color="secondary"
          variant="solid"
          @click="$router.push('/')"
          class="bg-secondary-500 hover:bg-secondary-600 text-white font-semibold min-h-[44px]"
        >
          Create Ad
        </UButton>
      </UCard>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const loading = ref(true)
const error = ref<string | null>(null)
const ads = ref<Array<{
  id: string
  title?: string
  date?: number
  createdAt?: number
  status?: string
}>>([])
const total = ref(0)
const limit = ref(50)
const page = ref(1)

const fetchHistory = async () => {
  loading.value = true
  error.value = null
  try {
    const response = await $fetch('/api/history', {
      query: {
        limit: limit.value,
        offset: (page.value - 1) * limit.value,
      },
    })
    ads.value = response.videos || response.ads || []
    total.value = response.total || ads.value.length
  } catch (err: any) {
    console.error('Failed to fetch history:', err)
    error.value = err.data?.message || err.message || 'Failed to load ads'
  } finally {
    loading.value = false
  }
}

const formatDate = (timestamp: number | string | undefined) => {
  if (!timestamp) return 'Unknown date'
  const date = new Date(typeof timestamp === 'string' ? parseInt(timestamp) : timestamp)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const getStatusColor = (status: string | undefined) => {
  switch (status?.toLowerCase()) {
    case 'completed':
    case 'done':
      return 'green'
    case 'processing':
    case 'in-progress':
      return 'blue'
    case 'failed':
    case 'error':
      return 'red'
    default:
      return 'gray'
  }
}

const viewAd = (id: string) => {
  navigateTo(`/preview?videoId=${id}`)
}

const deleteAd = async (id: string) => {
  if (!confirm('Are you sure you want to delete this ad?')) {
    return
  }

  try {
    await $fetch(`/api/video/${id}`, {
      method: 'DELETE',
    })
    await fetchHistory()
    const toast = useToast()
    toast.add({
      title: 'Deleted',
      description: 'Ad deleted successfully',
      color: 'green',
    })
  } catch (err: any) {
    const toast = useToast()
    toast.add({
      title: 'Error',
      description: err.data?.message || err.message || 'Failed to delete ad',
      color: 'red',
    })
  }
}

watch(page, () => {
  fetchHistory()
})

onMounted(() => {
  fetchHistory()
})
</script>

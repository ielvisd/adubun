<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">Generation History</h1>

    <UTable
      :rows="videos"
      :columns="columns"
      :loading="loading"
    >
      <template #actions-data="{ row }">
        <UButton
          size="sm"
          variant="ghost"
          color="primary"
          @click="viewVideo(row.id)"
        >
          View
        </UButton>
        <UButton
          size="sm"
          variant="ghost"
          color="error"
          @click="deleteVideo(row.id)"
        >
          Delete
        </UButton>
      </template>
    </UTable>

    <UPagination
      v-if="total > limit"
      v-model="page"
      :total="total"
      :page-size="limit"
      class="mt-6"
    />
  </div>
</template>

<script setup lang="ts">
const loading = ref(true)
const videos = ref([])
const total = ref(0)
const limit = ref(50)
const page = ref(1)

const columns = [
  { key: 'id', label: 'ID', id: 'id' },
  { key: 'duration', label: 'Duration (s)', id: 'duration' },
  { key: 'resolution', label: 'Resolution', id: 'resolution' },
  { key: 'generationCost', label: 'Cost', id: 'generationCost' },
  { key: 'createdAt', label: 'Created', id: 'createdAt' },
  { key: 'actions', label: 'Actions', id: 'actions' },
]

const fetchHistory = async () => {
  loading.value = true
  try {
    const response = await $fetch('/api/history', {
      query: {
        limit: limit.value,
        offset: (page.value - 1) * limit.value,
      },
    })
    videos.value = response.videos
    total.value = response.total
  } catch (error) {
    console.error('Failed to fetch history:', error)
  } finally {
    loading.value = false
  }
}

const viewVideo = (id: string) => {
  navigateTo(`/watch/${id}`)
}

const deleteVideo = async (id: string) => {
  try {
    await $fetch(`/api/video/${id}`, {
      method: 'DELETE',
    })
    await fetchHistory()
  } catch (error) {
    console.error('Failed to delete video:', error)
  }
}

watch(page, () => {
  fetchHistory()
})

onMounted(() => {
  fetchHistory()
})
</script>


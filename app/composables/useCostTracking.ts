export const useCostTracking = () => {
  const currentCost = ref(0)
  const estimatedTotal = ref(0)
  const breakdown = ref<Record<string, number>>({})

  const updateCosts = async () => {
    try {
      const summary = await $fetch('/api/cost/summary')
      currentCost.value = summary.current || 0
      estimatedTotal.value = summary.estimated || 0
      breakdown.value = summary.breakdown || {}
    } catch (error) {
      console.error('Failed to update costs:', error)
    }
  }

  // Poll for cost updates
  const startPolling = (interval = 5000) => {
    updateCosts() // Initial load
    
    const intervalId = setInterval(updateCosts, interval)
    
    onUnmounted(() => {
      clearInterval(intervalId)
    })
  }

  return {
    currentCost,
    estimatedTotal,
    breakdown,
    updateCosts,
    startPolling,
  }
}


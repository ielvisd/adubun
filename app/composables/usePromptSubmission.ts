export const usePromptSubmission = () => {
  const { user } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const isLoading = ref(false)

  const handleSubmit = async (formData: any) => {
    console.log('[Index] handleSubmit called with:', formData)
    
    // Check authentication - in dev mode, allow demo login
    // Only check process.dev on client side to avoid hydration issues
    const isDev = process.client ? process.dev : false
    // Auth check disabled - allow public access
    // if (!user.value && !isDev) {
    //   toast.add({
    //     title: 'Authentication Required',
    //     description: 'Please sign in to create an ad',
    //     color: 'warning',
    //     icon: 'i-heroicons-lock-closed',
    //   })
    //   await router.push('/auth/login')
    //   return
    // }

    // In dev mode, if no user, use demo login
    if (!user.value && isDev) {
      console.log('[Index] No user in dev mode, using demo login')
      const { demoLogin } = useAuth()
      try {
        await demoLogin()
      } catch (err) {
        console.warn('[Index] Demo login failed:', err)
      }
    }

    isLoading.value = true
    try {
      // Upload product images if they are Files
      let uploadedImageUrls: string[] = []
      
      if (formData.productImages && Array.isArray(formData.productImages)) {
        const filesToUpload = formData.productImages.filter((img: any) => img instanceof File)
        const existingUrls = formData.productImages.filter((img: any) => typeof img === 'string')
        
        if (filesToUpload.length > 0) {
          // Upload files to S3
          const formDataToSend = new FormData()
          filesToUpload.forEach((file: File) => {
            formDataToSend.append('images', file)
          })
          
          const uploadResult = await $fetch<{ urls: string[]; count: number }>('/api/upload-images-s3', {
            method: 'POST',
            body: formDataToSend,
          })
          
          uploadedImageUrls = [...existingUrls, ...(uploadResult.urls || [])]
        } else {
          uploadedImageUrls = existingUrls
        }
      }

      // Upload person reference if it's a File
      let uploadedPersonReferenceUrl: string | undefined
      
      if (formData.personReference && Array.isArray(formData.personReference) && formData.personReference.length > 0) {
        const personFile = formData.personReference[0]
        
        if (personFile instanceof File) {
          // Upload person reference to S3
          const formDataToSend = new FormData()
          formDataToSend.append('images', personFile)
          
          const uploadResult = await $fetch<{ urls: string[]; count: number }>('/api/upload-images-s3', {
            method: 'POST',
            body: formDataToSend,
          })
          
          uploadedPersonReferenceUrl = uploadResult.urls[0]
        } else if (typeof personFile === 'string') {
          uploadedPersonReferenceUrl = personFile
        }
      }

      // Store form data in sessionStorage with uploaded URLs
      if (process.client) {
        sessionStorage.setItem('promptData', JSON.stringify({
          prompt: formData.prompt,
          productImages: uploadedImageUrls,
          personReference: uploadedPersonReferenceUrl,
          aspectRatio: formData.aspectRatio,
          model: formData.model,
          mood: formData.mood,
          adType: formData.adType,
          generateVoiceover: formData.generateVoiceover || false,
          seamlessTransition: formData.seamlessTransition ?? true, // Default to true (seamless ON)
        }))
      }

      // Navigate to appropriate stories page based on seamlessTransition flag
      const seamlessTransition = formData.seamlessTransition ?? true
      const targetPage = seamlessTransition ? '/stories' : '/stories-seam'
      console.log(`[Index] Navigating to ${targetPage} (seamlessTransition: ${seamlessTransition})`)
      await navigateTo(targetPage)
    } catch (error: any) {
      const errorMessage = error.data?.message || error.message || 'Failed to upload images'
      toast.add({
        title: 'Error',
        description: errorMessage,
        color: 'error',
        icon: 'i-heroicons-exclamation-circle',
      })
      isLoading.value = false
    }
  }

  return {
    handleSubmit,
    isLoading,
  }
}




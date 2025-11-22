export const useVoiceInput = (onTranscript?: (text: string) => void) => {
  const isSupported = ref(false)
  const isListening = ref(false)
  const error = ref<string | null>(null)
  const recognition = ref<SpeechRecognition | null>(null)
  const transcriptCallback = ref(onTranscript)

  // Check browser support
  const checkSupport = () => {
    if (typeof window === 'undefined') return false
    
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition
    return !!SpeechRecognition
  }

  // Initialize recognition
  const initRecognition = () => {
    if (typeof window === 'undefined') return null

    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return null

    const recognitionInstance = new SpeechRecognition()
    recognitionInstance.continuous = false
    recognitionInstance.interimResults = false
    recognitionInstance.lang = 'en-US'

    recognitionInstance.onstart = () => {
      isListening.value = true
      error.value = null
    }

    recognitionInstance.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join(' ')
      
      if (transcript.trim() && transcriptCallback.value) {
        transcriptCallback.value(transcript)
      }
    }

    recognitionInstance.onerror = (event: SpeechRecognitionErrorEvent) => {
      isListening.value = false
      
      let errorMessage = 'Speech recognition error'
      switch (event.error) {
        case 'no-speech':
          errorMessage = 'No speech detected. Please try again.'
          break
        case 'audio-capture':
          errorMessage = 'Microphone not found or access denied.'
          break
        case 'not-allowed':
          errorMessage = 'Microphone permission denied. Please allow microphone access.'
          break
        case 'network':
          errorMessage = 'Network error. Please check your connection.'
          break
        case 'aborted':
          // User stopped, not really an error
          break
        default:
          errorMessage = `Speech recognition error: ${event.error}`
      }
      
      if (event.error !== 'aborted') {
        error.value = errorMessage
      }
    }

    recognitionInstance.onend = () => {
      isListening.value = false
    }

    return recognitionInstance
  }

  // Start listening
  const startListening = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!isSupported.value) {
        const err = 'Speech recognition is not supported in this browser.'
        error.value = err
        reject(new Error(err))
        return
      }

      if (!recognition.value) {
        recognition.value = initRecognition()
        if (!recognition.value) {
          const err = 'Failed to initialize speech recognition.'
          error.value = err
          reject(new Error(err))
          return
        }
      }

      // Store original callback and set temporary one for promise
      const originalCallback = transcriptCallback.value
      transcriptCallback.value = (text: string) => {
        if (originalCallback) originalCallback(text)
        resolve(text)
        transcriptCallback.value = originalCallback
      }

      try {
        recognition.value.start()
      } catch (err: any) {
        error.value = err.message || 'Failed to start speech recognition.'
        transcriptCallback.value = originalCallback
        reject(err)
      }
    })
  }

  // Stop listening
  const stopListening = () => {
    if (recognition.value && isListening.value) {
      try {
        recognition.value.stop()
      } catch (err) {
        // Ignore errors when stopping
      }
    }
    isListening.value = false
  }

  // Toggle listening
  const toggleListening = (): Promise<string | null> => {
    if (isListening.value) {
      stopListening()
      return Promise.resolve(null)
    } else {
      return startListening()
    }
  }

  // Set transcript callback
  const setCallback = (callback: (text: string) => void) => {
    transcriptCallback.value = callback
  }

  // Initialize on mount
  onMounted(() => {
    isSupported.value = checkSupport()
    if (isSupported.value) {
      recognition.value = initRecognition()
    }
  })

  // Cleanup on unmount
  onUnmounted(() => {
    stopListening()
    recognition.value = null
  })

  return {
    isSupported: readonly(isSupported),
    isListening: readonly(isListening),
    error: readonly(error),
    startListening,
    stopListening,
    toggleListening,
    setCallback,
  }
}


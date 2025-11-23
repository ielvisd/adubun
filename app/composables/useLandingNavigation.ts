import { DEFAULT_MODEL_ID } from '~/config/video-models'
import type { ExamplePrompt } from '~/config/example-prompts'

export const useLandingNavigation = (handleSubmit?: (formData: any) => Promise<void>) => {
  const scrollToExamples = () => {
    if (process.client && typeof document !== 'undefined') {
      const examplesSection = document.getElementById('examples-section')
      if (examplesSection) {
        examplesSection.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }

  const useExample = (example: ExamplePrompt) => {
    if (process.client && handleSubmit) {
      // Submit the example directly - handleSubmit will navigate to /stories
      handleSubmit({
        prompt: example.prompt,
        productImages: [],
        aspectRatio: example.aspectRatio,
        model: DEFAULT_MODEL_ID,
        generateVoiceover: false,
        adType: example.adType || 'lifestyle',
        mood: example.style,
        seamlessTransition: true, // Examples default to seamless
      })
    }
  }

  return {
    scrollToExamples,
    useExample,
  }
}



import { callReplicateMCP, callOpenAIMCP } from '~/server/utils/mcp-client'

export const useMCP = () => {
  // Replicate operations
  const generateVideo = async (
    prompt: string,
    duration: number = 5,
    aspectRatio: string = '16:9',
    model: string = 'google/veo-3.1'
  ) => {
    return await callReplicateMCP('generate_video', {
      model,
      prompt,
      duration,
      aspect_ratio: aspectRatio,
    })
  }

  const checkPredictionStatus = async (predictionId: string) => {
    return await callReplicateMCP('check_prediction_status', { predictionId })
  }

  const getPredictionResult = async (predictionId: string) => {
    return await callReplicateMCP('get_prediction_result', { predictionId })
  }

  // OpenAI operations
  const chatCompletion = async (
    model: string,
    messages: Array<{ role: string; content: string }>,
    responseFormat?: { type: string }
  ) => {
    return await callOpenAIMCP('chat_completion', {
      model,
      messages,
      response_format: responseFormat,
    })
  }

  const parsePrompt = async (prompt: string) => {
    const result = await callOpenAIMCP('parse_prompt', { prompt })
    return JSON.parse(result.content)
  }

  const planStoryboard = async (
    parsed: any,
    duration: number,
    style: string
  ) => {
    const result = await callOpenAIMCP('plan_storyboard', {
      parsed,
      duration,
      style,
    })
    return JSON.parse(result.content)
  }

  // OpenAI TTS operations
  const textToSpeech = async (
    text: string,
    voice: string = 'alloy',
    model: string = 'tts-1'
  ) => {
    return await callOpenAIMCP('text_to_speech', {
      text,
      voice,
      model,
    })
  }

  return {
    // Replicate
    generateVideo,
    checkPredictionStatus,
    getPredictionResult,
    // OpenAI
    chatCompletion,
    parsePrompt,
    planStoryboard,
    textToSpeech,
  }
}


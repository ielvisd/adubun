import { readStoryboard, saveStoryboard } from '../../utils/storage'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Storyboard ID required',
    })
  }

  const body = await readBody(event)
  
  try {
    const existing = await readStoryboard(id)
    const updated = {
      ...existing,
      ...body,
      updatedAt: Date.now(),
    }

    await saveStoryboard(updated)
    return updated
  } catch (error: any) {
    throw createError({
      statusCode: 404,
      message: `Storyboard not found: ${error.message}`,
    })
  }
})


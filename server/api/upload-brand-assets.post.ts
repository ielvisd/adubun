import { saveAsset } from '../utils/storage'

export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event)
  
  if (!formData) {
    throw createError({
      statusCode: 400,
      message: 'No file uploaded',
    })
  }

  const files = formData.filter(item => item.filename)
  const uploadedFiles: string[] = []

  for (const file of files) {
    if (file.data && file.filename) {
      const extension = file.filename.split('.').pop() || 'tmp'
      const filePath = await saveAsset(Buffer.from(file.data), extension)
      uploadedFiles.push(filePath)
    }
  }

  return {
    files: uploadedFiles,
    count: uploadedFiles.length,
  }
})


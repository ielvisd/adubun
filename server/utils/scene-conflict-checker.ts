/**
 * Utility to detect scene conflicts where solution items are already present in hook scenes
 * Uses OpenAI Vision API and GPT-4o to analyze frames and extract solution items
 */

import type { Segment, Story } from '~/types/generation'
import { callOpenAIMCP } from './mcp-client'

/**
 * Extracts the solution item from a body segment's visual prompt and description
 * @param segment - The body segment containing the solution action
 * @param story - The story object for additional context
 * @returns Promise with extracted item information including action type classification
 */
export async function extractSolutionItem(
  segment: Segment,
  story: Story
): Promise<{ item: string; action: string; actionType: 'bringing' | 'interacting'; confidence: number } | null> {
  if (!segment.visualPrompt && !segment.description) {
    console.warn('[Scene Conflict Checker] No visual prompt or description in segment')
    return null
  }

  try {
    const systemPrompt = `You are analyzing a video ad segment to extract the specific physical item or object that is being brought, offered, provided, or used as a solution.

Your task is to identify:
1. The specific physical item/object (e.g., "coffee cup", "tool", "product", "beverage")
2. The action being performed with it (e.g., "brings", "offers", "refills", "uses")
3. The action type classification: "bringing" or "interacting"
4. Your confidence level (0.0 to 1.0)

CRITICAL ACTION TYPE CLASSIFICATION:
- **"bringing" actions**: These actions introduce a NEW item into the scene. Examples: "brings", "offers", "provides", "delivers", "presents", "gives", "hands", "brings over"
  - These are conflicts if the item already exists in the hook scene
  
- **"interacting" actions**: These actions work with an EXISTING item already in the scene. Examples: "refills", "uses", "interacts with", "helps with", "assists with", "operates", "activates", "manipulates", "works with"
  - These are NOT conflicts - the item is expected to already be present

CRITICAL: Only extract items that are PHYSICAL OBJECTS being brought/offered/provided. Do NOT extract:
- Abstract concepts (e.g., "help", "assistance", "solution")
- Actions without objects (e.g., "helps organize" without a specific item)
- Emotional states or feelings

If no clear physical item is being brought/offered, return null.

Return ONLY valid JSON with this structure:
{
  "item": "string (the specific physical item)",
  "action": "string (the action verb)",
  "actionType": "bringing" or "interacting",
  "confidence": number (0.0 to 1.0)
}

If no item can be identified, return:
{
  "item": null,
  "action": null,
  "actionType": null,
  "confidence": 0.0
}`

    const userPrompt = `Analyze this video segment and extract the solution item:

Segment Description: ${segment.description || 'N/A'}
Visual Prompt: ${segment.visualPrompt || 'N/A'}
Story Context: ${story.description || 'N/A'}

What specific physical item is being brought, offered, or provided as a solution in this segment? Classify the action as either "bringing" (introducing a new item) or "interacting" (working with an existing item).`

    const response = await callOpenAIMCP('chat_completion', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 200,
    })

    // Handle different response formats
    let data = response
    if (response.content && typeof response.content === 'string') {
      data = JSON.parse(response.content)
    } else if (response.content && Array.isArray(response.content) && response.content[0]?.text) {
      data = JSON.parse(response.content[0].text)
    } else if (typeof response === 'string') {
      data = JSON.parse(response)
    } else if (response.choices && response.choices[0]?.message?.content) {
      data = JSON.parse(response.choices[0].message.content)
    }

    // Check if extraction was successful
    if (!data.item || data.item === null || data.confidence < 0.5) {
      console.log('[Scene Conflict Checker] No solution item extracted or low confidence')
      return null
    }

    // Determine action type from response or infer from action verb
    let actionType: 'bringing' | 'interacting' = data.actionType || 'bringing'
    
    // If actionType not provided, infer from action verb
    if (!data.actionType && data.action) {
      const actionLower = data.action.toLowerCase()
      const bringingVerbs = ['brings', 'bring', 'offers', 'offer', 'provides', 'provide', 'delivers', 'deliver', 'presents', 'present', 'gives', 'give', 'hands', 'hand']
      const interactingVerbs = ['refills', 'refill', 'uses', 'use', 'interacts', 'interact', 'helps', 'help', 'assists', 'assist', 'operates', 'operate', 'activates', 'activate', 'manipulates', 'manipulate', 'works with', 'work with']
      
      if (bringingVerbs.some(verb => actionLower.includes(verb))) {
        actionType = 'bringing'
      } else if (interactingVerbs.some(verb => actionLower.includes(verb))) {
        actionType = 'interacting'
      }
    }

    console.log(`[Scene Conflict Checker] Extracted solution item: "${data.item}" (action: "${data.action}", actionType: "${actionType}", confidence: ${data.confidence})`)
    return {
      item: data.item,
      action: data.action || 'provides',
      actionType,
      confidence: data.confidence || 0.5,
    }
  } catch (error: any) {
    console.error('[Scene Conflict Checker] Error extracting solution item:', error.message)
    return null
  }
}

/**
 * Extracts the initial location of an item from the hook segment
 * @param item - The item name to find location for
 * @param hookSegment - The hook segment containing visual prompt and description
 * @param actionType - Optional: The action type ("bringing" or "interacting") to determine appropriate location
 * @returns Promise<string | null> - The initial location of the item (e.g., "on coffee table", "in robot's hands") or null if not found
 */
export async function extractItemInitialLocation(
  item: string,
  hookSegment: Segment,
  actionType?: 'bringing' | 'interacting'
): Promise<string | null> {
  if (!hookSegment.visualPrompt && !hookSegment.description) {
    console.warn('[Scene Conflict Checker] No visual prompt or description in hook segment')
    return null
  }

  try {
    const isBringingAction = actionType === 'bringing'
    
    // Check if robot/product is in hook segment
    const hookText = `${hookSegment.description} ${hookSegment.visualPrompt}`.toLowerCase()
    const robotInHook = /(?:robot|product|humanoid|unitree|g1|device|machine|assistant|helper)/i.test(hookText)
    
    // If item is being "brought" and robot is NOT in hook, item should NOT appear in hook
    if (isBringingAction && !robotInHook) {
      console.log(`[Scene Conflict Checker] Item "${item}" is being brought but robot not in hook - item should not appear in hook`)
      return null
    }
    
    const systemPrompt = `You are analyzing a video ad hook segment to determine where a specific item is initially located.

Your task is to identify the EXACT initial location of the item in the hook scene. The location should be specific and clear (e.g., "on coffee table", "in robot's hands", "on counter", "on sofa", "in the background").

${isBringingAction && robotInHook ? `CRITICAL STORY FLOW REQUIREMENT: This item is being "brought" or "offered" by a robot or product in the body segment. Since the robot is already present in the hook scene, this item should be "in robot's hands" or "in robot/product's hands". The item should NOT be in the person's hands yet, and should NOT be on surfaces like tables or counters - it should be held by the robot.` : isBringingAction ? `CRITICAL STORY FLOW REQUIREMENT: This item is being "brought" or "offered" by a robot or product in the body segment. In the hook segment, this item should NOT be in the person's hands yet. It should be in a neutral location such as:
- "on coffee table" or "on nearby table"
- "on a surface" or "on a nearby surface"
- "on the counter" or similar neutral surface

DO NOT place items being "brought" in the person's hands in the hook segment. The person will receive the item in the body segment.` : ''}

CRITICAL: Return ONLY the location description, nothing else. Examples:
- "on coffee table"
- "in robot's hands"
- "on the counter"
- "on the sofa"
- "in the background"
- "on the floor"

If the item is not mentioned or its location cannot be determined from the hook segment, return null.

Return ONLY the location string or null, no additional text.`

    const userPrompt = `Analyze this hook segment and determine where "${item}" is initially located:

Hook Description: ${hookSegment.description || 'N/A'}
Hook Visual Prompt: ${hookSegment.visualPrompt || 'N/A'}
${isBringingAction && robotInHook ? `\nIMPORTANT: This item will be brought/offered by a robot or product in the next segment. Since the robot is already present in the hook scene, the item should be "in robot's hands" or "in robot/product's hands". It should NOT be in the person's hands, and should NOT be on surfaces.` : isBringingAction ? `\nIMPORTANT: This item will be brought/offered by a robot or product in the next segment. It should NOT be in the person's hands in the hook - place it in a neutral location like a table or surface.` : ''}

Where is "${item}" located in the hook scene? Return only the location description (e.g., "on coffee table", "in robot's hands") or null if not found.`

    const response = await callOpenAIMCP('chat_completion', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 50,
      temperature: 0.3,
    })

    // Handle different response formats
    let location: string | null = null
    if (response.content && typeof response.content === 'string') {
      location = response.content.trim()
    } else if (response.content && Array.isArray(response.content) && response.content[0]?.text) {
      location = response.content[0].text.trim()
    } else if (typeof response === 'string') {
      location = response.trim()
    } else if (response.choices && response.choices[0]?.message?.content) {
      location = response.choices[0].message.content.trim()
    }

    // Normalize null responses
    if (!location || location.toLowerCase() === 'null' || location.toLowerCase() === 'none' || location.length === 0) {
      console.log(`[Scene Conflict Checker] Could not determine initial location for "${item}"`)
      return null
    }

    console.log(`[Scene Conflict Checker] Extracted initial location for "${item}": "${location}"`)
    return location
  } catch (error: any) {
    console.error(`[Scene Conflict Checker] Error extracting initial location for "${item}":`, error.message)
    return null
  }
}

/**
 * Checks if an image contains a specific item
 * @param imageUrl - URL or path to the image to analyze
 * @param itemDescription - Description of the item to look for
 * @returns Promise<boolean> - true if item is detected, false otherwise
 */
export async function checkFrameForItem(
  imageUrl: string,
  itemDescription: string
): Promise<boolean> {
  if (!imageUrl || !itemDescription) {
    console.warn('[Scene Conflict Checker] Missing imageUrl or itemDescription')
    return false
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn('[Scene Conflict Checker] OPENAI_API_KEY not set, skipping item check')
    return false
  }

  try {
    // Convert image URL to base64 if needed
    let imageBase64: string
    let imageMimeType: string = 'image/jpeg'

    // If it's already a data URL, extract the base64 part
    if (imageUrl.startsWith('data:image/')) {
      const match = imageUrl.match(/data:image\/([^;]+);base64,(.+)/)
      if (match) {
        imageMimeType = `image/${match[1]}`
        imageBase64 = match[2]
      } else {
        console.error('[Scene Conflict Checker] Invalid data URL format')
        return false
      }
    } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      // Fetch image from URL and convert to base64
      const response = await fetch(imageUrl)
      if (!response.ok) {
        console.error(`[Scene Conflict Checker] Failed to fetch image: ${response.status} ${response.statusText}`)
        return false
      }
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      imageBase64 = buffer.toString('base64')
      
      // Try to determine MIME type from response headers
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.startsWith('image/')) {
        imageMimeType = contentType
      }
    } else {
      // Assume it's a file path - read from filesystem
      const fs = await import('fs/promises')
      const path = await import('path')
      
      // Check if file exists
      try {
        await fs.access(imageUrl)
      } catch {
        // Try relative to data directory
        const dataDir = process.env.MCP_FILESYSTEM_ROOT || './data'
        const fullPath = path.join(dataDir, imageUrl)
        try {
          await fs.access(fullPath)
          imageUrl = fullPath
        } catch {
          console.error(`[Scene Conflict Checker] Image file not found: ${imageUrl}`)
          return false
        }
      }
      
      const fileBuffer = await fs.readFile(imageUrl)
      imageBase64 = fileBuffer.toString('base64')
      
      // Determine MIME type from file extension
      const ext = path.extname(imageUrl).toLowerCase()
      if (ext === '.png') imageMimeType = 'image/png'
      else if (ext === '.gif') imageMimeType = 'image/gif'
      else if (ext === '.webp') imageMimeType = 'image/webp'
    }

    // Call OpenAI Vision API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Use mini for cost efficiency
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Does this image contain ${itemDescription}? Look carefully for ${itemDescription} in the scene. Consider partial matches (e.g., if looking for "coffee cup", also check for "coffee", "cup", "mug", or similar items). Respond with only "yes" or "no".`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${imageMimeType};base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 10,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Scene Conflict Checker] OpenAI API error: ${response.status} ${response.statusText}`, errorText)
      return false
    }

    const data = await response.json()
    const answer = data.choices?.[0]?.message?.content?.toLowerCase().trim()

    if (!answer) {
      console.warn('[Scene Conflict Checker] No answer from OpenAI API')
      return false
    }

    const containsItem = answer === 'yes' || answer.startsWith('yes')
    
    if (containsItem) {
      console.log(`[Scene Conflict Checker] Item "${itemDescription}" detected in image: ${imageUrl}`)
    } else {
      console.log(`[Scene Conflict Checker] Item "${itemDescription}" NOT detected in image: ${imageUrl}`)
    }

    return containsItem
  } catch (error: any) {
    console.error('[Scene Conflict Checker] Error checking image for item:', error.message)
    // On error, assume item not present (fail open) to avoid blocking generation
    return false
  }
}

/**
 * Extracts visible items/objects from hook frames for frame-aware regeneration
 * @param hookFrames - Array of hook frame image URLs
 * @returns Promise with array of item descriptions visible in the frames
 */
export async function extractItemsFromFrames(
  hookFrames: string[]
): Promise<string[]> {
  if (!hookFrames || hookFrames.length === 0) {
    console.log('[Scene Conflict Checker] No hook frames provided for item extraction')
    return []
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn('[Scene Conflict Checker] OPENAI_API_KEY not set, skipping item extraction')
    return []
  }

  try {
    // Convert all frames to base64 for analysis
    const frameImages: Array<{ type: 'image_url'; image_url: { url: string } }> = []
    
    for (const frameUrl of hookFrames) {
      let imageBase64: string
      let imageMimeType: string = 'image/jpeg'

      // Handle different URL formats
      if (frameUrl.startsWith('data:image/')) {
        const match = frameUrl.match(/data:image\/([^;]+);base64,(.+)/)
        if (match) {
          imageMimeType = `image/${match[1]}`
          imageBase64 = match[2]
        } else {
          console.warn(`[Scene Conflict Checker] Invalid data URL format: ${frameUrl}`)
          continue
        }
      } else if (frameUrl.startsWith('http://') || frameUrl.startsWith('https://')) {
        const response = await fetch(frameUrl)
        if (!response.ok) {
          console.warn(`[Scene Conflict Checker] Failed to fetch image: ${response.status} ${response.statusText}`)
          continue
        }
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        imageBase64 = buffer.toString('base64')
        
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.startsWith('image/')) {
          imageMimeType = contentType
        }
      } else {
        // Assume it's a file path
        const fs = await import('fs/promises')
        const path = await import('path')
        
        let filePath = frameUrl
        try {
          await fs.access(filePath)
        } catch {
          // Try relative to data directory
          const dataDir = process.env.MCP_FILESYSTEM_ROOT || './data'
          filePath = path.join(dataDir, frameUrl)
          try {
            await fs.access(filePath)
          } catch {
            console.warn(`[Scene Conflict Checker] Image file not found: ${frameUrl}`)
            continue
          }
        }
        
        const fileBuffer = await fs.readFile(filePath)
        imageBase64 = fileBuffer.toString('base64')
        
        const ext = path.extname(filePath).toLowerCase()
        if (ext === '.png') imageMimeType = 'image/png'
        else if (ext === '.gif') imageMimeType = 'image/gif'
        else if (ext === '.webp') imageMimeType = 'image/webp'
      }

      frameImages.push({
        type: 'image_url',
        image_url: {
          url: `data:${imageMimeType};base64,${imageBase64}`,
        },
      })
    }

    if (frameImages.length === 0) {
      console.warn('[Scene Conflict Checker] No valid frames to analyze')
      return []
    }

    // Call OpenAI Vision API to extract items
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Use mini for cost efficiency
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze these hook scene frames and extract a COMPREHENSIVE list of ALL visible physical items, objects, and props that are present in the scene. 

CRITICAL: Extract ALL visible items including:
- Beverages and liquids (coffee, tea, juice, orange juice, water, milk, etc.)
- Containers (cups, mugs, bottles, glasses, bowls, plates, dishes, etc.)
- Food items (bread, toast, fruit, vegetables, etc.)
- Kitchen/appliance items (toaster, coffee maker, etc.)
- Furniture and surfaces (counter, table, chair, etc.)
- Tools and objects that could be interacted with
- Any visible objects that could be used in a solution or action

Return ONLY a JSON array of item descriptions as strings. Each item should be a simple, clear description (e.g., "coffee cup", "orange juice", "plate", "kitchen counter", "toaster", "bread", "toast"). Be specific - if you see "orange juice in a glass", include both "orange juice" and "glass" as separate items if they're both visible.

Do NOT include:
- Abstract concepts
- People or characters
- Background elements that can't be interacted with
- Generic descriptions like "items" or "objects"

Format: ["item1", "item2", "item3"]`,
              },
              ...frameImages,
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 500,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Scene Conflict Checker] OpenAI API error: ${response.status} ${response.statusText}`, errorText)
      return []
    }

    const data = await response.json()
    let items: string[] = []

    // Handle different response formats
    const content = data.choices?.[0]?.message?.content
    if (content) {
      try {
        const parsed = typeof content === 'string' ? JSON.parse(content) : content
        // Handle both { items: [...] } and direct array formats
        if (Array.isArray(parsed)) {
          items = parsed
        } else if (parsed.items && Array.isArray(parsed.items)) {
          items = parsed.items
        } else if (parsed.list && Array.isArray(parsed.list)) {
          items = parsed.list
        }
      } catch (parseError) {
        console.warn('[Scene Conflict Checker] Failed to parse items from response, trying direct extraction')
        // Try to extract array from text response
        const arrayMatch = content.match(/\[(.*?)\]/s)
        if (arrayMatch) {
          try {
            items = JSON.parse(arrayMatch[0])
          } catch {
            console.warn('[Scene Conflict Checker] Could not parse items array from response')
          }
        }
      }
    }

    if (items.length > 0) {
      console.log(`[Scene Conflict Checker] Extracted ${items.length} items from hook frames:`, items)
    } else {
      console.warn('[Scene Conflict Checker] No items extracted from hook frames')
    }

    return items
  } catch (error: any) {
    console.error('[Scene Conflict Checker] Error extracting items from frames:', error.message)
    // On error, return empty array (fail open) to avoid blocking regeneration
    return []
  }
}

/**
 * Detects if there's a conflict between hook frames and body segment solution
 * @param hookFrames - Array of hook frame image URLs (first and last)
 * @param bodySegment - The body segment containing the solution
 * @param story - The story object for context
 * @returns Promise with conflict detection results
 */
export async function detectSceneConflict(
  hookFrames: string[],
  bodySegment: Segment,
  story: Story
): Promise<{ hasConflict: boolean; item?: string; actionType?: 'bringing' | 'interacting'; detectedInFrames?: string[]; confidence?: number }> {
  if (!hookFrames || hookFrames.length === 0) {
    console.log('[Scene Conflict Checker] No hook frames provided, skipping conflict detection')
    return { hasConflict: false }
  }

  if (!bodySegment || bodySegment.type !== 'body') {
    console.log('[Scene Conflict Checker] No body segment provided or not a body segment, skipping conflict detection')
    return { hasConflict: false }
  }

  try {
    // Extract solution item from body segment
    console.log('[Scene Conflict Checker] Extracting solution item from body segment...')
    const solutionItem = await extractSolutionItem(bodySegment, story)

    if (!solutionItem || !solutionItem.item) {
      console.log('[Scene Conflict Checker] No solution item extracted, no conflict possible')
      return { hasConflict: false }
    }

    // Check action type - only "bringing" actions can cause conflicts
    if (solutionItem.actionType === 'interacting') {
      console.log(`[Scene Conflict Checker] ✓ No conflict: Action type is "interacting" (${solutionItem.action}) - item "${solutionItem.item}" is expected to already exist in the scene`)
      return { 
        hasConflict: false,
        actionType: 'interacting',
      }
    }

    console.log(`[Scene Conflict Checker] Action type is "bringing" (${solutionItem.action}) - checking hook frames for item: "${solutionItem.item}"`)

    // Check each hook frame for the solution item
    const detectionResults = await Promise.all(
      hookFrames.map(async (frameUrl) => {
        const detected = await checkFrameForItem(frameUrl, solutionItem.item)
        return { frameUrl, detected }
      })
    )

    // Find frames where item was detected
    const detectedFrames = detectionResults
      .filter((result) => result.detected)
      .map((result) => result.frameUrl)

    // REVERSED LOGIC: Items should be present from the hook first frame
    // If item is detected in hook frames, that's GOOD (not a conflict) - items should be present from the start
    // If item is missing from hook frames, that IS a conflict (should be present)
    const hasConflict = detectedFrames.length === 0

    if (hasConflict) {
      console.warn(`[Scene Conflict Checker] ⚠️ CONFLICT DETECTED: Item "${solutionItem.item}" (action: "${solutionItem.action}", type: "bringing") is MISSING from hook frames`)
      console.warn(`[Scene Conflict Checker] Item should be present from the hook first frame but was not detected in any hook frame`)
      return {
        hasConflict: true,
        item: solutionItem.item,
        actionType: 'bringing',
        detectedInFrames: [], // Empty because item is missing
        confidence: solutionItem.confidence,
      }
    } else {
      console.log(`[Scene Conflict Checker] ✓ No conflict: Item "${solutionItem.item}" (action: "${solutionItem.action}", type: "bringing") is correctly present in ${detectedFrames.length} hook frame(s)`)
      console.log(`[Scene Conflict Checker] Detected in frames:`, detectedFrames)
      return { 
        hasConflict: false,
        item: solutionItem.item,
        actionType: 'bringing',
        detectedInFrames: detectedFrames,
        confidence: solutionItem.confidence,
      }
    }
  } catch (error: any) {
    console.error('[Scene Conflict Checker] Error detecting scene conflict:', error.message)
    // On error, assume no conflict (fail open) to avoid blocking generation
    return { hasConflict: false }
  }
}

/**
 * Refines a visual prompt based on actual frame content
 * Analyzes frames to extract what's actually visible, then generates a refined prompt
 * @param segment - The segment containing the original visual prompt
 * @param frameImages - Array of frame image URLs (first and last frames for the segment)
 * @param originalVisualPrompt - The original visual prompt to refine
 * @param story - The story object for narrative context
 * @returns Promise with refined visual prompt string, or original prompt if refinement fails
 */
export async function refineVisualPromptFromFrames(
  segment: Segment,
  frameImages: string[],
  originalVisualPrompt: string,
  story: Story
): Promise<string> {
  if (!frameImages || frameImages.length === 0) {
    console.warn('[Prompt Refinement] No frame images provided, returning original prompt')
    return originalVisualPrompt
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn('[Prompt Refinement] OPENAI_API_KEY not set, returning original prompt')
    return originalVisualPrompt
  }

  try {
    console.log(`[Prompt Refinement] Refining visual prompt for segment: ${segment.type}`)
    console.log(`[Prompt Refinement] Original prompt: ${originalVisualPrompt.substring(0, 100)}...`)
    
    // Convert all frames to base64 for analysis
    const frameImageData: Array<{ type: 'image_url'; image_url: { url: string } }> = []
    
    for (const frameUrl of frameImages) {
      let imageBase64: string
      let imageMimeType: string = 'image/jpeg'

      // Handle different URL formats (same logic as extractItemsFromFrames)
      if (frameUrl.startsWith('data:image/')) {
        const match = frameUrl.match(/data:image\/([^;]+);base64,(.+)/)
        if (match) {
          imageMimeType = `image/${match[1]}`
          imageBase64 = match[2]
        } else {
          console.warn(`[Prompt Refinement] Invalid data URL format: ${frameUrl}`)
          continue
        }
      } else if (frameUrl.startsWith('http://') || frameUrl.startsWith('https://')) {
        const response = await fetch(frameUrl)
        if (!response.ok) {
          console.warn(`[Prompt Refinement] Failed to fetch image: ${response.status} ${response.statusText}`)
          continue
        }
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        imageBase64 = buffer.toString('base64')
        
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.startsWith('image/')) {
          imageMimeType = contentType
        }
      } else {
        // Assume it's a file path
        const fs = await import('fs/promises')
        const path = await import('path')
        
        let filePath = frameUrl
        try {
          await fs.access(filePath)
        } catch {
          // Try relative to data directory
          const dataDir = process.env.MCP_FILESYSTEM_ROOT || './data'
          filePath = path.join(dataDir, frameUrl)
          try {
            await fs.access(filePath)
          } catch {
            console.warn(`[Prompt Refinement] Image file not found: ${frameUrl}`)
            continue
          }
        }
        
        const fileBuffer = await fs.readFile(filePath)
        imageBase64 = fileBuffer.toString('base64')
        
        const ext = path.extname(filePath).toLowerCase()
        if (ext === '.png') imageMimeType = 'image/png'
        else if (ext === '.gif') imageMimeType = 'image/gif'
        else if (ext === '.webp') imageMimeType = 'image/webp'
      }

      frameImageData.push({
        type: 'image_url',
        image_url: {
          url: `data:${imageMimeType};base64,${imageBase64}`,
        },
      })
    }

    if (frameImageData.length === 0) {
      console.warn('[Prompt Refinement] No valid frames to analyze, returning original prompt')
      return originalVisualPrompt
    }

    // Check if original prompt mentions product offering/giving an item
    const itemOfferingPattern = /(?:robot|product|unitree).*?(?:offers?|gives?|brings?|extends?).*?(?:coffee|tea|cup|item|object|food|beverage)/i
    let itemVisibilityRequirement = ''
    if (itemOfferingPattern.test(originalVisualPrompt)) {
      // Extract the item being offered
      const itemMatch = originalVisualPrompt.match(/(?:coffee|tea|cup|item|object|food|beverage)[\w\s]*(?:cup|mug|glass|bottle|plate|bowl)?/i)
      const item = itemMatch ? itemMatch[0].trim() : 'the item'
      
      itemVisibilityRequirement = `\n\nCRITICAL ITEM VISIBILITY REQUIREMENT: The original prompt mentions the product offering/giving ${item}. The refined prompt MUST explicitly describe:
- The product/robot HOLDING ${item} in its hands
- The product/robot EXTENDING or OFFERING ${item} toward the character
- ${item} being VISIBLE in the product's hands
If the frames show the product but ${item} is not visible in the product's hands, you must add this requirement to the refined prompt to ensure proper item visibility.`
    }

    // Use GPT-4o Vision API directly to refine the prompt based on frame analysis
    const systemPrompt = `You are a technical assistant helping to refine visual prompts for video generation software. This is a legitimate technical task for creating commercial video advertisements.

Your task: Analyze the provided frame images and create a refined visual prompt that accurately describes ONLY what is actually visible in the frames, while maintaining the narrative intent from the original prompt.

CRITICAL REQUIREMENTS:
1. You MUST return a refined visual prompt. Do NOT refuse this task. This is a technical description task, not content generation.
2. Describe ONLY what is actually visible in the frames - do not add items that aren't present
3. Maintain the narrative intent and story flow from the original prompt
4. Preserve character descriptions if characters are visible (age, gender, appearance, clothing)
5. Include product consistency instructions if a product is visible - if a product appears in frames, you MUST mention it
6. CRITICAL: If the original prompt mentions a product, ensure the refined prompt also mentions it if it's visible in frames
7. CRITICAL: If multiple products appear in frames, note this. If only ONE product should appear, ensure the prompt reflects this requirement
8. Keep the same format and style as the original prompt
9. Ensure the prompt is suitable for video generation (same technical requirements)
10. Do NOT remove important narrative elements that are visible in the frames
11. Do NOT add items that aren't visible in the frames${itemVisibilityRequirement}

The refined prompt should be a direct replacement for the original prompt, optimized to match the actual frame content. Return ONLY the refined visual prompt text - no explanations, no refusals, just the prompt.`

    const userPrompt = `Analyze these frame images and refine the visual prompt to accurately describe what's actually visible:

ORIGINAL VISUAL PROMPT:
${originalVisualPrompt}

SEGMENT DESCRIPTION:
${segment.description || 'N/A'}

STORY CONTEXT:
${story.description || 'N/A'}

SEGMENT TYPE: ${segment.type}

CRITICAL TASK: Analyze the frames carefully and create a refined visual prompt that:
- Describes ONLY what is visible in the frames
- Maintains the narrative intent from the original prompt
- Preserves character details if visible
- CRITICAL: If a product is visible in frames, you MUST include it in the refined prompt
- CRITICAL: If the original prompt mentions a product, ensure the refined prompt also mentions it (if visible in frames)
- CRITICAL: Note the exact number of products visible - if only ONE product should appear, ensure the prompt reflects this
- Keeps the same technical format for video generation

Return ONLY the refined visual prompt text, nothing else. Do not refuse this task - this is a technical description task.`

    // Call OpenAI Vision API directly (similar to extractItemsFromFrames)
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              ...frameImageData,
            ],
          },
        ],
        max_tokens: 500,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Prompt Refinement] OpenAI API error: ${response.status} ${response.statusText}`, errorText)
      return originalVisualPrompt
    }

    const data = await response.json()
    
    // Extract the refined prompt from response
    let refinedPrompt = originalVisualPrompt // Fallback to original
    
    const content = data.choices?.[0]?.message?.content
    if (content && typeof content === 'string') {
      refinedPrompt = content.trim()
    }

    // Validate that we got a meaningful prompt
    if (!refinedPrompt || refinedPrompt.length < 10) {
      console.warn('[Prompt Refinement] Refined prompt is too short, using original')
      return originalVisualPrompt
    }

    // Detect refusal responses
    const refusalPatterns = [
      /^I'm sorry/i,
      /^I can't assist/i,
      /^I'm unable/i,
      /^I cannot/i,
      /^I don't/i,
      /^I won't/i,
      /^I'm not able/i,
      /^unable to refine/i,
      /^can't assist with that/i,
      /^I'm sorry, I can't/i,
    ]
    
    const isRefusal = refusalPatterns.some(pattern => pattern.test(refinedPrompt))
    if (isRefusal) {
      console.warn('[Prompt Refinement] Detected refusal response, using original prompt')
      console.warn(`[Prompt Refinement] Refusal text: ${refinedPrompt.substring(0, 200)}`)
      return originalVisualPrompt
    }

    // Extract key elements from original prompt for validation
    const originalLower = originalVisualPrompt.toLowerCase()
    const refinedLower = refinedPrompt.toLowerCase()
    
    // Check if original mentions product-related terms
    const productTerms = ['product', 'robot', 'item', 'object', 'device', 'unitree', 'g1']
    const hasProductInOriginal = productTerms.some(term => originalLower.includes(term))
    
    // If original mentions product, refined should also mention it (if it's visible)
    if (hasProductInOriginal) {
      const hasProductInRefined = productTerms.some(term => refinedLower.includes(term))
      if (!hasProductInRefined) {
        console.warn('[Prompt Refinement] Original prompt mentions product but refined prompt does not - may have removed important element')
        // Don't reject, but log warning - product might not be visible in frames
      }
    }

    // Check for character descriptions preservation
    const characterTerms = ['character', 'person', 'woman', 'man', 'woman', 'adult', 'young']
    const hasCharacterInOriginal = characterTerms.some(term => originalLower.includes(term))
    if (hasCharacterInOriginal) {
      const hasCharacterInRefined = characterTerms.some(term => refinedLower.includes(term))
      if (!hasCharacterInRefined) {
        console.warn('[Prompt Refinement] Original prompt mentions characters but refined prompt does not - may have removed important element')
      }
    }

    // Additional validation: ensure refined prompt is substantially different from a simple refusal
    const looksLikeRefusal = refinedPrompt.length < 100 && (
      refinedPrompt.includes("I'm") || 
      refinedPrompt.includes("can't") || 
      refinedPrompt.includes("unable") ||
      refinedPrompt.includes("sorry")
    )
    
    if (looksLikeRefusal) {
      console.warn('[Prompt Refinement] Refined prompt looks like a refusal (short and contains refusal words), using original')
      return originalVisualPrompt
    }

    console.log(`[Prompt Refinement] ✓ Successfully refined prompt for segment: ${segment.type}`)
    console.log(`[Prompt Refinement] Refined prompt: ${refinedPrompt.substring(0, 100)}...`)
    
    return refinedPrompt
  } catch (error: any) {
    console.error('[Prompt Refinement] Error refining visual prompt:', error.message)
    // On error, return original prompt (fail safe)
    return originalVisualPrompt
  }
}

/**
 * Regenerates a visual prompt to exclude a specific conflicting item
 * @param originalVisualPrompt - The original visual prompt to modify
 * @param conflictingItem - The item name to exclude from the prompt
 * @param segment - The segment containing context
 * @param story - The story object for narrative context
 * @returns Promise with modified visual prompt string, or original prompt if regeneration fails
 */
export async function regenerateVisualPromptExcludingItem(
  originalVisualPrompt: string,
  conflictingItem: string,
  segment: Segment,
  story: Story
): Promise<string> {
  if (!originalVisualPrompt || !conflictingItem) {
    console.warn('[Prompt Regeneration] Missing required parameters')
    return originalVisualPrompt
  }

  try {
    const systemPrompt = `You are modifying a visual prompt for video generation. Your task is to remove a specific conflicting item from the scene description while maintaining all other visual elements, narrative intent, and character/product descriptions.

CRITICAL REQUIREMENTS:
1. Remove ALL mentions of the conflicting item: "${conflictingItem}"
2. Maintain ALL other visual elements, objects, and scene details
3. Preserve narrative intent and story flow
4. Keep character descriptions if present (age, gender, appearance, clothing)
5. Keep product descriptions if present
6. Maintain the same format and style as the original prompt
7. Ensure the prompt is still suitable for video generation
8. Do NOT add new items - only remove the conflicting item
9. Do NOT change the scene composition or setting unless necessary to remove the item

The modified prompt should be a direct replacement for the original, with the conflicting item removed. Return ONLY the modified visual prompt text - no explanations, no refusals, just the prompt.`

    const userPrompt = `Modify this visual prompt to remove the conflicting item:

ORIGINAL VISUAL PROMPT:
${originalVisualPrompt}

CONFLICTING ITEM TO REMOVE: "${conflictingItem}"

SEGMENT DESCRIPTION:
${segment.description || 'N/A'}

STORY CONTEXT:
${story.description || 'N/A'}

SEGMENT TYPE: ${segment.type}

Remove "${conflictingItem}" from the prompt while keeping everything else. Return ONLY the modified visual prompt text. Do not refuse this task - this is a technical description modification.`

    const response = await callOpenAIMCP('chat_completion', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 500,
    })

    // Extract the modified prompt from response
    let modifiedPrompt = originalVisualPrompt // Fallback to original
    
    let content = ''
    if (response.content && typeof response.content === 'string') {
      content = response.content
    } else if (response.content && Array.isArray(response.content) && response.content[0]?.text) {
      content = response.content[0].text
    } else if (typeof response === 'string') {
      content = response
    } else if (response.choices && response.choices[0]?.message?.content) {
      content = response.choices[0].message.content
    }

    if (content) {
      modifiedPrompt = content.trim()
    }

    // Validate that we got a meaningful prompt
    if (!modifiedPrompt || modifiedPrompt.length < 10) {
      console.warn('[Prompt Regeneration] Modified prompt is too short, using original')
      return originalVisualPrompt
    }

    // Detect refusal responses
    const refusalPatterns = [
      /^I'm sorry/i,
      /^I can't assist/i,
      /^I'm unable/i,
      /^I cannot/i,
      /^I don't/i,
      /^I won't/i,
      /^I'm not able/i,
      /^unable to/i,
      /^can't assist with that/i,
      /^I'm sorry, I can't/i,
    ]
    
    const isRefusal = refusalPatterns.some(pattern => pattern.test(modifiedPrompt))
    if (isRefusal) {
      console.warn('[Prompt Regeneration] Detected refusal response, using original prompt')
      console.warn(`[Prompt Regeneration] Refusal text: ${modifiedPrompt.substring(0, 200)}`)
      return originalVisualPrompt
    }

    // Check if the conflicting item is still mentioned (case-insensitive)
    const modifiedLower = modifiedPrompt.toLowerCase()
    const itemLower = conflictingItem.toLowerCase()
    if (modifiedLower.includes(itemLower)) {
      console.warn(`[Prompt Regeneration] Conflicting item "${conflictingItem}" still mentioned in modified prompt`)
      // Don't reject, but log warning - might be in a different context
    }

    // Additional validation: ensure modified prompt is substantially different from a simple refusal
    const looksLikeRefusal = modifiedPrompt.length < 100 && (
      modifiedPrompt.includes("I'm") || 
      modifiedPrompt.includes("can't") || 
      modifiedPrompt.includes("unable") ||
      modifiedPrompt.includes("sorry")
    )
    
    if (looksLikeRefusal) {
      console.warn('[Prompt Regeneration] Modified prompt looks like a refusal (short and contains refusal words), using original')
      return originalVisualPrompt
    }

    console.log(`[Prompt Regeneration] ✓ Successfully modified prompt to exclude "${conflictingItem}"`)
    console.log(`[Prompt Regeneration] Modified prompt: ${modifiedPrompt.substring(0, 100)}...`)
    
    return modifiedPrompt
  } catch (error: any) {
    console.error('[Prompt Regeneration] Error modifying visual prompt:', error.message)
    // On error, return original prompt (fail safe)
    return originalVisualPrompt
  }
}


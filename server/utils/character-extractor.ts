import { callOpenAIMCP } from './mcp-client'
import type { Character } from '~/types/generation'
import { nanoid } from 'nanoid'

/**
 * Extracts character descriptions from story text using AI
 * @param storyText - The story text containing character descriptions
 * @param hookText - The hook segment text (usually contains initial character descriptions)
 * @returns Array of Character objects
 */
export async function extractCharacters(
  storyText: string,
  hookText: string
): Promise<Character[]> {
  try {
    const systemPrompt = `You are an expert at analyzing stories and extracting character descriptions.

Your task is to identify ALL characters mentioned in the story and extract detailed descriptions for each character.

For each character, extract:
- name: Character name if mentioned (e.g., "John", "the teen", "the elderly man", "the person"). If no name, use a descriptive identifier.
- gender: One of: "male", "female", "non-binary", or "unspecified" if not clear
- age: Age description (e.g., "teenage", "elderly", "middle-aged", "young adult", "child", "adult")
- physicalFeatures: Physical appearance details including hair color/style, build, distinctive features, facial features
- clothing: Clothing style description if mentioned
- role: Role in the story (e.g., "main character", "the person who cheers up", "the person being cheered up", "supporting character")

CRITICAL REQUIREMENTS:
- Extract ALL characters mentioned, even if briefly
- Be specific about gender - do not use "unspecified" unless truly ambiguous
- Include physical features that would help maintain visual consistency (hair color, build, age appearance)
- If a character is described as "teen" or "teenage", specify the gender explicitly
- If a character is described as "elderly man" or "elderly woman", extract both age and gender
- Focus on visual characteristics that would help maintain consistency across scenes

Return ONLY valid JSON with this structure:
{
  "characters": [
    {
      "id": "char-1",
      "name": "the teen",
      "description": "A teenage [gender] with [physical features]",
      "gender": "male",
      "age": "teenage",
      "physicalFeatures": "brown hair, average build",
      "clothing": "casual modern clothing",
      "role": "main character who cheers up the elderly man"
    }
  ]
}`

    const userPrompt = `Extract all characters from this story:

Story: ${storyText}

Hook (first scene): ${hookText}

Identify all characters mentioned and extract their detailed descriptions. Focus on visual characteristics that would help maintain consistency across video scenes.`

    const response = await callOpenAIMCP('chat_completion', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    })

    // Parse response
    let data = response
    if (response.content && typeof response.content === 'string') {
      const parsedContent = JSON.parse(response.content)
      if (parsedContent.content) {
        data = JSON.parse(parsedContent.content)
      } else {
        data = parsedContent
      }
    } else if (typeof response === 'string') {
      data = JSON.parse(response)
    } else if (response.choices && response.choices[0]?.message?.content) {
      data = JSON.parse(response.choices[0].message.content)
    }

    const characters: Character[] = (data.characters || []).map((char: any) => ({
      id: char.id || nanoid(),
      name: char.name,
      description: char.description || '',
      gender: char.gender || 'unspecified',
      age: char.age,
      physicalFeatures: char.physicalFeatures,
      clothing: char.clothing,
      role: char.role || 'character',
    }))

    return characters
  } catch (error: any) {
    console.error('[Character Extractor] Error extracting characters:', error)
    // Return empty array on error rather than failing completely
    return []
  }
}

/**
 * Formats character descriptions for prompt injection
 * @param characters - Array of Character objects
 * @returns Formatted string for use in prompts
 */
export function formatCharactersForPrompt(characters: Character[]): string {
  if (!characters || characters.length === 0) {
    return ''
  }

  const characterDescriptions = characters.map((char) => {
    const parts: string[] = []
    
    if (char.age) {
      parts.push(char.age)
    }
    
    if (char.gender !== 'unspecified') {
      parts.push(char.gender)
    }
    
    parts.push('person')
    
    if (char.physicalFeatures) {
      parts.push(`with ${char.physicalFeatures}`)
    }
    
    if (char.clothing) {
      parts.push(`wearing ${char.clothing}`)
    }
    
    const description = parts.join(' ')
    return char.name 
      ? `${char.name}: ${description}` 
      : description
  })

  return characterDescriptions.join('; ')
}

/**
 * Creates a character consistency instruction string for prompts
 * @param characters - Array of Character objects
 * @returns Formatted instruction string
 */
export function createCharacterConsistencyInstruction(characters: Character[]): string {
  if (!characters || characters.length === 0) {
    return ''
  }

  const formatted = formatCharactersForPrompt(characters)
  
  return `CRITICAL CHARACTER CONSISTENCY: The following characters must appear with IDENTICAL appearance across all scenes: ${formatted}. 

REQUIREMENTS:
- Maintain exact same gender for each character (do not change gender between scenes)
- Maintain exact same age appearance for each character
- Maintain exact same physical features (hair color/style, build, distinctive features)
- Maintain exact same clothing style for each character
- Use phrases like "the same [age] [gender] person with [features]" to ensure consistency
- Do NOT change character gender, age, or physical appearance between scenes
- Reference characters as "the same character from the hook scene" when appropriate`
}

/**
 * Validates character consistency across segments
 * @param characters - Array of Character objects
 * @param segments - Array of segment descriptions/visual prompts
 * @returns Validation result with any inconsistencies found
 */
export function validateCharacterConsistency(
  characters: Character[],
  segments: Array<{ description: string; visualPrompt: string }>
): { isValid: boolean; inconsistencies: string[] } {
  const inconsistencies: string[] = []

  if (!characters || characters.length === 0) {
    return { isValid: true, inconsistencies: [] }
  }

  // Check if character descriptions are mentioned in segments
  for (const char of characters) {
    const charKeywords = [
      char.name,
      char.age,
      char.gender !== 'unspecified' ? char.gender : null,
    ].filter(Boolean)

    let foundInSegments = false
    for (const segment of segments) {
      const text = `${segment.description} ${segment.visualPrompt}`.toLowerCase()
      if (charKeywords.some(keyword => keyword && text.includes(keyword.toLowerCase()))) {
        foundInSegments = true
        break
      }
    }

    if (!foundInSegments && charKeywords.length > 0) {
      inconsistencies.push(`Character "${char.name || char.description}" not clearly referenced in segments`)
    }
  }

  return {
    isValid: inconsistencies.length === 0,
    inconsistencies,
  }
}


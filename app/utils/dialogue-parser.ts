/**
 * Dialogue Parser Utility
 * 
 * Parses and reconstructs dialogue from the audioNotes format:
 * "Dialogue: [Character] says: '[text]'"
 */

export interface ParsedDialogue {
  character: string
  dialogueText: string
  hasDialogue: boolean
}

/**
 * Parse dialogue from audioNotes format
 * @param audioNotes - The audioNotes string in format "Dialogue: [Character] says: '[text]'"
 * @returns Parsed dialogue object with character and dialogueText, or null if no dialogue found
 */
export function parseDialogue(audioNotes: string | undefined | null): ParsedDialogue | null {
  if (!audioNotes || !audioNotes.trim()) {
    return null
  }

  // Match format: "Dialogue: [Character] says: '[text]'"
  // Also handles variations like "Dialogue: [Character] says in a soft voice: '[text]'"
  // Use a more robust pattern that captures complete dialogue text until the last matching quote
  // First, find the pattern up to the opening quote
  const prefixMatch = audioNotes.match(/Dialogue:\s*(.+?)\s+says(?:[^:]+)?:\s*['"]/i)
  
  if (!prefixMatch) {
    return null
  }
  
  // Find the position after the opening quote
  const prefixEnd = prefixMatch.index! + prefixMatch[0].length
  const quoteChar = audioNotes[prefixEnd - 1] // The quote character used (' or ")
  
  // Find the last matching quote character from the end
  let lastQuoteIndex = -1
  for (let i = audioNotes.length - 1; i >= prefixEnd; i--) {
    if (audioNotes[i] === quoteChar) {
      // Check if it's not escaped (not preceded by backslash)
      if (i === 0 || audioNotes[i - 1] !== '\\') {
        lastQuoteIndex = i
        break
      }
    }
  }
  
  if (lastQuoteIndex === -1) {
    // No closing quote found, try the original regex as fallback
    const dialogueMatch = audioNotes.match(/Dialogue:\s*(.+?)\s+says(?:[^:]+)?:\s*['"](.+?)['"]/i)
    if (dialogueMatch) {
      const character = dialogueMatch[1].trim()
      const dialogueText = dialogueMatch[2].trim()
      return {
        character,
        dialogueText,
        hasDialogue: true
      }
    }
    return null
  }
  
  // Extract character and dialogue text
  const character = prefixMatch[1].trim()
  const dialogueText = audioNotes.substring(prefixEnd, lastQuoteIndex).trim()
  
  return {
    character,
    dialogueText,
    hasDialogue: true
  }
}

/**
 * Reconstruct audioNotes format from character and dialogue text
 * @param character - Character description (e.g., "The man", "The young woman")
 * @param dialogueText - The spoken dialogue text
 * @returns Formatted string: "Dialogue: [Character] says: '[text]'"
 */
export function formatDialogue(character: string, dialogueText: string): string {
  if (!character.trim() && !dialogueText.trim()) {
    return ''
  }

  if (!dialogueText.trim()) {
    return ''
  }

  const cleanCharacter = character.trim() || 'The character'
  const cleanDialogue = dialogueText.trim()

  return `Dialogue: ${cleanCharacter} says: '${cleanDialogue}'`
}

/**
 * Get word count for dialogue text
 * @param dialogueText - The dialogue text to count
 * @returns Number of words
 */
export function getDialogueWordCount(dialogueText: string): number {
  if (!dialogueText || !dialogueText.trim()) {
    return 0
  }
  
  return dialogueText.trim().split(/\s+/).filter(word => word.length > 0).length
}

/**
 * Validate CTA dialogue word count (must be 5 words or less)
 * @param dialogueText - The dialogue text to validate
 * @returns Object with isValid boolean and message
 */
export function validateCTADialogue(dialogueText: string): { isValid: boolean; message: string } {
  const wordCount = getDialogueWordCount(dialogueText)
  
  if (wordCount === 0) {
    return { isValid: true, message: '' }
  }
  
  if (wordCount > 5) {
    return {
      isValid: false,
      message: `CTA dialogue must be 5 words or less (currently ${wordCount} words)`
    }
  }
  
  return { isValid: true, message: '' }
}


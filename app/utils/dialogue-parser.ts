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
  // Also handles variations like:
  // - "Dialogue: [Character] says in a soft voice: '[text]'"
  // - "Dialogue: [Character] in a warm, confident voice with an American accent says: '[text]'"
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
  // Improved: Look for quote that's likely the closing quote of the dialogue
  // This handles cases like: "Dialogue: Character says: 'Text!' (with excitement)"
  let lastQuoteIndex = -1
  for (let i = audioNotes.length - 1; i >= prefixEnd; i--) {
    if (audioNotes[i] === quoteChar) {
      // Check if it's not escaped (not preceded by backslash)
      if (i === 0 || audioNotes[i - 1] !== '\\') {
        // Check if this quote is likely the closing quote by checking what follows it
        // Valid closing quote is followed by: end of string, whitespace, comma, period, closing paren, or semicolon
        // This ensures we capture dialogue ending with ! or ? even if there's text after
        const charAfter = i < audioNotes.length - 1 ? audioNotes[i + 1] : ''
        if (charAfter === '' || /[\s,.)\s;]/.test(charAfter) || i === audioNotes.length - 1) {
          lastQuoteIndex = i
          break
        }
      }
    }
  }
  
  // If we didn't find a quote with the validation above, fall back to finding any unescaped quote
  // This handles edge cases where the quote might be followed by unexpected characters
  if (lastQuoteIndex === -1) {
    for (let i = audioNotes.length - 1; i >= prefixEnd; i--) {
      if (audioNotes[i] === quoteChar) {
        if (i === 0 || audioNotes[i - 1] !== '\\') {
          lastQuoteIndex = i
          break
        }
      }
    }
  }
  
  if (lastQuoteIndex === -1) {
    // No closing quote found, try improved regex fallback
    // Use a more robust pattern that captures dialogue including trailing punctuation
    // Use [^'"]* to match everything except quotes - this ensures we capture ! and ? correctly
    const dialogueMatch = audioNotes.match(/Dialogue:\s*(.+?)\s+says(?:[^:]+)?:\s*['"]([^'"]*)['"]/i)
    if (dialogueMatch && dialogueMatch[2]) {
      const character = dialogueMatch[1].trim()
      const dialogueText = dialogueMatch[2].trim()
      
      // Validate punctuation preservation - check if original had ! or ? within the match
      const matchStart = dialogueMatch.index || 0
      const matchEnd = matchStart + dialogueMatch[0].length
      const matchSection = audioNotes.substring(matchStart, matchEnd)
      const originalHasQuestion = matchSection.includes('?')
      const originalHasExclamation = matchSection.includes('!')
      
      if ((originalHasQuestion && !dialogueText.endsWith('?')) || (originalHasExclamation && !dialogueText.endsWith('!'))) {
        console.warn('[Dialogue Parser] Punctuation may have been lost during regex fallback extraction. Original section:', matchSection, 'Extracted:', dialogueText)
      }
      
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
  
  // Validate that dialogue text is complete (not corrupted or cut off)
  if (dialogueText.length === 0) {
    console.warn('[Dialogue Parser] Dialogue text is empty after extraction')
    return null
  }
  
  // Validate punctuation preservation - check if original had ! or ? and ensure they're preserved
  // Check the extracted dialogue text directly for punctuation that should be at the end
  const originalText = audioNotes.substring(prefixEnd, lastQuoteIndex)
  const hasQuestionInOriginal = originalText.includes('?')
  const hasExclamationInOriginal = originalText.includes('!')
  
  if (hasQuestionInOriginal && !dialogueText.endsWith('?')) {
    console.warn('[Dialogue Parser] Question mark detected in original dialogue but missing from extracted text. Original:', originalText, 'Extracted:', dialogueText)
  }
  
  if (hasExclamationInOriginal && !dialogueText.endsWith('!')) {
    console.warn('[Dialogue Parser] Exclamation mark detected in original dialogue but missing from extracted text. Original:', originalText, 'Extracted:', dialogueText)
  }
  
  // Check for incomplete/corrupted dialogue indicators
  if (dialogueText.endsWith('*') || dialogueText.endsWith('...') || dialogueText.endsWith('…') || dialogueText.includes('*gibberish') || dialogueText.includes('*incomplete') || dialogueText.match(/\w+\*$/)) {
    console.warn('[Dialogue Parser] Dialogue text appears incomplete or corrupted:', dialogueText)
    // Try to clean up - remove trailing incomplete markers and gibberish patterns
    let cleaned = dialogueText
      .replace(/[*…]+$/, '') // Remove trailing asterisks/ellipses
      .replace(/\*gibberish.*$/i, '') // Remove gibberish markers
      .replace(/\*incomplete.*$/i, '') // Remove incomplete markers
      .replace(/\w+\*$/g, '') // Remove words ending with asterisk (corrupted words)
      .trim()
    
    // If cleaned text is too short or doesn't make sense, return null
    if (cleaned.length === 0 || cleaned.split(/\s+/).length < 2) {
      console.error('[Dialogue Parser] Dialogue text became empty or too short after cleanup - original was corrupted')
      return null
    }
    // Return cleaned version with warning
    return {
      character,
      dialogueText: cleaned,
      hasDialogue: true
    }
  }
  
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


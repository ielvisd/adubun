/**
 * Sanitizes video generation prompts by rewriting mentions of children/kids
 * to safer alternatives to reduce content moderation flags (like E005 errors).
 * 
 * Based on research into AI video generation content moderation systems,
 * terms like "kids", "children", "toddlers", etc. can trigger content flags.
 * This function replaces them with age-neutral alternatives while preserving
 * the intent and meaning of the prompt.
 */

/**
 * Sanitizes a video generation prompt by replacing child-related terms
 * with safer alternatives that are less likely to trigger content moderation.
 * 
 * @param prompt - The original video generation prompt
 * @returns The sanitized prompt with child-related terms replaced
 */
export function sanitizeVideoPrompt(prompt: string): string {
  if (!prompt || typeof prompt !== 'string') {
    return prompt
  }

  let sanitized = prompt

  // Track if any replacements were made for logging
  const replacements: Array<{ original: string; replacement: string }> = []

  // Helper function to perform replacement and track it
  const replaceTerm = (
    pattern: RegExp,
    replacement: string,
    originalTerm: string
  ) => {
    const before = sanitized
    sanitized = sanitized.replace(pattern, replacement)
    if (before !== sanitized) {
      replacements.push({ original: originalTerm, replacement })
    }
  }

  // Process longer phrases first to avoid double-replacement
  // Use word boundaries to avoid partial matches (e.g., "kitchen" should not match "children")

  // Primary replacements (most common, preserves youth context)
  // "young children" must come before "children" to avoid double replacement
  replaceTerm(/\byoung children\b/gi, 'young people', 'young children')
  replaceTerm(/\bchildren's\b/gi, "families'", 'children\'s')
  replaceTerm(/\bchildren\b/gi, 'people', 'children')
  replaceTerm(/\bkids'\b/gi, "young people's", "kids'")
  replaceTerm(/\bkids\b/gi, 'young people', 'kids')
  replaceTerm(/\btoddlers\b/gi, 'young people', 'toddlers')
  replaceTerm(/\bbabies\b/gi, 'people', 'babies')

  // Secondary terms (also flagged but less common)
  replaceTerm(/\bminors\b/gi, 'people', 'minors')
  replaceTerm(/\badolescents\b/gi, 'young people', 'adolescents')
  replaceTerm(/\bteenagers\b/gi, 'young people', 'teenagers')
  
  // Handle "youth" as a noun referring to people (not "youth program" which is fine)
  // Match "youth" when it's used as a standalone noun or in phrases like "the youth"
  replaceTerm(/\bthe youth\b/gi, 'young people', 'the youth')
  // Replace standalone "youth" - this is often flagged when referring to people
  // Note: This may replace "youth" in compound words, but that's acceptable for safety
  replaceTerm(/\byouth\b/gi, 'young people', 'youth')

  // Context-aware handling for possessive forms
  // "children's products" -> "products for families" or "family products"
  replaceTerm(/\bchildren's products\b/gi, 'products for families', "children's products")
  replaceTerm(/\bkids' toys\b/gi, 'toys for young people', "kids' toys")
  replaceTerm(/\bkids' products\b/gi, 'products for families', "kids' products")

  // Log replacements in development mode only
  if (process.env.NODE_ENV === 'development' && replacements.length > 0) {
    console.log('[Prompt Sanitizer] Applied replacements:', replacements)
    console.log('[Prompt Sanitizer] Original:', prompt)
    console.log('[Prompt Sanitizer] Sanitized:', sanitized)
  }

  return sanitized
}


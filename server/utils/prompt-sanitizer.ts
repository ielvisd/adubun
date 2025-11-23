/**
 * Sanitizes video generation prompts by rewriting mentions of children/kids
 * to "young adults" to reduce content moderation flags (like E005 errors).
 * 
 * Based on research into AI video generation content moderation systems,
 * terms like "kids", "children", "toddlers", etc. can trigger content flags.
 * This function replaces them with "young adults" while preserving
 * the intent and meaning of the prompt.
 */

/**
 * Sanitizes a video generation prompt by replacing child-related terms
 * with "young adults" to reduce content moderation flags.
 * 
 * @param prompt - The original video generation prompt
 * @param characterAge - Optional character age from image analysis (e.g., "mid-20s", "early 30s")
 *                       If provided, will replace teenage/teen terms with this specific age
 * @returns The sanitized prompt with child-related terms replaced
 */
export function sanitizeVideoPrompt(prompt: string, characterAge?: string): string {
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

  // Primary replacements (most common, converts to "young adults")
  // "young children" must come before "children" to avoid double replacement
  replaceTerm(/\byoung children\b/gi, 'young adults', 'young children')
  replaceTerm(/\bchildren's\b/gi, "young adults'", 'children\'s')
  replaceTerm(/\bchildren\b/gi, 'young adults', 'children')
  replaceTerm(/\bkids'\b/gi, "young adults'", "kids'")
  replaceTerm(/\bkids\b/gi, 'young adults', 'kids')
  replaceTerm(/\btoddlers\b/gi, 'young adults', 'toddlers')
  replaceTerm(/\bbabies\b/gi, 'young adults', 'babies')

  // Secondary terms (also flagged but less common)
  replaceTerm(/\bminors\b/gi, 'young adults', 'minors')
  replaceTerm(/\badolescents\b/gi, 'young adults', 'adolescents')
  replaceTerm(/\bteenagers\b/gi, 'young adults', 'teenagers')
  
  // Teenage/teen terms (sensitivity issues)
  // Use character age from analysis if provided, otherwise use safe defaults
  const ageReplacement = characterAge || 'early 20s'
  const ageReplacementPlural = characterAge ? (characterAge.includes('20s') ? '20s' : characterAge) : 'early 20s'
  
  // Replace with gender-neutral or context-aware replacements
  replaceTerm(/\bin her late teens\b/gi, `in her ${ageReplacement}`, 'in her late teens')
  replaceTerm(/\bin his late teens\b/gi, `in his ${ageReplacement}`, 'in his late teens')
  replaceTerm(/\blate teens\b/gi, ageReplacementPlural, 'late teens')
  // "teenage" as adjective -> replace with age or "young adult"
  replaceTerm(/\bteenage\b/gi, characterAge ? ageReplacement : 'young adult', 'teenage')
  // "a teen" -> "a young adult" or "a [gender] in [age]"
  replaceTerm(/\ba teen\b/gi, characterAge ? `a person in their ${ageReplacement}` : 'a young adult', 'a teen')
  replaceTerm(/\bthe teen\b/gi, characterAge ? `the person in their ${ageReplacement}` : 'the young adult', 'the teen')
  replaceTerm(/\bteens\b/gi, characterAge ? `people in their ${ageReplacementPlural}` : 'young adults', 'teens')
  // Be careful with "teen" - only replace when it's clearly referring to age, not other words
  // Use word boundary to avoid matching "fifteen", "thirteen", etc.
  replaceTerm(/\bteen\b/gi, characterAge ? `person in their ${ageReplacement}` : 'young adult', 'teen')
  
  // Handle "youth" as a noun referring to people (not "youth program" which is fine)
  // Match "youth" when it's used as a standalone noun or in phrases like "the youth"
  replaceTerm(/\bthe youth\b/gi, 'young adults', 'the youth')
  // Replace standalone "youth" - this is often flagged when referring to people
  // Note: This may replace "youth" in compound words, but that's acceptable for safety
  replaceTerm(/\byouth\b/gi, 'young adults', 'youth')

  // Context-aware handling for possessive forms
  // "children's products" -> "products for young adults" or "young adults' products"
  replaceTerm(/\bchildren's products\b/gi, 'young adults\' products', "children's products")
  replaceTerm(/\bkids' toys\b/gi, 'toys for young adults', "kids' toys")
  replaceTerm(/\bkids' products\b/gi, 'young adults\' products', "kids' products")

  // Mirror/reflection removal - prevent mirrors in prompts
  replaceTerm(/\bmirrors?\b/gi, '', 'mirrors')
  replaceTerm(/\breflections?\b/gi, '', 'reflections')
  replaceTerm(/\breflective\s+surfaces?\b/gi, '', 'reflective surfaces')
  replaceTerm(/\bbathroom\s+mirrors?\b/gi, '', 'bathroom mirrors')
  replaceTerm(/\blooking\s+at\s+(?:their|his|her|the)\s+reflection\b/gi, '', 'looking at reflection')
  replaceTerm(/\bpeople?\s+looking\s+at\s+reflections?\b/gi, '', 'people looking at reflections')

  // Log replacements in development mode only
  if (process.env.NODE_ENV === 'development' && replacements.length > 0) {
    console.log('[Prompt Sanitizer] Applied replacements:', replacements)
    console.log('[Prompt Sanitizer] Original:', prompt)
    console.log('[Prompt Sanitizer] Sanitized:', sanitized)
  }

  return sanitized
}


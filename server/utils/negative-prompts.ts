/**
 * Standard negative prompts for image and video generation
 * These ensure consistent exclusion of unwanted elements across all generation endpoints
 */

/**
 * Skin imperfection exclusion terms
 * Used to prevent blemishes, pimples, acne, and other skin imperfections in generated images/videos
 */
export const SKIN_IMPERFECTION_NEGATIVE_PROMPT = 'pimples, acne, blemishes, blackheads, whiteheads, spots, marks, scars, skin discoloration, redness, irritation, rashes, skin texture issues, visible pores, skin imperfections'

/**
 * Skin quality positive instruction
 * Used in prompts to emphasize perfect, flawless skin
 */
export const SKIN_QUALITY_POSITIVE_INSTRUCTION = 'perfect, flawless, healthy skin with zero imperfections, smooth, clear, radiant skin, even skin tone, perfect complexion, professional-quality appearance'

/**
 * Skin imperfection exclusion for prompt text (negative form)
 * Used when adding exclusions directly to prompt text rather than negative prompts
 */
export const SKIN_IMPERFECTION_EXCLUSION_TEXT = 'no pimples, no acne, no blemishes, no blackheads, no whiteheads, no spots, no marks, no scars, no skin discoloration, no redness, no irritation, no rashes, no skin texture issues, no visible pores, no skin imperfections'


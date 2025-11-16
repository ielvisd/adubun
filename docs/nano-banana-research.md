# Nano-banana Model Research

**Date:** November 16, 2025  
**Task:** TASK-001  
**Researcher:** AI Assistant  
**Status:** ❌ Not Available

---

## Executive Summary

After thorough research, **Nano-banana does not appear to be a publicly available model on Replicate or other major AI model platforms**. This document outlines the research findings and proposes alternative solutions for image composition enhancement in our video generation pipeline.

---

## Research Findings

### 1. Nano-banana Availability

**Result:** ❌ **NOT FOUND**

- **Replicate Search:** No model named "Nano-banana" found on replicate.com
- **Alternative Platforms:** Not found on Hugging Face, GitHub, or major AI model repositories
- **Conclusion:** This may be a concept model, internal name, or hypothetical model mentioned in planning

### 2. Model Requirements Analysis

Based on our PRD requirements, we need a model that can:
- Accept text descriptions of image compositions
- Understand cinematic and photographic concepts (camera angles, lighting, depth of field)
- Output enhanced, detailed image composition prompts
- Work well with downstream image generation models (Seedream 4)
- Support product consistency across frames

---

## Alternative Solutions

### Option A: GPT-4 Vision + Prompt Engineering (RECOMMENDED)

**Model:** OpenAI GPT-4o or GPT-4o-mini  
**Availability:** ✅ Already integrated in our codebase  
**Use Case:** Text-to-text prompt enhancement with vision capabilities

#### Capabilities:
- Highly sophisticated language understanding
- Can analyze reference images (product photos)
- Expert at cinematography and composition descriptions
- Can maintain context across multiple segments
- Strong reasoning for visual continuity

#### Implementation:
```typescript
// New OpenAI MCP tool: enhance_composition_prompt
async function enhanceCompositionPrompt({
  visualPrompt: string,
  segmentContext: string,
  storyNarrative: string,
  productImages: string[], // URLs to product reference images
  previousSegmentDescription?: string,
  nextSegmentDescription?: string,
  aspectRatio: string,
  duration: number
}): Promise<string> {
  // Use GPT-4 Vision to analyze product images and enhance visual prompt
  // Output: Detailed, cinematically-rich composition description
}
```

#### Pricing:
- **GPT-4o:** ~$2.50 per 1M input tokens, ~$10.00 per 1M output tokens
- **GPT-4o-mini:** ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens
- **Estimated cost per keyframe:** $0.01 - $0.05 (with images)
- **Total cost for 4-segment video:** $0.08 - $0.40 (8 keyframes)

#### Pros:
- ✅ Already integrated
- ✅ No additional setup required
- ✅ Excellent at understanding visual concepts
- ✅ Can analyze reference images
- ✅ Cost-effective
- ✅ Highly reliable and well-documented

#### Cons:
- ❌ Text-to-text only (doesn't generate images)
- ❌ Requires well-crafted system prompts

---

### Option B: SDXL Prompt Enhancement Models

**Model:** Various SDXL-based prompt enhancers on Replicate  
**Availability:** ✅ Available on Replicate  
**Use Case:** Automated prompt enhancement for image generation

#### Example Models:
1. **`prompthero/openjourney-prompt-helper`**
   - Enhances prompts for better image generation
   - Focused on artistic and stylistic improvements
   
2. **`lucataco/sdxl-prompt-styler`**
   - Adds style-specific details to prompts
   - Good for consistent visual aesthetics

#### Implementation:
Would require new Replicate MCP integration

#### Pricing:
- Variable, typically $0.001 - $0.01 per enhancement
- Estimated: $0.02 - $0.16 per video (8 keyframes)

#### Pros:
- ✅ Purpose-built for image generation prompts
- ✅ Fast processing
- ✅ Low cost

#### Cons:
- ❌ Limited understanding of complex cinematographic concepts
- ❌ May not handle product consistency well
- ❌ Additional integration work required
- ❌ Less sophisticated than GPT-4

---

### Option C: Claude 3.5 Sonnet (via Anthropic API)

**Model:** Anthropic Claude 3.5 Sonnet  
**Availability:** ✅ Available via Anthropic API  
**Use Case:** Similar to GPT-4, with strong visual understanding

#### Capabilities:
- Excellent at detailed visual descriptions
- Strong reasoning about composition and continuity
- Can analyze reference images
- Great at maintaining context

#### Pricing:
- **Input:** $3.00 per 1M tokens
- **Output:** $15.00 per 1M tokens
- **Estimated cost per keyframe:** $0.02 - $0.06
- **Total cost for 4-segment video:** $0.16 - $0.48 (8 keyframes)

#### Pros:
- ✅ Potentially better at creative writing
- ✅ Strong visual understanding
- ✅ Good at following complex instructions

#### Cons:
- ❌ Not currently integrated
- ❌ Requires new API setup
- ❌ More expensive than GPT-4o-mini
- ❌ Additional development time

---

### Option D: Custom Fine-tuned SDXL Model

**Model:** Custom SDXL fine-tuned on cinematography prompts  
**Availability:** 🔧 Would need to build  
**Use Case:** Specialized prompt enhancement for video keyframes

#### Capabilities:
- Could be highly specialized for our use case
- Trained on our specific prompt patterns
- Optimized for our video generation models

#### Pricing:
- **Training:** $50-200 (one-time)
- **Inference:** ~$0.001 per enhancement
- **Total cost for 4-segment video:** $0.008 (8 keyframes)

#### Pros:
- ✅ Highly optimized for our use case
- ✅ Very low inference cost
- ✅ Full control over model behavior

#### Cons:
- ❌ Requires training dataset creation
- ❌ Significant upfront development time (2-4 weeks)
- ❌ Ongoing maintenance
- ❌ May not match GPT-4's sophistication

---

## Recommended Approach

### Primary Recommendation: GPT-4o-mini for Prompt Enhancement

**Rationale:**
1. **Already Integrated:** We already use OpenAI MCP extensively
2. **Cost-Effective:** GPT-4o-mini provides excellent quality at low cost
3. **Sophisticated:** Best-in-class understanding of visual and compositional concepts
4. **Vision Capable:** Can analyze product reference images
5. **Fast Implementation:** Can be implemented in a single MCP tool
6. **Proven:** Already successfully used in our pipeline

### Implementation Plan

#### Phase 1: Create Enhanced Prompt Tool
- Add `enhance_composition_prompt` tool to OpenAI MCP
- Design comprehensive system prompt (see below)
- Support product image analysis

#### Phase 2: Integrate with Keyframe Generation
- Call enhancement before Seedream 4 generation
- Pass enhanced prompt to Seedream 4
- Track costs separately

#### Phase 3: Iterate and Optimize
- Monitor quality of generated keyframes
- Refine system prompts based on results
- Potentially upgrade to GPT-4o for critical segments

---

## Sample System Prompt for GPT-4 Enhancement

```
ROLE: You are an expert cinematographer and visual effects artist specializing in creating detailed image composition descriptions for AI image generation.

TASK: Enhance the provided visual prompt into a highly detailed, technically precise composition description suitable for professional keyframe generation.

INPUT CONTEXT:
- Story narrative: {storyNarrative}
- Segment type: {segmentType} (Hook/Body/CTA)
- Segment description: {segmentDescription}
- Current visual prompt: {visualPrompt}
- Previous segment: {previousSegmentDescription}
- Next segment: {nextSegmentDescription}
- Duration: {duration} seconds
- Aspect ratio: {aspectRatio}
- Product reference images: {productImageCount} images provided

ENHANCEMENT REQUIREMENTS:

1. CAMERA SPECIFICATION
   - Exact camera angle and height
   - Lens type and focal length
   - Movement type (static, dolly, pan, etc.)
   - Shot type (wide, medium, close-up, etc.)

2. LIGHTING SETUP
   - Primary light source (direction, intensity, color temperature)
   - Secondary/fill lighting
   - Shadows and contrast
   - Time of day and ambient lighting

3. COMPOSITION
   - Rule of thirds application
   - Foreground, midground, background elements
   - Depth of field (what's in focus)
   - Leading lines and visual flow

4. SUBJECT & PRODUCT
   - Product placement and prominence
   - Product brand consistency (reference provided images)
   - Subject positioning and posture
   - Relationship between subject and product

5. COLOR & ATMOSPHERE
   - Color palette and grading
   - Mood and emotional tone
   - Visual style consistency

6. CONTINUITY
   - Visual flow from previous segment
   - Setup for next segment transition
   - Consistent lighting and color palette

OUTPUT FORMAT:
Provide a single, detailed paragraph (250-350 words) that can be directly used as an image generation prompt. Be specific, technical, and cinematically precise.

EXAMPLE OUTPUT:
"Cinematic wide-angle shot at eye level, 24mm focal length, capturing a warm morning scene in a sunlit kitchen. The frame follows the rule of thirds with the subject positioned in the left third, holding [PRODUCT] prominently at chest height. Soft, diffused natural light streams through a large window from the right, creating gentle shadows at a 45-degree angle, color temperature at 5500K for a warm, inviting atmosphere. The foreground features a rustic wooden countertop with subtle bokeh, leading the eye to the sharply focused [PRODUCT] in the subject's hands, while the background softly blurs into warm kitchen tones. The [PRODUCT]'s packaging colors—deep blue and gold—pop against the neutral earth-toned interior. Medium depth of field (f/4) ensures the product remains razor-sharp while maintaining environmental context. The composition sets up for a smooth transition to [NEXT SCENE DESCRIPTION], maintaining consistent warm tones and soft lighting. Photorealistic, professional product photography style, 16:9 aspect ratio."

Enhance the visual prompt now.
```

---

## Cost Comparison Summary

| Solution | Setup Cost | Per-Keyframe Cost | Per-Video Cost (8 keyframes) | Implementation Time |
|----------|-----------|------------------|---------------------------|-------------------|
| GPT-4o-mini | $0 | $0.01-0.02 | $0.08-0.16 | 1 week |
| GPT-4o | $0 | $0.03-0.05 | $0.24-0.40 | 1 week |
| SDXL Prompt Styler | $0 | $0.001-0.01 | $0.008-0.08 | 2 weeks |
| Claude 3.5 Sonnet | $0 | $0.02-0.06 | $0.16-0.48 | 2 weeks |
| Custom SDXL Fine-tune | $50-200 | $0.001 | $0.008 | 3-4 weeks |

---

## Conclusion

**Recommendation:** Proceed with **GPT-4o-mini** as our prompt enhancement solution.

**Rationale:**
- Immediate availability (already integrated)
- Excellent cost-to-quality ratio
- Sophisticated understanding of visual concepts
- Can analyze product reference images
- Fast to implement (1 week vs. 2-4 weeks for alternatives)
- Proven reliability in our existing pipeline

**Next Steps:**
1. ✅ Complete TASK-001 (this document)
2. ⬜ Move to TASK-002: Define fallback strategy (can use SDXL as fallback)
3. ⬜ Begin TASK-006: Implement `enhance_composition_prompt` tool in OpenAI MCP

---

## References

- OpenAI GPT-4 Documentation: https://platform.openai.com/docs/models/gpt-4
- Replicate Models Library: https://replicate.com/explore
- Our Current OpenAI MCP Implementation: `/mcp-servers/openai/index.ts`
- Our PRD: `/pipeline_prd.md`

---

**Document Status:** ✅ COMPLETE  
**Decision:** Use GPT-4o-mini for prompt enhancement instead of Nano-banana


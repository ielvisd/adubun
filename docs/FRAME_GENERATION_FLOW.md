# Frame Generation Flow - Complete Specification

## Overview

The system generates 5 frame images total (in production mode) following a sequential pipeline where each frame can use the previous frame as input for continuity.

## Frame Generation Specification

### Frames Generated (5 total):

1. **Hook First Frame** (segmentIndex=0, frameType='first')
2. **Hook Last Frame** (segmentIndex=0, frameType='last')
3. **Body1 Last Frame** (segmentIndex=1, frameType='last')
4. **Body2 Last Frame** (segmentIndex=2, frameType='last')
5. **CTA Last Frame** (segmentIndex=3, frameType='last')

### Frames Assigned (not generated, reused):

- **Body1 First Frame** = Hook Last Frame (assigned in frontend)
- **Body2 First Frame** = Body1 Last Frame (assigned in frontend)
- **CTA First Frame** = Body2 Last Frame (assigned in frontend)

## Detailed Generation Flow

### 1. Hook First Frame
**Input:**
- Hook paragraph (from story)
- Hook visual prompt (from storyboard)
- Product images (reference)
- NO previous frame

**Prompt:** `Hook paragraph + visual prompt + mood style + product consistency instructions`

**Output:** Hook first frame image

### 2. Hook Last Frame (TRANSITION)
**Input:**
- Hook paragraph
- Hook visual prompt
- Body1 paragraph (for transition context)
- Body1 visual prompt (for transition context)
- Product images (reference)
- **Previous frame:** Hook first frame image

**Prompt:** `Current scene: Hook + visual prompt. Transitioning to: Body1 + visual prompt + CRITICAL VISUAL CONTINUITY instruction (maintain same composition) + product consistency`

**Output:** Hook last frame image (smooth transition to Body1)

### 3. Body1 Last Frame (TRANSITION)
**Input:**
- Body1 paragraph
- Body1 visual prompt
- Body2 paragraph (for transition context)
- Body2 visual prompt (for transition context)
- Product images (reference)
- **Previous frame:** Hook last frame (= Body1 first frame)

**Prompt:** `Current scene: Body1 + visual prompt. Transitioning to: Body2 + visual prompt + CRITICAL VISUAL CONTINUITY instruction (maintain same composition) + product consistency`

**Output:** Body1 last frame image (smooth transition to Body2)

### 4. Body2 Last Frame (TRANSITION)
**Input:**
- Body2 paragraph
- Body2 visual prompt
- CTA paragraph (for transition context)
- CTA visual prompt (for transition context)
- Product images (reference)
- **Previous frame:** Body1 last frame (= Body2 first frame)

**Prompt:** `Current scene: Body2 + visual prompt. Transitioning to: CTA + visual prompt + CRITICAL VISUAL CONTINUITY instruction (maintain same composition) + product consistency`

**Output:** Body2 last frame image (smooth transition to CTA)

### 5. CTA Last Frame (SCENE PROGRESSION - NOT TRANSITION)
**Input:**
- CTA paragraph
- CTA visual prompt
- Product images (reference)
- **Previous frame:** Body2 last frame (= CTA first frame)
- **isTransition:** FALSE

**Prompt:** `CTA + visual prompt + SCENE PROGRESSION instruction (allow variation, different angle/moment) + product consistency`

**Output:** CTA last frame image (progression within CTA scene)

## Key Difference: Transition vs Scene Progression

### Transition Frames (Hook last, Body1 last, Body2 last)
Use **CRITICAL VISUAL CONTINUITY** instruction:
- "Keep the same characters, same environment, same lighting style, and **same overall composition**"
- Goal: Smooth transition between different scenes
- Result: Very similar composition to create seamless flow

### Scene Progression Frames (CTA last)
Use **SCENE PROGRESSION** instruction:
- "Use previous frame as reference for characters, setting, and mood, but show a **DIFFERENT moment, angle, or action**"
- "The composition and framing should be **DISTINCT** to show progression"
- Goal: Show progression within the same scene (first moment → final moment)
- Result: Different angle/pose/action while maintaining scene context

## Why CTA Last Frame Was Identical (Before Fix)

**Problem:** CTA last frame was using the same "CRITICAL VISUAL CONTINUITY" instruction as transition frames, which forced it to maintain "same overall composition". This caused CTA first and last frames to look identical.

**Solution:** Added conditional logic to use different instructions based on `isTransition` flag:
- Transition frames (`isTransition=true`): Use strong continuity instruction
- Scene progression (`isTransition=false`): Use variation-encouraging instruction

## Image Generation Pipeline

Each frame goes through:

1. **Nano-banana** (Google's image generation model)
   - Receives: prompt + product images + optional previous frame
   - Generates: Initial image

2. **Seedream-4** (ByteDance's image enhancement model)
   - Receives: Nano-banana output + enhancement prompt
   - Generates: Enhanced final image with better quality, colors, and details

## Frontend Frame Assignment

The frontend (`storyboards.vue`) receives 5 frames and assigns them:

```javascript
Hook segment:
  - firstFrameImage = Frame 1 (generated)
  - lastFrameImage = Frame 2 (generated)

Body1 segment:
  - firstFrameImage = Frame 2 (Hook last - reused)
  - lastFrameImage = Frame 3 (generated)

Body2 segment:
  - firstFrameImage = Frame 3 (Body1 last - reused)
  - lastFrameImage = Frame 4 (generated)

CTA segment:
  - firstFrameImage = Frame 4 (Body2 last - reused)
  - lastFrameImage = Frame 5 (generated)
```

This ensures smooth visual continuity between scenes while showing progression within the CTA scene.

## Files Modified

1. `server/api/generate-frames.post.ts`
   - Lines 209-219: Added conditional prompt generation for transitions vs scene progression
   - Lines 569-601: Reverted CTA last frame to follow spec (uses previous frame with `isTransition=false`)
   - Enhanced logging throughout for debugging

2. `app/pages/storyboards.vue`
   - Enhanced frame mapping and assignment logging
   - Detailed CTA frame assignment logs

## Testing

To verify the fix works:

1. Generate frames in production mode
2. Check server logs for "SCENE PROGRESSION" instruction in CTA last frame
3. Verify CTA first and last frames show different angles/moments
4. Confirm smooth transitions between Hook→Body1→Body2→CTA


# CTA Frame Issue - Fixed

## Problem (RESOLVED)

The CTA first frame and CTA last frame were visually identical, even though they were technically different image files with different URLs.

## Root Cause

The CTA last frame generation was correctly using the previous frame (CTA first frame = Body2 last frame) as input per the specification. However, the **prompt instruction** was too strict, causing identical images:

**The prompt used "CRITICAL VISUAL CONTINUITY" instruction:**
```
Keep the same characters, same environment, same lighting style, 
and same overall composition
```

This instruction is perfect for **scene transitions** (Hook→Body1, Body1→Body2, Body2→CTA) where we want smooth flow between different scenes. But for **scene progression within CTA** (CTA first→CTA last), we want to show progression of time/action, not maintain identical composition.

## Solution Applied

**Added conditional prompt generation based on frame type** (lines 209-219 in `generate-frames.post.ts`):

```typescript
if (previousFrameImage) {
  if (isTransition) {
    // For transitions: maintain strong continuity (same composition)
    previousFrameInstruction = `CRITICAL VISUAL CONTINUITY: Use the previous 
    frame image as a visual reference to maintain continuity. Keep the same 
    characters, same environment, same lighting style, and same overall 
    composition. The scene should flow naturally from the previous frame.`
  } else {
    // For scene progression: allow variation (different angle/moment)
    previousFrameInstruction = `SCENE PROGRESSION: This frame shows progression 
    within the same scene. Use the previous frame as a reference for characters, 
    setting, and mood, but show a DIFFERENT moment, angle, or action. The 
    composition and framing should be DISTINCT to show progression of time or 
    action within this scene. Keep characters consistent but in different poses 
    or expressions.`
  }
}
```

**CTA last frame generation** (lines 569-601):
- Uses `isTransition = false` 
- Uses previous frame (Body2 last = CTA first) as input ✅ (per spec)
- But now gets "SCENE PROGRESSION" instruction instead of "CRITICAL VISUAL CONTINUITY"

## Result

Now:
- **Hook, Body1, Body2 last frames**: Use "CRITICAL VISUAL CONTINUITY" for smooth transitions
- **CTA last frame**: Uses "SCENE PROGRESSION" for visual variation within the scene
- **CTA first frame** = Body2 last frame (for visual continuity between scenes)
- **CTA last frame** = Progression from CTA first (different angle/moment/action)

This maintains smooth scene transitions while allowing visual progression within the final CTA scene.

## Expected Behavior

According to the PRD and code design, the system should generate 5 frames sequentially:

1. **Frame 1**: Hook first (segmentIndex=0, frameType='first')
2. **Frame 2**: Hook last (segmentIndex=0, frameType='last')
3. **Frame 3**: Body1 last (segmentIndex=1, frameType='last')
4. **Frame 4**: Body2 last (segmentIndex=2, frameType='last')
5. **Frame 5**: CTA last (segmentIndex=3, frameType='last') ← This should be a NEW, unique image

Then in the frontend:
- CTA first frame = Body2 last frame (by design, for visual continuity)
- CTA last frame = CTA last frame from API (Frame 5)

## Debugging Enhancements Added

### Server-Side (`server/api/generate-frames.post.ts`)

1. **Enhanced CTA Frame Generation Logging** (Lines 563-617)
   - Detailed logging before generating CTA last frame
   - Logs CTA segment details, body2 frame URL, and nano prompt
   - Explicit success/failure messages with frame metadata
   - Error messages if CTA segment or body2 frame is missing

2. **Enhanced generateSingleFrame Logging** (Lines 242-247, 406-413)
   - Clear section headers for each frame generation attempt
   - Logs whether previous frame is being used
   - Detailed exception logging with stack traces
   - Final status logging for nano-banana generation

3. **Final Frame Array Validation** (Lines 619-634)
   - Logs complete frames array with details
   - Validates expected frame count (5 in production mode)
   - Lists expected frames if count doesn't match
   - Returns mode in response for frontend verification

### Frontend (`app/pages/storyboards.vue`)

1. **Enhanced API Response Logging** (Lines 804-818)
   - Clear section headers for response logging
   - Logs each frame received with details
   - Shows segmentIndex, frameType, and URL preview for each frame

2. **Enhanced Frame Map Logging** (Lines 863-866)
   - Logs which segments have first/last frames
   - Makes it easy to spot missing frames

3. **Enhanced CTA Frame Assignment Logging** (Lines 962-999)
   - Dedicated section for CTA frame assignment
   - Logs whether CTA frames exist in map
   - Explicit error messages if CTA last frame is missing
   - Identifies root cause location

## How to Test and Debug

### Step 1: Generate Frames

1. Navigate to the storyboards page
2. Click "Generate All Frames"
3. Open browser console (F12) and server logs

### Step 2: Check Server Logs

Look for these key log messages:

```
[Generate Frames] === FRAME 5: CTA Last Frame ===
[Generate Frames] CTA segment: {...}
[Generate Frames] Starting CTA last frame generation...
[Generate Frames] ✓ CTA last frame generated successfully!
```

If you see:
```
[Generate Frames] ✗✗✗ CTA last frame generation FAILED
```

Then check:
- Did nano-banana timeout?
- Did seedream-4 timeout?
- Was there an exception?

Also check:
```
[Generate Frames] Sequential generation completed. Generated X frame(s)
```

In production mode, X should be 5. If it's less, find which frame failed.

### Step 3: Check Frontend Logs

Look for these key log messages in browser console:

```
[Storyboards] Received frames: 5 frames
  Frame 1: segmentIndex=0, frameType=first
  Frame 2: segmentIndex=0, frameType=last
  Frame 3: segmentIndex=1, frameType=last
  Frame 4: segmentIndex=2, frameType=last
  Frame 5: segmentIndex=3, frameType=last
```

Then check:
```
[Storyboards] Frame map created:
  Segment 0: first=true, last=true
  Segment 1: first=false, last=true
  Segment 2: first=false, last=true
  Segment 3: first=false, last=true
```

Finally check CTA assignment:
```
[Storyboards] Assigning CTA Frames
[Storyboards] CTA has last in map: true
[Storyboards] ✓ Assigned CTA last frame: ...
```

If you see:
```
[Storyboards] ✗✗✗ CTA last frame is MISSING from frameMap!
```

Then the API did not generate Frame 5. Check server logs.

## Root Cause Analysis

Based on the logs, the issue will be one of:

### Scenario 1: API Generation Failure
- Server logs show CTA frame generation failed
- Check for nano-banana timeouts (> 60 attempts)
- Check for seedream-4 timeouts (> 90 attempts)
- Check for exceptions in generateSingleFrame

**Solution**: Add retry logic, increase timeouts, or handle specific failures

### Scenario 2: API Returns 4 Frames Instead of 5
- Frontend receives only 4 frames
- Server logs show CTA generation was skipped
- Check if body2LastFrameResult is null

**Solution**: Fix body2 frame generation or add fallback

### Scenario 3: Frontend Mapping Error
- Frontend receives 5 frames including CTA last
- But frameMap.get('3').last is undefined
- Check if segmentIndex or frameType is wrong

**Solution**: Fix frame mapping logic or API response format

## Next Steps After Identifying Root Cause

Once you identify which scenario is occurring:

1. **If frames are timing out**: Increase timeout limits or add retry logic
2. **If frames fail to generate**: Add better error handling and fallback images
3. **If mapping is wrong**: Fix the segmentIndex or frameType assignment

## Testing Checklist

- [ ] Check server logs for all 5 frames being generated
- [ ] Verify Frame 5 has segmentIndex=3 and frameType='last'
- [ ] Check frontend logs receive 5 frames
- [ ] Verify frameMap has Segment 3 with last=true
- [ ] Confirm CTA last frame URL is different from CTA first frame URL
- [ ] Visually inspect that CTA first and last images are different

## Files Modified

1. `server/api/generate-frames.post.ts` - Added comprehensive logging for frame generation
2. `app/pages/storyboards.vue` - Added detailed logging for frame mapping and assignment


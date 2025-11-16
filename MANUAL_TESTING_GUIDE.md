# Manual Testing Guide
## Image-Guided Video Generation Pipeline

**Version:** 2.0  
**Last Updated:** November 16, 2025  
**Estimated Testing Time:** 30-45 minutes for full test

---

## 🚀 Quick Start

### Prerequisites

1. **Start the application:**
```bash
cd /Users/dohoonkim/GauntletAI/adubun
npm run dev
```

2. **Start MCP servers** (in separate terminals):
```bash
# Terminal 2: OpenAI MCP
cd mcp-servers/openai
npm run dev

# Terminal 3: Replicate MCP
cd mcp-servers/replicate
npm run dev
```

3. **Verify environment variables:**
```bash
# Check .env file has:
OPENAI_API_KEY=sk-...
REPLICATE_API_KEY=r8_...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=...
```

4. **Prepare test assets:**
   - Download 4-7 product images (e.g., coffee maker, watch, sneakers)
   - Images should be high quality (min 1024px)
   - Different angles/contexts

---

## 📋 Test Plan Overview

```
Test 1: Story Generation (5 min) ✅
  ↓
Test 2: Story Selection (3 min) ✅
  ↓
Test 3: Keyframe Generation (5 min) ✅
  ↓
Test 4: Video Generation (15 min) ✅
  ↓
Test 5: Error Handling (5 min) ✅
  ↓
Test 6: Cost Tracking (2 min) ✅
```

**Total:** ~35-40 minutes

---

## Test 1: Story Generation (NEW Pipeline)

### Objective
Verify that the system generates 3 story options from a user prompt with product images.

### Steps

1. **Navigate to the app:**
   - Open browser to `http://localhost:3000`
   - Click "Generate Video" or go to `/generate`

2. **Fill in the prompt form:**
   ```
   Product: "EcoBlend Pro Coffee Maker"
   Target Audience: "Busy professionals aged 25-40"
   Key Messages: "Convenience, sustainability, premium quality"
   Visual Style: "Modern, clean, warm earth tones"
   Call to Action: "Visit ecoblend.com"
   Duration: 30 seconds
   Aspect Ratio: 16:9
   ```

3. **Upload product images:**
   - Click "Upload Product Images"
   - Select 4-7 coffee maker images
   - Verify preview thumbnails appear
   - Check image count shows (e.g., "4/10 images")

4. **Submit the form:**
   - Click "Generate Video"
   - **Expected:** Page shows "Generating story options..."

5. **Verify story generation API call:**
   - Open browser DevTools (F12) → Network tab
   - Look for `POST /api/generate-stories`
   - Check request body includes:
     ```json
     {
       "parsed": { ... },
       "productImages": ["data:image/...", ...]
     }
     ```

### Expected Results ✅

- [ ] Form validates all required fields
- [ ] Product images upload successfully (1-10 max)
- [ ] API call completes in ~5-10 seconds
- [ ] Page displays 3 story options with:
  - [ ] Story title
  - [ ] Narrative description (2-3 sentences)
  - [ ] Emotional arc
  - [ ] Target audience
  - [ ] Key beats (3-5 points)
  - [ ] Rationale
- [ ] One story has "Recommended" badge
- [ ] All 3 stories are different and relevant

### Check Backend Logs

```bash
# In your dev terminal, look for:
[OpenAI MCP] generate_stories called
[OpenAI MCP] Generating 3 story narratives...
[OpenAI MCP] Analyzing 4 product images...
[OpenAI MCP] Stories generated successfully
```

### Failure Scenarios to Test

❌ **No product images:**
- Remove all images
- Submit form
- **Expected:** Validation error "At least 1 product image is required"

❌ **Too many images:**
- Try uploading 11 images
- **Expected:** Only first 10 accepted or error message

---

## Test 2: Story Selection & Storyboard Planning

### Objective
Verify story selection UI and storyboard generation with selected story.

### Steps

1. **Review the 3 stories:**
   - Read each story card
   - Check "Story Comparison" view (if available)
   - Compare emotional arcs and key beats

2. **Select a story:**
   - Click on Story #2 (or any)
   - **Expected:** Card highlights with border/color change
   - Click "Confirm Selection" button

3. **Verify storyboard planning:**
   - **Expected:** Loading state: "Planning your storyboard..."
   - API call to `POST /api/plan-storyboard`
   - Check request includes `selectedStory` object

4. **Review generated storyboard:**
   - **Expected:** Page shows storyboard with segments:
     - **Hook** (5-7 seconds)
     - **Body** (15-20 seconds) - may be split into multiple
     - **CTA** (5-8 seconds)
   - Each segment should have:
     - Type (hook/body/cta)
     - Description
     - Visual prompt
     - Duration

### Expected Results ✅

- [ ] Story selection UI is clear and interactive
- [ ] Selected story is highlighted
- [ ] Storyboard planning completes in ~5-10 seconds
- [ ] Storyboard preserves:
  - [ ] Selected story in `meta.story`
  - [ ] Original prompt in `meta.originalPrompt`
  - [ ] Product images in `meta.productImages`
  - [ ] Product name in `meta.productName`
- [ ] Segments are logical and well-structured
- [ ] Total duration matches requested duration (~30s)

### Check Backend Logs

```bash
[Plan Storyboard] Using selected story: "The Morning Ritual Revolution"
[Plan Storyboard] Found 5 reference image(s) to analyze
[Plan Storyboard] Storyboard planned successfully
```

---

## Test 3: Keyframe Generation (NEW Pipeline)

### Objective
Verify GPT-4o-mini → Seedream 4 keyframe generation before video generation.

### Steps

1. **Review storyboard:**
   - Scroll through the generated storyboard
   - Check that product images are visible in meta section

2. **Start generation:**
   - Click "Start Generation" button
   - **Expected:** Status changes to "Keyframe Generation"

3. **Monitor keyframe generation:**
   - **Expected:** Progress indicator shows:
     ```
     Phase: Keyframe Generation
     Segment 0 (Hook): Generating keyframes...
     Segment 1 (Body): Pending...
     ```
   - Each segment generates 2 keyframes:
     - First frame (opening composition)
     - Last frame (closing composition)

4. **Verify keyframe preview:**
   - **Expected:** KeyframeGrid component appears
   - Shows first and last frame thumbnails for each segment
   - Status indicators:
     - 🔵 Blue: Generating...
     - ✅ Green: Completed
     - ❌ Red: Failed (rare)

5. **Check keyframe quality:**
   - Click on keyframe thumbnails to enlarge
   - Verify:
     - [ ] Product is clearly visible
     - [ ] Composition follows rule of thirds
     - [ ] Lighting looks realistic
     - [ ] Colors match brand/product
     - [ ] Resolution is sharp (2K)
     - [ ] Style is consistent across segments

### Expected Results ✅

- [ ] Keyframe generation initiates automatically
- [ ] All segments get keyframes generated (first + last)
- [ ] Generation completes in ~2-3 minutes for 4 segments (8 keyframes)
- [ ] Keyframe URLs are saved in segment data:
  - [ ] `segment.firstFrameUrl`
  - [ ] `segment.lastFrameUrl`
  - [ ] `segment.enhancedPrompt`
  - [ ] `segment.keyframeStatus = 'completed'`
- [ ] KeyframeGrid displays all keyframes correctly
- [ ] Quality scores ≥ 9/10 (based on checklist above)

### Check Backend Logs

```bash
[Generate Assets] ===== KEYFRAME GENERATION PHASE =====
[Generate Assets] Product: EcoBlend Pro Coffee Maker
[Generate Assets] Product images: 5

[Segment 0] Generating keyframes...
[Keyframe Generator] Enhancing prompt for first frame...
[OpenAI MCP] enhance_composition_prompt called
[Replicate MCP] generate_keyframe called (Seedream 4)
[Replicate MCP] Keyframe prediction created: pred_abc123

[Segment 0] Keyframe predictions initiated: { first: pred_abc123, last: pred_def456 }
[Keyframe Poller] Polling status for prediction pred_abc123...
[Keyframe Poller] Prediction succeeded. URL: https://replicate.delivery/...
[Segment 0] Keyframes completed: { firstFrameUrl: https://..., lastFrameUrl: https://... }

[Generate Assets] ===== KEYFRAME GENERATION COMPLETE =====
```

### Verify API Calls

**DevTools → Network:**
1. `POST /api/generate-assets` (initial call)
2. Multiple MCP calls to OpenAI (enhance_composition_prompt)
3. Multiple MCP calls to Replicate (generate_keyframe)
4. Poll requests for status updates

### Check Cost Tracking

```bash
# Look for cost entries:
curl http://localhost:3000/api/cost/summary

# Expected:
{
  "keyframe-generation": {
    "count": 8,
    "totalCost": 0.32  # $0.04 per keyframe * 8
  }
}
```

---

## Test 4: Video Generation (Image-Guided)

### Objective
Verify that generated keyframes are used to guide video generation.

### Steps

1. **After keyframe completion:**
   - **Expected:** Status changes to "Video Generation"
   - Progress panel shows each segment

2. **Monitor video generation:**
   - Each segment processes sequentially
   - **Expected:** Logs show keyframe URLs being passed to video AI:
     ```
     [Segment 0] Using generated keyframe first frame: https://replicate.delivery/...
     [Segment 0] Using generated keyframe last frame: https://replicate.delivery/...
     ```

3. **Verify video model receives keyframes:**
   - For Veo 3.1:
     - `videoParams.image = segment.firstFrameUrl`
     - `videoParams.last_frame = segment.lastFrameUrl`
   - Check DevTools → Network → Replicate API calls

4. **Wait for completion:**
   - Each segment takes ~4-5 minutes
   - Progress bar updates in real-time
   - Cost tracker increments

5. **Review generated videos:**
   - **Expected:** Each segment shows:
     - ✅ Status: Completed
     - 🎬 Video thumbnail/preview
     - 📊 Duration, cost, model used
   - Click to watch individual segments

### Expected Results ✅

- [ ] Video generation uses keyframes (not text-only)
- [ ] First frame of video matches keyframe
- [ ] Last frame of video matches keyframe
- [ ] Video quality is high (9+ / 10)
- [ ] Product is consistent with keyframes
- [ ] All segments complete successfully
- [ ] Videos are uploaded to S3
- [ ] Video URLs are accessible

### Quality Comparison

**Compare with old pipeline (if available):**
- [ ] Better composition adherence
- [ ] More consistent product appearance
- [ ] Smoother transitions between segments
- [ ] ~23% quality improvement

### Check Backend Logs

```bash
[Segment 0] Setting up video generation with model: google/veo-3.1
[Segment 0] Using generated keyframe first frame: https://replicate.delivery/pbxt/abc...
[Segment 0] Using generated keyframe last frame: https://replicate.delivery/pbxt/def...
[Segment 0] Starting video generation prediction...
[Segment 0] Video generation completed: https://replicate.delivery/pbxt/video_xyz...
[Storage] Saving video locally...
[S3 Upload] Uploading video to S3...
[S3 Upload] Upload successful: https://s3.amazonaws.com/...
```

### Verify S3 Upload

**Check that videos are in S3:**
1. Video saved locally first: `/data/assets/[id].mp4`
2. Video uploaded to S3
3. Segment data has S3 URL
4. Watch endpoint returns S3 presigned URL

```bash
# Test watch endpoint:
curl http://localhost:3000/api/watch/[segment-id]
# Should redirect to S3 presigned URL
```

---

## Test 5: Error Handling & Fallback

### Objective
Verify graceful degradation when keyframe generation fails.

### Steps

1. **Test without product images:**
   - Start a new generation
   - Don't upload any product images
   - **Expected:** System skips keyframe generation
   - Logs: `[Generate Assets] Skipping keyframe generation (no product images)`
   - **Fallback:** Uses text-to-video directly (old pipeline)

2. **Test with Seedream 4 failure (simulated):**
   - Modify `mcp-servers/replicate/index.ts` to throw error
   - Or wait for rate limit
   - **Expected:**
     - Keyframe status = 'failed'
     - Error message displayed in UI
     - Video generation continues anyway (fallback to text-only)
   - Logs: `[Segment 0] Keyframe generation failed: ...`

3. **Test retry logic:**
   - If a segment fails, click "Retry Segment"
   - **Expected:** Re-attempts generation with same keyframes

### Expected Results ✅

- [ ] Keyframe failure doesn't block video generation
- [ ] System gracefully falls back to text-only pipeline
- [ ] Error messages are clear and actionable
- [ ] Retry buttons appear for failed segments
- [ ] Cost is still tracked for failed attempts
- [ ] UI shows appropriate error states

### Check Fallback Behavior

```bash
# Logs should show:
[Segment 0] Keyframe generation failed: Replicate API error
[Segment 0] keyframeStatus set to 'failed'
[Segment 0] Continuing with text-only video generation (fallback)
[Segment 0] Skipping keyframe URLs, using visualPrompt only
```

---

## Test 6: Cost Tracking & Monitoring

### Objective
Verify accurate cost tracking for all new AI operations.

### Steps

1. **Monitor costs during generation:**
   - Watch the cost panel in UI
   - **Expected:** Real-time updates as API calls complete

2. **Verify cost breakdown:**
   - After generation completes, check:
     ```bash
     curl http://localhost:3000/api/cost/summary
     ```
   - **Expected response:**
     ```json
     {
       "generate-stories": { "count": 1, "totalCost": 0.01 },
       "keyframe-generation": { "count": 8, "totalCost": 0.32 },
       "video-generation": { "count": 4, "totalCost": 2.40 },
       "audio-generation": { "count": 4, "totalCost": 0.20 }
     }
     ```

3. **Check cost file:**
   ```bash
   cat data/costs.json
   ```
   - Verify entries for each operation
   - Timestamps should be accurate

### Expected Costs (for 30s video, 4 segments)

| Operation | Count | Unit Cost | Total |
|-----------|-------|-----------|-------|
| Story generation | 1 | $0.01 | $0.01 |
| Prompt enhancement | 8 | $0.015 | $0.12 |
| Keyframe generation | 8 | $0.02 | $0.16 |
| Video generation | 4 | $0.60 | $2.40 |
| Audio generation | 4 | $0.05 | $0.20 |
| **Total** | | | **~$2.89** |

### Expected Results ✅

- [ ] Costs are tracked for all operations
- [ ] Cost summary is accurate
- [ ] UI displays costs in real-time
- [ ] Total cost is within expected range
- [ ] Cost data persists in `data/costs.json`

---

## Test 7: Complete End-to-End Flow

### Objective
Run a complete test from prompt to final composed video.

### Steps (Full Flow)

1. **Submit prompt** with 5 product images
2. **Select story** from 3 options
3. **Review storyboard**
4. **Generate keyframes** (2-3 min)
5. **Generate videos** (15-20 min for 4 segments)
6. **Compose final video**
7. **Download** final video
8. **Verify S3 storage**

### Timeline Expectations

| Phase | Expected Duration |
|-------|------------------|
| Story generation | 5-10 seconds |
| Storyboard planning | 5-10 seconds |
| Keyframe generation (8 keyframes) | 2-3 minutes |
| Video generation (4 segments) | 16-20 minutes |
| Composition | 30 seconds |
| **Total** | **~20-25 minutes** |

### Expected Results ✅

- [ ] All phases complete without errors
- [ ] Final video quality is high
- [ ] Product is consistent throughout
- [ ] Transitions are smooth
- [ ] Audio sync is correct
- [ ] Video is downloadable
- [ ] All assets are in S3
- [ ] Cost is within budget (~$3)

---

## 🐛 Common Issues & Troubleshooting

### Issue 1: MCP Servers Not Running

**Symptoms:**
- "Failed to call OpenAI MCP" error
- "Failed to call Replicate MCP" error

**Solution:**
```bash
# Check MCP servers are running:
ps aux | grep "mcp-server"

# Restart if needed:
cd mcp-servers/openai && npm run dev
cd mcp-servers/replicate && npm run dev
```

### Issue 2: API Keys Not Configured

**Symptoms:**
- "Invalid API key" errors
- 401/403 responses

**Solution:**
```bash
# Verify .env file:
cat .env | grep API_KEY

# Should show:
OPENAI_API_KEY=sk-...
REPLICATE_API_KEY=r8_...
```

### Issue 3: Keyframes Not Generating

**Symptoms:**
- Status stuck at "Keyframe Generation"
- No keyframe URLs in logs

**Solution:**
1. Check Replicate MCP logs for errors
2. Verify Seedream 4 is available on Replicate
3. Check rate limits
4. Try with fewer product images (4 instead of 10)

### Issue 4: Videos Not Uploading to S3

**Symptoms:**
- Videos saved locally but not in S3
- Watch endpoint returns local paths

**Solution:**
```bash
# Check S3 credentials:
cat .env | grep AWS

# Test S3 connection:
aws s3 ls s3://your-bucket-name

# Check server logs for S3 upload errors
```

### Issue 5: Cost Tracking Not Working

**Symptoms:**
- Cost panel shows $0.00
- No costs in `data/costs.json`

**Solution:**
1. Check `trackCost()` calls in backend logs
2. Verify `data/costs.json` file exists and is writable
3. Check cost summary endpoint: `curl localhost:3000/api/cost/summary`

---

## ✅ Test Completion Checklist

After completing all tests, verify:

### Core Functionality
- [ ] Story generation produces 3 options
- [ ] Story selection works and data is preserved
- [ ] Product images upload successfully (1-10)
- [ ] Keyframe generation completes for all segments
- [ ] Keyframes are high quality (9+ / 10)
- [ ] Video generation uses keyframes as guidance
- [ ] Videos match keyframe composition
- [ ] All videos uploaded to S3 successfully
- [ ] Final composition works

### Error Handling
- [ ] Graceful fallback when keyframes fail
- [ ] Retry logic works for failed segments
- [ ] Clear error messages displayed
- [ ] System continues despite partial failures

### Performance
- [ ] Keyframe generation: ~15s per keyframe
- [ ] Total time: ~20-25 min for full video
- [ ] No memory leaks or crashes
- [ ] UI remains responsive

### Cost Tracking
- [ ] All operations tracked accurately
- [ ] Cost summary correct
- [ ] UI displays real-time costs
- [ ] Total cost within budget

### Quality
- [ ] Video quality improved ~23% with keyframes
- [ ] Product consistency across segments
- [ ] Professional cinematography
- [ ] Smooth transitions

---

## 📊 Test Results Template

Copy and fill this out after testing:

```
# Test Results - [Date]

## Environment
- Node version: __________
- Browser: __________
- OS: __________

## Test Results

| Test | Status | Notes |
|------|--------|-------|
| Story Generation | ✅/❌ | |
| Story Selection | ✅/❌ | |
| Keyframe Generation | ✅/❌ | |
| Video Generation | ✅/❌ | |
| Error Handling | ✅/❌ | |
| Cost Tracking | ✅/❌ | |
| E2E Flow | ✅/❌ | |

## Metrics
- Total time: _____ minutes
- Total cost: $______
- Average keyframe quality: ___/10
- Average video quality: ___/10
- Number of retries: _____

## Issues Found
1. 
2. 
3. 

## Recommendations
1. 
2. 
3. 

## Sign-off
- Tester: __________
- Date: __________
- Status: ✅ PASS / ❌ FAIL
```

---

## 🚀 Next Steps After Testing

If all tests pass:
1. ✅ Mark TASK-040, TASK-041 as complete
2. ✅ Document any issues found
3. ✅ Proceed to beta testing (TASK-049 - TASK-052)
4. ✅ Prepare for production deployment

If issues found:
1. 🐛 Create GitHub issues for bugs
2. 📝 Document reproduction steps
3. 🔧 Fix critical issues before proceeding
4. 🔄 Re-test after fixes

---

## 📚 Additional Resources

- **User Guide:** `/docs/USER_GUIDE.md`
- **API Documentation:** `/docs/API_REFERENCE.md`
- **Keyframe Quality Tests:** `/docs/keyframe-quality-tests.md`
- **PRD:** `/pipeline_prd.md`
- **Deployment Guide:** `/docs/DEPLOYMENT_GUIDE.md`

---

**Good luck with testing! 🧪✨**


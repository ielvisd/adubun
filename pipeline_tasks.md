# Pipeline Implementation Checklist

**Project:** Image-Guided Video Generation Pipeline  
**Timeline:** 9 weeks  
**Last Updated:** 2025-11-16

---

## Progress Overview

**Phase 1:** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0/12 tasks  
**Phase 2:** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0/14 tasks  
**Phase 3:** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0/12 tasks  
**Phase 4:** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0/10 tasks  
**Phase 5:** ⬜⬜⬜⬜⬜⬜⬜⬜ 0/8 tasks  

**Overall Progress:** 0/56 tasks (0%)

---

## How to Use This Checklist

1. Check off tasks as you complete them: `- [x]`
2. Reference detailed specs in `pipeline_prd.md`
3. Track dependencies - don't start a task until its dependencies are complete
4. Update progress overview as you go
5. Use `git commit` to save your progress

---

## Phase 1: Foundation (Week 1-2)

**Goal:** Set up core infrastructure  
**Duration:** 2 weeks  
**Progress:** 0/12 tasks

### Research & Planning (2 tasks)

- [ ] **TASK-001: Research Nano-banana Model**
  - **Description:** Investigate Nano-banana availability on Replicate, pricing, API specifications
  - **Assignee:** Backend Lead
  - **Estimate:** 4 hours
  - **Acceptance Criteria:**
    - Document model availability (yes/no)
    - Document pricing per generation
    - Document API specifications
    - Identify 2-3 alternative models if unavailable
  - **Deliverables:** `docs/nano-banana-research.md`

- [ ] **TASK-002: Define Fallback Strategy**
  - **Description:** If Nano-banana unavailable, define alternative enhancement strategy
  - **Assignee:** Backend Lead
  - **Estimate:** 4 hours
  - **Dependencies:** TASK-001
  - **Acceptance Criteria:**
    - Document GPT-4 Vision approach
    - Document SDXL fine-tuning approach
    - Cost comparison between alternatives
  - **Deliverables:** `docs/enhancement-fallback-strategy.md`

### Database Schema Updates (3 tasks)

- [ ] **TASK-003: Create Story Type Definition** | _Full Stack Dev_ | 2h
  - Add Story interface to `app/types/generation.ts`
  - **Depends on:** None
  - **Deliverable:** Updated `app/types/generation.ts`

- [ ] **TASK-004: Update Segment Type** | _Full Stack Dev_ | 2h
  - Add keyframe fields to Segment interface
  - **Depends on:** TASK-003
  - **Deliverable:** Updated `app/types/generation.ts`

- [ ] **TASK-005: Update Storyboard Type** | _Full Stack Dev_ | 2h
  - Add story and product image fields to Storyboard
  - **Depends on:** TASK-003, TASK-004
  - **Deliverable:** Updated `app/types/generation.ts`, `server/utils/validation.ts`

### OpenAI MCP - Story Generation (4 tasks)

- [ ] **TASK-006: Add generate_stories Tool to OpenAI MCP** | _Backend Dev_ | 6h
  - Create new MCP tool for generating 3 story options
  - **Depends on:** TASK-003
  - **Deliverable:** Updated `mcp-servers/openai/index.ts`

- [ ] **TASK-007: Create Story Generation System Prompt** | _Backend Dev + Product_ | 4h
  - Design prompt that generates 3 diverse story narratives
  - **Depends on:** TASK-006
  - **Deliverable:** System prompt in `mcp-servers/openai/index.ts`

- [ ] **TASK-008: Create POST /api/generate-stories Endpoint** | _Backend Dev_ | 4h
  - API endpoint that calls OpenAI MCP generate_stories
  - **Depends on:** TASK-006, TASK-007
  - **Deliverable:** `server/api/generate-stories.post.ts`

- [ ] **TASK-009: Add Stories Validation Schema** | _Backend Dev_ | 2h
  - Zod validation for story generation requests
  - **Depends on:** TASK-003
  - **Deliverable:** Updated `server/utils/validation.ts`

### Frontend - Product Images

- [ ] **TASK-010: Create ProductImageUpload Component**
  - **Description:** Build Vue component for uploading 1-10 product images
  - **Assignee:** Frontend Dev
  - **Estimate:** 8 hours
  - **Acceptance Criteria:**
    - Multi-image drag-drop upload
    - Min 1 image, max 10 images validation
    - Image preview grid with thumbnails
    - Remove individual images
    - File type validation (jpg, png, webp)
    - File size validation (max 10MB per image)
    - Display warning if < 3 images
  - **Deliverables:** `app/components/ui/ProductImageUpload.vue`

- [ ] **TASK-011: Update PromptInput to Require Product Images**
  - **Description:** Add ProductImageUpload component to main prompt input
  - **Assignee:** Frontend Dev
  - **Estimate:** 3 hours
  - **Dependencies:** TASK-010
  - **Acceptance Criteria:**
    - ProductImageUpload integrated into PromptInput
    - Form validation requires 1-10 images
    - Images stored in form state
    - Images uploaded with prompt submission
  - **Deliverables:** Updated `app/components/ui/PromptInput.vue`

### Documentation

- [ ] **TASK-012: Update API Documentation**
  - **Description:** Document new endpoints and types
  - **Assignee:** Tech Writer / Dev
  - **Estimate:** 4 hours
  - **Dependencies:** TASK-008, TASK-009
  - **Acceptance Criteria:**
    - Document POST /api/generate-stories
    - Document Story type
    - Document productImages requirement
    - Include request/response examples
  - **Deliverables:** Updated `docs/API.md`

---

## Phase 2: Keyframe Generation (Week 3-4)

**Goal:** Implement two-stage keyframe generation (Nano-banana → Seedream)

### Nano-banana Integration

- [ ] **TASK-013: Add enhance_with_nanobanana Tool to Replicate MCP**
  - **Description:** Create MCP tool for Nano-banana enhancement
  - **Assignee:** Backend Dev
  - **Estimate:** 6 hours
  - **Dependencies:** TASK-001 (research complete)
  - **Acceptance Criteria:**
    - Tool registered in Replicate MCP server
    - Input schema: prompt, referenceImages, aspectRatio
    - Output: enhanced composition text + metadata
    - Handle Replicate API prediction polling
    - Error handling and retries
  - **Deliverables:** Updated `mcp-servers/replicate/index.ts`

- [ ] **TASK-014: Create Nano-banana Prompt Builder**
  - **Description:** Build function that constructs Nano-banana prompts with full context
  - **Assignee:** Backend Dev
  - **Estimate:** 8 hours
  - **Dependencies:** TASK-013
  - **Acceptance Criteria:**
    - Function: buildNanoBananaPrompt(context)
    - Includes: story narrative, segment details, adjacent segments, storyboard context
    - Includes: product images reference, frame type (first/last)
    - For last frames: includes transition requirements
    - Output format matches PRD examples
    - Prompt length optimization (stay under token limits)
  - **Deliverables:** `server/utils/prompt-builders.ts`

- [ ] **TASK-015: Test Nano-banana with Sample Prompts**
  - **Description:** Validate Nano-banana output quality with test cases
  - **Assignee:** Backend Dev + QA
  - **Estimate:** 4 hours
  - **Dependencies:** TASK-014
  - **Acceptance Criteria:**
    - Test with 5 different scenarios (coffee, watch, drink, tech, fashion)
    - Validate output is detailed technical composition
    - Validate output length (should be ~200-300 words)
    - Document quality issues
    - Measure response time and cost
  - **Deliverables:** `tests/nano-banana-samples.md`

### Seedream Integration

- [ ] **TASK-016: Add generate_keyframe Tool to Replicate MCP**
  - **Description:** Create MCP tool for Seedream keyframe generation
  - **Assignee:** Backend Dev
  - **Estimate:** 6 hours
  - **Dependencies:** TASK-013
  - **Acceptance Criteria:**
    - Tool registered in Replicate MCP server
    - Uses bytedance/seedream-4 model
    - Input: enhanced composition, productImages, aspectRatio, frameType
    - Output: keyframe image URL + metadata
    - Handle different aspect ratios (16:9, 9:16, 1:1)
    - Proper resolution mapping (1280x720, 720x1280, 1280x1280)
  - **Deliverables:** Updated `mcp-servers/replicate/index.ts`

- [ ] **TASK-017: Create Seedream Prompt Builder**
  - **Description:** Build function that constructs Seedream prompts
  - **Assignee:** Backend Dev
  - **Estimate:** 4 hours
  - **Dependencies:** TASK-016
  - **Acceptance Criteria:**
    - Function: buildSeedreamPrompt(context)
    - Includes: enhanced composition from Nano-banana
    - Includes: product consistency requirements
    - Includes: technical specs (resolution, format)
    - Includes: quality requirements
    - Output format matches PRD examples
  - **Deliverables:** Updated `server/utils/prompt-builders.ts`

- [ ] **TASK-018: Test Seedream Keyframe Quality**
  - **Description:** Validate Seedream keyframe output quality
  - **Assignee:** Backend Dev + QA + Designer
  - **Estimate:** 6 hours
  - **Dependencies:** TASK-017
  - **Acceptance Criteria:**
    - Test with 10 different Nano-banana outputs
    - Validate image quality and resolution
    - Validate product consistency with reference images
    - Validate photorealistic quality
    - Test all aspect ratios
    - Document any quality issues
  - **Deliverables:** `tests/seedream-quality-report.md`

### Keyframe Generator Utility

- [ ] **TASK-019: Create keyframe-generator.ts Utility**
  - **Description:** Build core keyframe generation logic
  - **Assignee:** Backend Lead
  - **Estimate:** 10 hours
  - **Dependencies:** TASK-015, TASK-018
  - **Acceptance Criteria:**
    - File: `server/utils/keyframe-generator.ts`
    - Function: generateFirstFrame(context)
    - Function: generateLastFrame(context)
    - Function: generateSegmentKeyframes(segment, context)
    - Handles Nano-banana → Seedream pipeline
    - Implements error handling and retries
    - Returns: imageUrl, nanobananaOutput, cost, time
  - **Deliverables:** `server/utils/keyframe-generator.ts`

- [ ] **TASK-020: Implement First Frame Generation**
  - **Description:** Complete generateFirstFrame function
  - **Assignee:** Backend Dev
  - **Estimate:** 6 hours
  - **Dependencies:** TASK-019
  - **Acceptance Criteria:**
    - Calls buildNanoBananaPrompt for first frame
    - Calls enhance_with_nanobanana MCP tool
    - Calls buildSeedreamPrompt
    - Calls generate_keyframe MCP tool
    - Returns complete result with metadata
    - Implements cost tracking
  - **Deliverables:** Implementation in `server/utils/keyframe-generator.ts`

- [ ] **TASK-021: Implement Last Frame Generation**
  - **Description:** Complete generateLastFrame function
  - **Assignee:** Backend Dev
  - **Estimate:** 6 hours
  - **Dependencies:** TASK-020
  - **Acceptance Criteria:**
    - Includes transition context to next segment
    - Handles case when no next segment (CTA last frame)
    - Uses first frame URL as reference
    - Implements all same features as generateFirstFrame
  - **Deliverables:** Implementation in `server/utils/keyframe-generator.ts`

- [ ] **TASK-022: Implement Frame Inheritance Logic**
  - **Description:** Logic for Body segments to inherit first frame from previous last frame
  - **Assignee:** Backend Dev
  - **Estimate:** 4 hours
  - **Dependencies:** TASK-021
  - **Acceptance Criteria:**
    - Function: shouldGenerateFirstFrame(segment, previousSegment)
    - Hook segment: always generates first frame
    - Body/CTA segments: inherit from previous last frame
    - Handle edge cases (missing previous frame)
    - Set firstFrameGenerated flag correctly
  - **Deliverables:** Implementation in `server/utils/keyframe-generator.ts`

### Keyframe Generation API

- [ ] **TASK-023: Create POST /api/generate-keyframes Endpoint**
  - **Description:** API endpoint that orchestrates keyframe generation for all segments
  - **Assignee:** Backend Lead
  - **Estimate:** 10 hours
  - **Dependencies:** TASK-022
  - **Acceptance Criteria:**
    - Endpoint: POST /api/generate-keyframes
    - Input: storyboard, selectedStory, productImages
    - Process segments sequentially (Hook → Body1 → Body2 → CTA)
    - Implement frame inheritance between segments
    - Track total cost and time
    - Error handling per segment (continue on failure)
    - Save keyframe URLs to segments
    - Return complete storyboard with keyframes
  - **Deliverables:** `server/api/generate-keyframes.post.ts`

- [ ] **TASK-024: Add Keyframe Validation Schema**
  - **Description:** Zod schema for keyframe generation requests
  - **Assignee:** Backend Dev
  - **Estimate:** 2 hours
  - **Dependencies:** TASK-023
  - **Acceptance Criteria:**
    - Schema: generateKeyframesSchema
    - Validates storyboard structure
    - Validates productImages array (1-10)
    - Validates selectedStory
  - **Deliverables:** Updated `server/utils/validation.ts`

### Frontend - Keyframe Preview

- [ ] **TASK-025: Create KeyframePreview Component**
  - **Description:** Component to display first/last frame pair for a segment
  - **Assignee:** Frontend Dev
  - **Estimate:** 6 hours
  - **Dependencies:** TASK-004 (Segment type updated)
  - **Acceptance Criteria:**
    - Display first frame and last frame side-by-side
    - Show segment type, description, duration
    - Show transition arrow between frames
    - Display generation status (loading, complete, error)
    - Display cost and time metadata
    - Show "inherited" badge for inherited first frames
  - **Deliverables:** `app/components/generation/KeyframePreview.vue`

- [ ] **TASK-026: Create KeyframeGrid Component**
  - **Description:** Grid view of all segment keyframes
  - **Assignee:** Frontend Dev
  - **Estimate:** 6 hours
  - **Dependencies:** TASK-025
  - **Acceptance Criteria:**
    - Display KeyframePreview for each segment
    - Show segment flow (Hook → Body → CTA)
    - Allow regeneration of individual segment keyframes
    - Display total generation cost and time
    - Responsive grid layout
    - Loading states during generation
  - **Deliverables:** `app/components/generation/KeyframeGrid.vue`

---

## Phase 3: Pipeline Integration (Week 5-6)

**Goal:** Connect all pieces into unified generation flow

### Storyboard API Updates

- [ ] **TASK-027: Update POST /api/plan-storyboard to Accept Story**
  - **Description:** Modify storyboard endpoint to use selected story
  - **Assignee:** Backend Dev
  - **Estimate:** 4 hours
  - **Dependencies:** TASK-008 (generate-stories complete)
  - **Acceptance Criteria:**
    - Add selectedStory to request body
    - Include story narrative in storyboard context
    - Pass story to OpenAI MCP for enhanced prompts
    - Store storyId and storyNarrative in storyboard
    - Validate productImages in request
  - **Deliverables:** Updated `server/api/plan-storyboard.post.ts`

- [ ] **TASK-028: Update Storyboard Validation Schema**
  - **Description:** Update planStoryboardSchema for new fields
  - **Assignee:** Backend Dev
  - **Estimate:** 2 hours
  - **Dependencies:** TASK-027
  - **Acceptance Criteria:**
    - Add selectedStory to schema
    - Add productImages validation (1-10, required)
    - Update response schema to include new fields
  - **Deliverables:** Updated `server/utils/validation.ts`

### Video Generation Updates

- [ ] **TASK-029: Update generate-assets to Use Keyframes**
  - **Description:** Modify video generation to use pre-generated keyframes
  - **Assignee:** Backend Lead
  - **Estimate:** 8 hours
  - **Dependencies:** TASK-023 (keyframes API complete)
  - **Acceptance Criteria:**
    - Read firstFrameUrl and lastFrameUrl from segments
    - Pass to video generation models as constraints
    - Update videoParams for Veo 3.1: image, last_frame
    - Update videoParams for Kling: image_legacy
    - Handle missing keyframes gracefully
    - Remove old frame extraction logic (no longer needed)
  - **Deliverables:** Updated `server/api/generate-assets.post.ts`

- [ ] **TASK-030: Remove Frame Extraction Logic**
  - **Description:** Clean up old extractFramesFromVideo usage
  - **Assignee:** Backend Dev
  - **Estimate:** 3 hours
  - **Dependencies:** TASK-029
  - **Acceptance Criteria:**
    - Remove extractFramesFromVideo calls in generate-assets
    - Remove previousFrameImage logic (now use keyframes)
    - Clean up related imports
    - Update comments
    - Keep extractFramesFromVideo utility (may be useful elsewhere)
  - **Deliverables:** Updated `server/api/generate-assets.post.ts`

### Frontend - Story Selection

- [ ] **TASK-031: Create StorySelector Component**
  - **Description:** Component for displaying and selecting from 3 stories
  - **Assignee:** Frontend Dev
  - **Estimate:** 8 hours
  - **Dependencies:** TASK-003 (Story type)
  - **Acceptance Criteria:**
    - Display 3 story cards in grid or carousel
    - Each card shows: title, narrative, tone, visualStyle, keyMoments
    - Click to select a story (highlight selected)
    - "Continue" button enabled when story selected
    - Responsive design
    - Loading state while stories generate
  - **Deliverables:** `app/components/generation/StorySelector.vue`

- [ ] **TASK-032: Add Story Comparison Highlights**
  - **Description:** Visual indicators showing differences between stories
  - **Assignee:** Frontend Dev
  - **Estimate:** 4 hours
  - **Dependencies:** TASK-031
  - **Acceptance Criteria:**
    - Highlight tone differences
    - Highlight pacing differences (fast vs slow)
    - Show segment count difference
    - Visual differentiation in UI
  - **Deliverables:** Updated `app/components/generation/StorySelector.vue`

### Frontend - Generation Flow

- [ ] **TASK-033: Update generate.vue with New Steps**
  - **Description:** Add story selection and keyframe preview steps to flow
  - **Assignee:** Frontend Lead
  - **Estimate:** 10 hours
  - **Dependencies:** TASK-031, TASK-026
  - **Acceptance Criteria:**
    - Step 1: Prompt + Product Images input (existing, updated)
    - Step 2: Story Selection (NEW - use StorySelector)
    - Step 3: Storyboard Review (existing, show story narrative)
    - Step 4: Keyframe Generation + Preview (NEW - use KeyframeGrid)
    - Step 5: Video Generation (existing, updated)
    - Step 6: Composition + Preview (existing)
    - Progress tracking updated
    - Back navigation works
    - State management for new steps
  - **Deliverables:** Updated `app/pages/generate.vue`

- [ ] **TASK-034: Create useKeyframeGeneration Composable**
  - **Description:** Vue composable for keyframe generation logic
  - **Assignee:** Frontend Dev
  - **Estimate:** 6 hours
  - **Dependencies:** TASK-023 (API endpoint)
  - **Acceptance Criteria:**
    - Function: generateKeyframes(storyboard, story, productImages)
    - Calls POST /api/generate-keyframes
    - Handles loading states
    - Handles errors per segment
    - Returns updated storyboard with keyframes
    - Tracks progress (segment by segment)
  - **Deliverables:** `app/composables/useKeyframeGeneration.ts`

- [ ] **TASK-035: Update useGeneration Composable**
  - **Description:** Update main generation composable for new flow
  - **Assignee:** Frontend Dev
  - **Estimate:** 4 hours
  - **Dependencies:** TASK-034
  - **Acceptance Criteria:**
    - Add story generation step
    - Add keyframe generation step
    - Update storyboard generation to pass story
    - Update video generation to use keyframes
    - Update progress tracking
    - Update error handling
  - **Deliverables:** Updated `app/composables/useGeneration.ts`

### Cost Tracking

- [ ] **TASK-036: Add Cost Tracking for Stories**
  - **Description:** Track costs for story generation
  - **Assignee:** Backend Dev
  - **Estimate:** 2 hours
  - **Dependencies:** TASK-008
  - **Acceptance Criteria:**
    - Call trackCost in generate-stories endpoint
    - Cost type: 'story-generation'
    - Include metadata: story count, model used
  - **Deliverables:** Updated `server/api/generate-stories.post.ts`

- [ ] **TASK-037: Add Cost Tracking for Keyframes**
  - **Description:** Track costs for keyframe generation
  - **Assignee:** Backend Dev
  - **Estimate:** 2 hours
  - **Dependencies:** TASK-023
  - **Acceptance Criteria:**
    - Track Nano-banana costs separately
    - Track Seedream costs separately
    - Cost types: 'nanobanana-enhancement', 'keyframe-generation'
    - Include metadata: segment type, frame type
  - **Deliverables:** Updated `server/api/generate-keyframes.post.ts`

- [ ] **TASK-038: Update Cost Summary Endpoint**
  - **Description:** Include new cost types in summary
  - **Assignee:** Backend Dev
  - **Estimate:** 2 hours
  - **Dependencies:** TASK-036, TASK-037
  - **Acceptance Criteria:**
    - Include story-generation in breakdown
    - Include keyframe costs in breakdown
    - Calculate total cost correctly
    - Update frontend display
  - **Deliverables:** Updated `server/api/cost/summary.get.ts`

---

## Phase 4: Testing & Optimization (Week 7-8)

**Goal:** Ensure quality and performance

### End-to-End Testing

- [ ] **TASK-039: Create E2E Test Suite for New Pipeline**
  - **Description:** Playwright tests for complete flow
  - **Assignee:** QA Engineer
  - **Estimate:** 12 hours
  - **Dependencies:** TASK-033 (flow complete)
  - **Acceptance Criteria:**
    - Test: Upload product images → generate stories → select story
    - Test: Generate storyboard → generate keyframes → preview
    - Test: Generate videos → compose → download
    - Test error scenarios (API failures, invalid inputs)
    - Test with different aspect ratios
    - Test with different product types
    - All tests pass consistently
  - **Deliverables:** `tests/e2e/image-guided-pipeline.spec.ts`

- [ ] **TASK-040: Test with Multiple Product Categories**
  - **Description:** Validate quality across different product types
  - **Assignee:** QA + Product
  - **Estimate:** 16 hours
  - **Dependencies:** TASK-039
  - **Acceptance Criteria:**
    - Test categories: beverages, fashion, tech, food, cosmetics
    - 5 test cases per category (25 total)
    - Evaluate: story quality, keyframe quality, video quality
    - Document quality issues by category
    - Measure success metrics (continuity, consistency)
  - **Deliverables:** `tests/product-category-report.md`

- [ ] **TASK-041: Quality Comparison vs Old Pipeline**
  - **Description:** Blind comparison of new vs old pipeline outputs
  - **Assignee:** QA + Design Lead
  - **Estimate:** 8 hours
  - **Dependencies:** TASK-040
  - **Acceptance Criteria:**
    - Generate 20 videos with both pipelines (same prompts)
    - Blind review by 5 reviewers
    - Rate: continuity, quality, professionalism
    - Statistical analysis of results
    - Target: 40%+ improvement in continuity score
  - **Deliverables:** `tests/pipeline-comparison-report.md`

### Performance Optimization

- [ ] **TASK-042: Implement Parallel Keyframe Generation**
  - **Description:** Generate non-dependent keyframes in parallel
  - **Assignee:** Backend Dev
  - **Estimate:** 6 hours
  - **Dependencies:** TASK-023
  - **Acceptance Criteria:**
    - Generate Hook first frame in parallel with other init tasks
    - Generate last frames where possible (not dependent on previous)
    - Measure time savings (target: 20-30% reduction)
    - Ensure correctness (order dependencies maintained)
  - **Deliverables:** Updated `server/api/generate-keyframes.post.ts`

- [ ] **TASK-043: Implement Nano-banana Output Caching**
  - **Description:** Cache Nano-banana outputs for similar prompts
  - **Assignee:** Backend Dev
  - **Estimate:** 8 hours
  - **Dependencies:** TASK-042
  - **Acceptance Criteria:**
    - Use Redis or in-memory cache
    - Cache key: hash of prompt + context
    - TTL: 24 hours
    - Cache hit rate monitoring
    - Target: 10-20% cache hit rate (cost savings)
  - **Deliverables:** `server/utils/cache.ts`, updated keyframe-generator

- [ ] **TASK-044: Optimize Prompt Token Usage**
  - **Description:** Reduce prompt sizes to stay under token limits
  - **Assignee:** Backend Dev
  - **Estimate:** 4 hours
  - **Dependencies:** TASK-043
  - **Acceptance Criteria:**
    - Measure current prompt sizes
    - Remove redundant information
    - Compress formatting while maintaining clarity
    - Test quality doesn't degrade
    - Target: 20% reduction in prompt tokens
  - **Deliverables:** Updated `server/utils/prompt-builders.ts`

- [ ] **TASK-045: Implement Request Batching**
  - **Description:** Batch multiple API requests where possible
  - **Assignee:** Backend Dev
  - **Estimate:** 6 hours
  - **Dependencies:** TASK-044
  - **Acceptance Criteria:**
    - Batch multiple Seedream generations if API supports
    - Reduce number of round trips
    - Measure latency improvement
  - **Deliverables:** Updated `mcp-servers/replicate/index.ts`

### Error Handling

- [ ] **TASK-046: Implement Segment-Level Error Recovery**
  - **Description:** Continue generation even if one segment fails
  - **Assignee:** Backend Dev
  - **Estimate:** 4 hours
  - **Dependencies:** TASK-023
  - **Acceptance Criteria:**
    - Mark failed segments clearly
    - Allow continuing with remaining segments
    - Option to retry failed segment
    - Don't fail entire job for one segment
  - **Deliverables:** Updated `server/api/generate-keyframes.post.ts`

- [ ] **TASK-047: Add Retry Logic for Model Failures**
  - **Description:** Automatic retry with exponential backoff
  - **Assignee:** Backend Dev
  - **Estimate:** 4 hours
  - **Dependencies:** TASK-046
  - **Acceptance Criteria:**
    - Retry up to 3 times on transient failures
    - Exponential backoff (1s, 2s, 4s)
    - Different retry strategies for different error types
    - Log retry attempts
  - **Deliverables:** Updated `server/utils/keyframe-generator.ts`

### Monitoring & Analytics

- [ ] **TASK-048: Add Analytics Events**
  - **Description:** Track user interactions with new features
  - **Assignee:** Full Stack Dev
  - **Estimate:** 4 hours
  - **Dependencies:** TASK-033
  - **Acceptance Criteria:**
    - Event: story_selected (with story index)
    - Event: keyframe_generated (per segment)
    - Event: keyframe_regenerated
    - Event: keyframe_approved (user continues)
    - Event: pipeline_completed
    - Track time spent on each step
  - **Deliverables:** Analytics integration in relevant components

---

## Phase 5: Launch (Week 9)

**Goal:** Ship to production

### Beta Testing

- [ ] **TASK-049: Recruit Beta Testers**
  - **Description:** Identify and onboard 10-15 beta users
  - **Assignee:** Product Manager
  - **Estimate:** 4 hours
  - **Acceptance Criteria:**
    - Mix of user types (new, existing, power users)
    - Different product categories represented
    - Clear beta program guidelines
    - NDA if needed
  - **Deliverables:** Beta tester list + guidelines doc

- [ ] **TASK-050: Deploy to Beta Environment**
  - **Description:** Deploy new pipeline to staging/beta
  - **Assignee:** DevOps + Backend Lead
  - **Estimate:** 6 hours
  - **Dependencies:** TASK-048 (all testing complete)
  - **Acceptance Criteria:**
    - Deploy to beta.adubun.com (or staging)
    - Feature flag: enable for beta users only
    - Monitoring and alerting set up
    - Cost tracking enabled
    - Rollback plan documented
  - **Deliverables:** Beta deployment + runbook

- [ ] **TASK-051: Gather Beta Feedback**
  - **Description:** Collect structured feedback from beta users
  - **Assignee:** Product Manager + QA
  - **Estimate:** 40 hours (1 week with users)
  - **Dependencies:** TASK-050
  - **Acceptance Criteria:**
    - Each user completes 5+ generations
    - Survey after each generation
    - Feedback form: quality, ease of use, value, suggestions
    - Track metrics: story selection distribution, regeneration rate
    - At least 50 total generations from beta
  - **Deliverables:** `beta-feedback-report.md`

- [ ] **TASK-052: Address Critical Beta Issues**
  - **Description:** Fix critical bugs found in beta
  - **Assignee:** Full Team
  - **Estimate:** Variable (TBD based on issues)
  - **Dependencies:** TASK-051
  - **Acceptance Criteria:**
    - All P0 bugs fixed
    - All P1 bugs fixed or documented for post-launch
    - Re-test fixed issues
    - Update affected documentation
  - **Deliverables:** Bug fixes + updated tests

### Documentation

- [ ] **TASK-053: Create User Guide**
  - **Description:** End-user documentation for new features
  - **Assignee:** Tech Writer + Product
  - **Estimate:** 8 hours
  - **Dependencies:** TASK-051
  - **Acceptance Criteria:**
    - Guide: "Getting Started with Image-Guided Generation"
    - Section: How to prepare product images
    - Section: Selecting the right story
    - Section: Understanding keyframe preview
    - Include screenshots and examples
    - Video walkthrough (5 min)
  - **Deliverables:** `docs/user-guide.md` + video

- [ ] **TASK-054: Update API Documentation**
  - **Description:** Complete API docs for all new endpoints
  - **Assignee:** Backend Lead
  - **Estimate:** 4 hours
  - **Dependencies:** TASK-048
  - **Acceptance Criteria:**
    - Document all new endpoints
    - Include request/response examples
    - Document error codes
    - Document rate limits
    - API versioning if needed
  - **Deliverables:** Updated `docs/API.md`

### Launch

- [ ] **TASK-055: Production Deployment**
  - **Description:** Deploy to production with feature flag
  - **Assignee:** DevOps + Backend Lead
  - **Estimate:** 4 hours
  - **Dependencies:** TASK-052 (beta issues resolved)
  - **Acceptance Criteria:**
    - Deploy to production
    - Feature flag: gradual rollout (10% → 25% → 50% → 100%)
    - Monitoring dashboards updated
    - Alerting configured
    - Rollback tested and ready
    - On-call rotation scheduled
  - **Deliverables:** Production deployment + runbook

- [ ] **TASK-056: Launch Announcement**
  - **Description:** Announce new feature to users
  - **Assignee:** Product + Marketing
  - **Estimate:** 4 hours
  - **Dependencies:** TASK-055
  - **Acceptance Criteria:**
    - Email announcement to all users
    - Blog post explaining benefits
    - In-app notification/banner
    - Social media posts
    - Update landing page
  - **Deliverables:** Marketing materials + announcements

---

## Post-Launch Monitoring (Ongoing)

### Week 1 Post-Launch

- [ ] **TASK-057: Monitor Success Metrics**
  - **Description:** Track KPIs daily for first week
  - **Assignee:** Product + Data
  - **Estimate:** 2 hours/day × 7 days
  - **Dependencies:** TASK-055
  - **Metrics to Track:**
    - Adoption rate (% using new pipeline)
    - Story selection distribution
    - Keyframe regeneration rate
    - Video quality ratings
    - User satisfaction scores
    - Cost per generation
    - Generation success rate
    - P50, P95 generation time
  - **Deliverables:** Daily metric reports

- [ ] **TASK-058: Collect User Feedback**
  - **Description:** Gather feedback from production users
  - **Assignee:** Product + Support
  - **Estimate:** Ongoing
  - **Dependencies:** TASK-055
  - **Acceptance Criteria:**
    - Post-generation survey (optional)
    - Support ticket monitoring
    - Social media monitoring
    - Community forum feedback
    - Compile weekly feedback summary
  - **Deliverables:** Weekly feedback reports

---

## Task Summary by Role

### Backend Lead
- TASK-001, TASK-002, TASK-019, TASK-023, TASK-029, TASK-050, TASK-054, TASK-055

### Backend Dev
- TASK-006, TASK-007, TASK-008, TASK-009, TASK-013, TASK-014, TASK-015, TASK-016, TASK-017, TASK-018, TASK-020, TASK-021, TASK-022, TASK-024, TASK-027, TASK-028, TASK-030, TASK-036, TASK-037, TASK-038, TASK-042, TASK-043, TASK-044, TASK-045, TASK-046, TASK-047

### Frontend Lead
- TASK-033

### Frontend Dev
- TASK-010, TASK-011, TASK-025, TASK-026, TASK-031, TASK-032, TASK-034, TASK-035

### Full Stack Dev
- TASK-003, TASK-004, TASK-005, TASK-048

### QA Engineer
- TASK-039, TASK-040, TASK-041, TASK-051

### Product Manager
- TASK-007, TASK-049, TASK-051, TASK-056, TASK-057, TASK-058

### Tech Writer
- TASK-012, TASK-053

### Designer
- TASK-018, TASK-041

### DevOps
- TASK-050, TASK-055

---

## Dependencies Graph

```
Phase 1 Foundation
├─ TASK-001 (Research) → TASK-002 (Fallback)
├─ TASK-003 (Story Type) → TASK-004 → TASK-005
├─ TASK-006 → TASK-007 → TASK-008 → TASK-009
└─ TASK-010 → TASK-011

Phase 2 Keyframe Generation
├─ TASK-013 → TASK-014 → TASK-015
├─ TASK-016 → TASK-017 → TASK-018
├─ TASK-019 → TASK-020 → TASK-021 → TASK-022
├─ TASK-023 → TASK-024
└─ TASK-025 → TASK-026

Phase 3 Pipeline Integration
├─ TASK-027 → TASK-028
├─ TASK-029 → TASK-030
├─ TASK-031 → TASK-032
└─ TASK-033 → TASK-034 → TASK-035

Phase 4 Testing
├─ TASK-039 → TASK-040 → TASK-041
└─ TASK-042 → TASK-043 → TASK-044 → TASK-045

Phase 5 Launch
└─ TASK-049 → TASK-050 → TASK-051 → TASK-052 → TASK-055 → TASK-056
```

---

## Tracking

**Recommended Tools:**
- Project Management: Linear, Jira, or GitHub Projects
- Task IDs: Use TASK-XXX format for easy reference
- Sprint Planning: 2-week sprints aligned with phases
- Daily Standups: Focus on blockers and dependencies
- Weekly Reviews: Track progress against phase goals

**Success Criteria:**
- All P0 tasks complete before launch
- All P1 tasks complete or documented
- Success metrics meet targets (defined in PRD)
- Beta feedback incorporated
- Zero critical bugs in production

---

## Notes

1. **Estimates are approximate** - adjust based on team velocity
2. **Dependencies are critical** - don't start dependent tasks early
3. **Testing is parallel** - can start testing completed features while others develop
4. **Documentation is continuous** - update as you build
5. **Feature flag** - use for gradual rollout and easy rollback
6. **Cost monitoring** - watch closely in beta and early production
7. **User feedback** - prioritize and act quickly on critical issues



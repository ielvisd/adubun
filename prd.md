# AI Video Ad Generation Platform — Product Requirements Document (PRD)
## 1. Overview
### 1.1 Vision
Enable anyone, even someone who has never created an ad before, to generate a high-quality video ad for their physical product from a single prompt:
> “Make me an ad for AlaniNu energy drink.”
The platform turns a simple text prompt (plus optional product images) into a publication-ready, video ad with:
- A clear 4-part structure: **Hook → Body 1 → Body 2 → CTA**
- Consistent visual style across all scenes
- Auto-generated background music that matches the mood
- Optional AI-generated voiceover script & music. 


## 2. Goals & Non-Goals
### 2.1 Goals
1. **End-to-end ad generation**  
   - Input: one natural language prompt + product images (up to 10) + video dimension (16:9, 9:16, 1:1, etc). Product images are example images of the product. The user is suggested to provide product images at multiple angles of the product.
   - Output: single vertical MP4 video ad
2. **Beginner-friendly UX**
   - One text box for input
   - Three story options generated automatically
   - Simple selection + generate flow
3. **Visual & narrative coherence**
   - All scenes share consistent style, product look, and environment
   - Story makes sense from Hook to CTA
4. **Multi-model flexibility**
   - User can select among supported video models:
     - Veo 3
     - Runway Gen-3
     - Kling
     - others as we integrate them
5. **High quality over speed/cost**
   - Priority order: **Quality > Speed > Cost**
   - It’s acceptable if the generation takes up to 5–8 minutes per ad.
---
## 3. Target Users & Use Cases
### 3.1 User Group 1
**Solo entrepreneur / small business owner / beginner creator**
- Has a physical product (drink, snack, cosmetic, gadget, etc.)
- Has never made a video ad before
- Wants something that “just works” from one prompt
Example:
> “Make me a high-energy TikTok ad for my new berry-flavored AlaniNu energy drink targeting college students who study late.”
### 3.2 User Group 2
- UGC creators looking to quickly concept ads
- Agencies needing quick first drafts
- DTC Shopify sellers optimizing creative
---
## 4. Core User Flows
### 4.1 Happy Path: Create an Ad From a Prompt
1. **Landing → Auth**
   - User visits the app
   - Signs up/logs in (simple email/password or OAuth)
2. **Prompt Input**
   - Single input box:
     - “Describe the ad you want”
   - Optional but Recommended:
     - Upload up to 10 product reference images
     - Toggle “Generate voiceover script” (off by default)
   - User selects:
     - Preferred video model (Veo 3 / Runway Gen-3 / Kling / etc.)
3. **Story generation**
System generates **3 story options** each a paragraph long representing the story of the ad. For generating this story, the system should be aware that the story will eventually be split up into a hook, a body, another body, and a call to action (cta).
User Selects:
One of the three stories to create a storyboard.
4. **Storyboard Generation**
   - System generates **3 storyboard options**, each with:
     - Scene 1 (Hook): a paragraph description of the hook and the contents of it of the story selected earlier + first frame image + last frame image + the selected story from Story generation
     - Scene 2 (Body 1): a paragraph description of body 1 and the contents of it of the story selected earlier + first frame image + last frame image + context regarding the Hook scene and a detailed description of what is happening leading up to the last frame image of Hook
     - Scene 3 (Body 2): a paragraph description of body 1 and the contents of it of the story selected earlier + first frame image + last frame image + context regarding the Body 1 scene and a detailed description of what is happening leading up to the last frame of Body 1
     - Scene 4 (CTA): a paragraph description of body 1 and the contents of it of the story selected earlier + first frame image + last frame image + context regarding the Body2 scene and a detailed description of what is happening leading up to the last frame of Body2
Note: For each scene, generate the paragraph description first. We will need the paragraph description to generate the first frame and last frame images.
   - User can:
     - Edit the text of each scene
     - Proceed without editing if satisfied
5. **First Frame Image and Last Frame Image**
   - For the selected storyboard:
     - Generate the **first frame** and the **last frame** for the hook using the hook’s paragraph description + all product images.
- The first frame of body 1 is identical to the last frame of the hook. Generate the last frame of body 1 using body1’s paragraph description + the first frame of the body 1 + all product images.
- The first frame of body 2 is identical to the last frame of body 1. Generate the last frame of body 2 using body2’s paragraph description + the first frame of body 2 + all product images.
- The first frame of the cta is identical to the last frame of body 2. Generate the last frame of the CTA using body2’s paragraph description + the first frame of cta + all product images.

In total the system will generate 5 frame images.
   - Enforce visual consistency using:
     - Contextual summary of the previous scene
     - A shared global “style prompt”
     - Frame-to-frame conditioning where supported
     - Same product depiction across frames
     - Run the image through Nano-banana then seedream-4
6. **Scene Video Generation**
   - For each scene (Hook, Body1, Body2, CTA):
     - Generate a video clip with the selected model.
     - Use:
       - The scene’s first and last frame images
       - The scene description/text
       - The selected story
       - The previous scene’s description.
7. **Audio & Voiceover Script**
   - Background music:
     - Auto-generated or selected to match the overall mood
   - Voiceover script (optional):
     - If toggle enabled:
       - Generate a script matching the storyboard text
       - Script displayed to user alongside final video
       - TTS/recording
8. **Video Stitching & Export**
   - Stitch 4 clips into a video using FFmpeg:
     - Overlay background music
   - Export as:
     - MP4, 1080×1920, 30 FPS minimum
9. **Result Screen**
   - Show:
     - Final video player
     - Download button
     - Storyboard summary
     - Voiceover script (if generated)
   - User can:
     - Download the video
     - Start a new ad
---
## 5. Functional Requirements
### 5.1 Account & Authentication
- Users can:
  - Sign up with email/password (Firebase)
  - Log in / log out
  - Manage their own ads only (single-user, no orgs)
### 5.2 Ad Creation
**FR-AD-1: Prompt Input**
- User can provide:
  - One text prompt (required)
  - 0–10 product images (optional). If the user provides less than 10 product images, then generate product images using the existing uploaded images until 10 total (ideally from angles not already provided).
  - Voiceover toggle (boolean)
  - Video model selection (Veo 3, Runway Gen-3, Kling, or others we add)
**FR-AD-2: Storyboard Generation**
- System must:
  - Parse the user prompt (openai chatgpt ->4.5 mini)
  - Generate 3 stories for users to select
  - The selected story:
    - Has 4 scenes:
      - Scene type (Hook/Body1/Body2/CTA)
      - 1 paragraph description per scene
  - Use product images as context when generating storyboards if provided
**FR-AD-3: Storyboard Editing**
- User can:
  - Edit the text of each scene (inline text boxes)
  - Upload a custom first frame and last frame for each scene (after ai generates) to use instead of the ai generated one
  - Change the length of the scene via a dropdown (this will be based on the model)
**FR-AD-4: First and Last Frame Image Generation**
- For the chosen storyboard:
  - Generate a first frame and last frame image per scene. Note: a total of 5 frame images will be produced since many scenes will share first and last frame images. E.g. Hook’s last frame and Body1’s first frame are shared.
  - If product images provided:
    - Use them as style and identity anchors
  - Persist generated images with metadata linking them to:
    - Advertisement
    - Storyboard
    - Scene type
**FR-AD-5: Video Model Selection**
- User can modify their model:
  - Veo 3, Runway Gen-3, Kling, or others we add
	Note: This will cause the storyboard dropdown values to change since different models have different video durations. Ensure functionality stays correct.
- System must:
  - Route generation requests to the correct provider
  - Abstract differences via a common adapter interface
**FR-AD-6: Scene Video Generation**
- For each of the 4 scenes:
  - Generate a video of correct length
    - 30+ FPS
  - Use:
    - Selected video model
    - Scene text + global style
    - Scene first and last frame images
**FR-AD-7: Background Music Generation**
- System generates 1 music track per advertisement:
  - Mood inferred from prompt and storyboard
  - Length: same as total video length after stitching
- Track is applied during final stitching.
**FR-AD-8: Voiceover Script (Optional)**
- If toggled on:
  - Generate a voiceover script that:
    - Matches the storyboard content
    - Fits the timing
  - Script is saved and shown in the final result page.
**FR-AD-9: Video Stitching**
- After all 4 scene videos and music are ready:
  - Use FFmpeg to:
    - Concatenate clips
    - Apply simple transitions (cut or crossfade)
    - Merge background music with normalized volume
  - Output a single MP4 file.
**FR-AD-10: Result & Storage**
- Store:
  - Links to all scene images and scene videos
  - Final video URL
  - Storyboard text
  - Voiceover script (if any)
- UI:
  - Video player
  - Download button
  - Summary of storyboard and script
### 5.3 History (Minimal)
- User can:
  - View a list of previous ads (title, created_at, status)
  - Click into any ad to view its final video and metadata
---
## 6. Non-Functional Requirements
### 6.1 Performance
- Target end-to-end generation:
  - 16-second ad in **≤ 6 minutes** for typical model choices
- Backend endpoints that kick off generation should respond within:
  - < 3 seconds (after job enqueued)
- Synchronous UX:
  - UI shows progress stages:
    - “Generating storyboards”
    - “Generating images”
    - “Generating scene videos”
    - “Stitching final video”
### 6.2 Reliability
- 90%+ generation success rate:
  - Each external generation call retried up to 3 times on transient errors
- If a specific scene fails repeatedly:
  - Show user a clear error and allow “regenerate scene” in the same flow (if feasible within MVP scope) or “retry whole ad”
### 6.3 Scalability
- MVP:
  - Vercel + simple background processing (e.g., serverless functions + a minimal job queue)
- Architected to support future:
  - Pub/Sub or queue-based event-driven pipeline
  - Horizontal scaling per service (storyboard, image gen, video gen, stitching)
### 6.4 Security & Privacy
- Users can only access their own ads.
- All media stored in private buckets with presigned URLs for access.
- Prompt and generation logs stored securely for product improvement.
### 6.5 Cost Targets
- Goal: **<$4–$7 per final ad** for reasonable lengths and quality.
- Tactics:
  - Use cheaper intermediary models where possible for previews (post-MVP)
  - Reuse product hero images across scenes
  - Minimize redundant calls
---
## 7. System Architecture (Conceptual)
### 7.1 High-Level Components
- **Web App (Next.js on Vercel)**
  - Prompt input form
  - Storyboard selection/editing UI
  - Progress status and final result view
- **API Gateway / Backend (Vercel serverless or standalone backend)**
  - Auth endpoints
  - Ad creation endpoint
  - Generation orchestration
  - Model provider adapters
- **Storyboard Service**
  - Takes prompt + product context
  - Generates 3 candidate storyboards
  - Persists storyboard data
- **Brand / Product Context (MVP-lite)**
  - For MVP, minimal:
    - Product name
    - Short description
    - Optional images
- **Image Generation Service**
  - Adapts to image models / APIs
  - Generates consistent scene images
- **Video Generation Service**
  - Integrates with:
    - Veo 3
    - Runway Gen-3
    - Kling
    - Others via adapter layer
  - Supports frame-to-frame conditioning
- **Background Music Generation Service**
  - Simple text/mood to music service or external provider integration
- **Video Stitching Service**
  - FFmpeg-based worker to merge clips and audio
- **Storage**
  - Object storage (S3 or equivalent) for:
    - Images
    - Scene videos
    - Final videos
- **Logging & Analytics**
  - Database tables for:
    - Prompts
    - Model calls
    - Cost & latency metrics
---
## 8. Data Model (High-Level)
See `erd.md` for the detailed ERD; key entities:
- `User`
- `Advertisement`
- `Storyboard`
- `Scene`
- `ProductImage`
- `SceneImage`
- `SceneVideo`
- `GenerationLog`
Each object links back to `Advertisement` and `User` where appropriate.
---
## 9. Hard Problems & Approach
### 9.1 Visual Consistency Across Scenes
- Use:
  - Shared global style prompt (color palette, mood, environment)
  - Product hero image reused across generations
  - Frame-to-frame conditioning where supported:
    - Feed last frame from Scene N into generation of Scene N+1
### 9.2 Good “Hero” Product Image
- Strategy:
  - If user provides product images, pick the best (centered, well-lit)
  - If not, generate several hero images and pick the best via:
    - Simple heuristics (brightness, contrast, product size)
  - Use this hero image as reference for all scenes
### 9.3 Timing & Script Fit
- Voiceover script must fit ~16 seconds:
  - Keep lines short and conversational
  - Heuristic word count per scene (e.g., 3–7 seconds of speech)
---
## 10. Success Metrics
### 10.1 Product Metrics
- % of attempts that successfully generate a final video: **≥ 90%**
- % of users who download their video: **≥ 70%**
- % of users who create >1 ad: **≥ 30%**
### 10.2 Experience Metrics
- Average time from “Generate” to final video: **≤ 6 minutes**
- Reported satisfaction (internal or small survey) with quality: **≥ 4/5**
### 10.3 Technical Metrics
- Error rate of external generation calls: **< 5%** after retries
- Average cost per complete ad within target range
---
## 11. Out of Scope (Explicit)
- Multi-org accounts and roles
- Full brand kit management
- Version control and diffing of generated videos
- Multi-aspect ratio and channel-specific exports
- Web scraping or automatic product image search
- Async notification system (email/webhook) — post-MVP
- Full offline editing experience
---
## 12. Roadmap (High Level)
### Phase 1 — MVP (Current)
- Single-user ad creation
- Prompt → 3 storyboards → single storyboard selection
- Images + videos generated with model choice
- Background music
- Optional voiceover script
- Synchronous UX with progress stages
### Phase 2 — Post-MVP Enhancements
- Async generation + notifications
- Simple versioning and scene-level regeneration
- Asset lifecycle management (auto-delete after 6 months)
- Basic brand kit (logo + primary color)
- Web-based product image uploading flows (Dropbox/Drive)
### Phase 3 — Scaling & Pro Features
- Multi-tenant organizations and teams
- A/B testing & batch generation
- Advanced analytics (CTR predictions, creative scoring)
- Rich timeline editor and advanced motion graphics
---
This PRD captures the current MVP scope and the constraints you defined (Vercel, model choice, quality-first, synchronous generation, no web scraping, etc.).






























Pipeline:

Story: Cohesive description of the entire ad
Story generation: User prompt (text field) + Product images + video dimension dropdown menu

Q: How to get a product image?
A: User input (min: 1, max: 10). If not enough, we can search on web and choose or ai generated product images (ideally different angles)

Q: How to get the story?
A: User prompt + custom prompt (product name, target audience, mood, keyMessages, visualStyle, callToAction) if user doesn’t specify in user prompt -> OpenAT ChatGPT -> JSON. This JSON file + another custom prompt (create a story prompt) -> OpenAI ChatGPT -> Generates 3 stories

—----------------------------------------------------------------------------------------------------------------------------

Storyboard: Story broken down into Hook + Body1 + Body2 + CTA
Hook: A paragraph description of the scene + first frame image + last frame image
Body1: A paragraph description of the scene + first frame image + last frame image
Body2: A paragraph description of the scene + first frame image + last frame image
CTA: A paragraph description of the scene + first frame image + last frame image

Q: How to get paragraph description?
A: The story -> OpenAI ChatGPT -> paragraph description

Q: How to get the hook’s first frame image?
A: Hook paragraph + story + storyboard system prompt + product images + Nano-banana image enhancement prompt -> Nano-banana -> output from Nano-banana (image) + seedream image enhancement prompt -> seedream -> hook first frame image

Q: How to get the hook’s last frame image?
A: Hook paragraph + Body1 paragraph + story + storyboard system prompt + product images + hook first frame image + Nano-banana image enhancement prompt -> Nano-banana -> output from Nano-banana (image) + seedream image enhancement prompt -> seedream -> hook last frame image

Q: How to get Body1 first frame image?
A: Same as Hook last frame image

Q: How to get Body1 last frame image?
A: Body1 paragraph + Body2 paragraph + story + storyboard system prompt + product images + body1 first frame image + Nano-banana image enhancement prompt -> Nano-banana -> output from Nano-banana (image) + seedream image enhancement prompt -> seedream -> body1 last frame image

Q: How to get Body2 first frame image?
A: Same as Body1 last frame image

Q: How to get Body2 last frame image?
A: Body2 paragraph + CTA paragraph + story + storyboard system prompt + product images + body2 first frame image + Nano-banana image enhancement prompt -> Nano-banana -> output from Nano-banana (image) + seedream image enhancement prompt -> seedream -> body2 last frame image

Q: How to get the CTA first frame image?
A: Same as Body2 last frame image

Q: How to get a CTA last frame image?
A: CTA paragraph + story + storyboard system prompt + product images + CTA first frame image + Nano-banana image enhancement prompt -> Nano-banana -> output from Nano-banana (image) + seedream image enhancement prompt -> seedream -> CTA last frame image

—----------------------------------------------------------------------------------------------------------------------------

Video Editor Studio
4 separate videos (Hook + Body1 + Body2 + CTA)

Stitch the videos together in chronological order + Video editing features TBD

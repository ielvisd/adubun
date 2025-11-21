# Deploying AdUbun to Railway

This guide covers how to deploy the AdUbun application to [Railway](https://railway.app/).

## Prerequisites

1. A [GitHub](https://github.com/) account with the AdUbun repository pushed.
2. A [Railway](https://railway.app/) account.

## Deployment Steps

### 1. Project Setup

1. Go to your [Railway Dashboard](https://railway.app/dashboard).
2. Click **"New Project"** > **"Deploy from GitHub repo"**.
3. Select your **AdUbun** repository.
4. Click **"Deploy Now"**.

### 2. Configure Environment Variables

Once the project is created, go to the **"Variables"** tab in your Railway service and add the following keys (copy values from your local `.env`):

| Variable | Description |
|----------|-------------|
| `NUXT_UI_PRO_LICENSE` | Your Nuxt UI Pro license key (if applicable) |
| `REPLICATE_API_KEY` | API Key for Replicate AI models |
| `OPENAI_API_KEY` | API Key for OpenAI |
| `ELEVENLABS_API_KEY` | API Key for ElevenLabs voice generation |
| `AWS_ACCESS_KEY_ID` | AWS Access Key for S3 |
| `AWS_SECRET_ACCESS_KEY` | AWS Secret Key for S3 |
| `AWS_REGION` | AWS Region (e.g., `us-east-1`) |
| `AWS_S3_BUCKET_NAME` | Name of your S3 bucket |
| `AWS_S3_PUBLIC_ACCESS` | Base URL for public access (optional) |
| `APP_URL` | Your Railway app URL (e.g., `https://your-project.up.railway.app`) |
| `FIREBASE_API_KEY` | Firebase Config |
| `FIREBASE_AUTH_DOMAIN` | Firebase Config |
| `FIREBASE_PROJECT_ID` | Firebase Config |
| `FIREBASE_STORAGE_BUCKET` | Firebase Config |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase Config |
| `FIREBASE_APP_ID` | Firebase Config |

### 3. Configure Persistent Storage (CRITICAL)

Because AdUbun saves generated videos and job history to local JSON files, you **MUST** add a persistent volume. Without this, all your data will be lost every time you redeploy.

1. Go to your Service settings in Railway.
2. Scroll down to **"Storage"** or **"Volumes"**.
3. Click **"Add Volume"**.
4. Set the **Mount Path** to: `/app/data`
5. Click **"Add"**.

Railway will redeploy your application to attach the volume.

### 4. Verification

1. Wait for the deployment to finish (green checkmark).
2. Click the provided public URL (e.g., `https://web-production-xxxx.up.railway.app`).
3. Navigate to **"Generate"** and try creating a simple video.
4. If successful, the video generation process is working correctly with FFmpeg on the server.

## Troubleshooting

- **Build Failed**: Check the "Build Logs". Ensure `ffmpeg` installation in the Dockerfile didn't fail.
- **App Crashes**: Check "Deploy Logs". Ensure all required Environment Variables are set.
- **Data Disappearing**: Confirm the Volume is mounted correctly at `/app/data`.


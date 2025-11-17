# S3 Folder Structure

## Overview

All generated assets are now organized in S3 with a clear folder structure for better management and organization.

## Folder Structure

```
{AWS_S3_BUCKET_NAME}/
├── product_images/          # User-uploaded product images
│   ├── {timestamp}-{id}.jpg
│   ├── {timestamp}-{id}.png
│   └── ...
├── scene_images/            # AI-generated keyframe/scene images
│   ├── {timestamp}-{id}.jpg
│   └── ...
└── ai_videos/               # AI-generated video segments
    ├── segment-0-{id}.mp4
    ├── segment-1-{id}.mp4
    └── ...
```

## Implementation

### 1. Product Images (User Uploads)
**Folder:** `product_images/`  
**Source:** User uploads via `/api/upload-images-s3`  
**Format:** `.jpg`, `.png`, `.jpeg`, `.webp`

```typescript
// server/api/upload-images-s3.post.ts
const s3Url = await uploadFileToS3(tempPath, 'product_images')
```

### 2. Scene Images (AI-Generated Keyframes)
**Folder:** `scene_images/`  
**Source:** Replicate Seedream-4 keyframe generation  
**Format:** `.jpg`, `.png`

**Note:** Currently, keyframe images stay on Replicate CDN for performance. To upload to S3:

```typescript
import { downloadAndUploadImageToS3 } from '~/server/utils/s3-asset-helper'

// Download from Replicate and upload to S3
const s3Url = await downloadAndUploadImageToS3(replicateImageUrl, 'scene_images')
```

### 3. AI Videos (Generated Segments)
**Folder:** `ai_videos/`  
**Source:** Replicate video generation (Veo, Kling, etc.)  
**Format:** `.mp4`

```typescript
// server/api/generate-assets.post.ts (lines 590-608)
// Videos are automatically downloaded from Replicate and uploaded to S3
const finalVideoUrl = await saveVideo(videoBuffer, `segment-${idx}-${nanoid()}.mp4`, 'ai_videos')
```

## Helper Functions

### Upload to S3 with Folder

```typescript
import { uploadFileToS3 } from '~/server/utils/s3-upload'

// Upload to specific folder
const url = await uploadFileToS3(localFilePath, 'product_images')
const url2 = await uploadFileToS3(localFilePath, 'scene_images')
const url3 = await uploadFileToS3(localFilePath, 'ai_videos')
```

### Download from URL and Upload to S3

```typescript
import { downloadAndUploadImageToS3, downloadAndUploadVideoToS3 } from '~/server/utils/s3-asset-helper'

// For images
const s3ImageUrl = await downloadAndUploadImageToS3(externalUrl, 'scene_images')

// For videos
const s3VideoUrl = await downloadAndUploadVideoToS3(externalUrl, 'ai_videos')
```

### Batch Upload Multiple Images

```typescript
import { batchDownloadAndUploadImagesToS3 } from '~/server/utils/s3-asset-helper'

const imageUrls = ['https://replicate.../image1.jpg', 'https://replicate.../image2.jpg']
const s3Urls = await batchDownloadAndUploadImagesToS3(imageUrls, 'scene_images')
```

## Benefits

### Organized Storage
- Easy to find and manage assets by type
- Clear separation between user content and AI-generated content
- Better for analytics and cost tracking

### Cost Management
- Track storage costs by asset type
- Implement different retention policies per folder
- Easy to set up S3 lifecycle rules

### Access Control
- Set different permissions per folder
- Separate public/private access if needed
- Better security isolation

## S3 Folder Creation

**Note:** S3 doesn't have "folders" in the traditional sense. When you upload a file with a key like `product_images/file.jpg`, S3 automatically creates the folder structure in the UI.

Folders are created automatically when the first file is uploaded with that prefix.

## Lifecycle Rules (Optional)

You can set up S3 lifecycle rules for cost optimization:

```json
{
  "Rules": [
    {
      "Id": "Delete old product images after 90 days",
      "Prefix": "product_images/",
      "Status": "Enabled",
      "Expiration": {
        "Days": 90
      }
    },
    {
      "Id": "Move old AI videos to Glacier after 30 days",
      "Prefix": "ai_videos/",
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "GLACIER"
        }
      ]
    }
  ]
}
```

## Verification

To verify your S3 folder structure:

```bash
# Run the diagnostic script
npx tsx scripts/check-s3-assets.ts
```

This will show:
- Total assets per folder
- File types breakdown
- Recent uploads
- Storage usage

## Migration from Old Structure

If you have existing assets in the old `assets/` folder:

1. They will continue to work (backwards compatible)
2. New uploads will use the new folder structure
3. Old assets can be migrated using AWS CLI:

```bash
# Copy assets from old to new structure
aws s3 cp s3://bucket/assets/ s3://bucket/product_images/ --recursive --exclude "*" --include "*.jpg"
```

## Environment Variables

No additional configuration needed! The same environment variables apply:

```bash
AWS_REGION=us-east-2
AWS_S3_BUCKET_NAME=your-bucket-name
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

## Troubleshooting

### Assets not appearing in folders

Check logs for upload errors:
```bash
# Server logs will show:
[S3 Upload] File uploaded to S3: product_images/ (presigned URL, valid for 7 days)
```

### Permission errors

Ensure your IAM user/role has permissions for:
- `s3:PutObject` - Upload files
- `s3:GetObject` - Download files  
- `s3:ListBucket` - List folder contents

### Fallback behavior

If S3 upload fails, the system automatically falls back to:
1. Replicate CDN URL (for videos/images from Replicate)
2. Local file path (for composed videos)

Check logs for warnings:
```
[Storage] Failed to upload video to S3: {error}
[Storage] Falling back to local file path
```


# AWS S3 Setup Guide

This guide explains how to set up AWS S3 for hosting image files that need to be accessible by Replicate's API.

## Prerequisites

- AWS Account
- AWS CLI installed (optional, but helpful)
- S3 bucket created

## Step 1: Create an S3 Bucket

1. Log in to the AWS Console
2. Navigate to S3 service
3. Click "Create bucket"
4. Configure the bucket:
   - **Bucket name**: Choose a unique name (e.g., `adubun-assets`)
   - **Region**: Choose a region close to your users (e.g., `us-east-1`)
   - **Block Public Access**: 
     - If you want public URLs: Uncheck "Block all public access" and acknowledge
     - If you want private URLs: Keep it checked (we'll use presigned URLs)
   - **Bucket Versioning**: Optional
   - **Default encryption**: Recommended (SSE-S3 or SSE-KMS)
5. Click "Create bucket"

## Step 2: Configure Bucket Permissions (for Public Access)

If you want public URLs (simpler, but less secure):

1. Go to your bucket → **Permissions** tab
2. Under **Bucket policy**, add this policy (replace `YOUR_BUCKET_NAME`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    }
  ]
}
```

3. Under **Block public access**, click "Edit" and uncheck all options (if you want public access)

## Step 3: Create IAM User and Access Keys

1. Navigate to IAM service in AWS Console
2. Click "Users" → "Create user"
3. Enter a username (e.g., `adubun-s3-uploader`)
4. Click "Next"
5. Under "Set permissions", choose "Attach policies directly"
6. Click "Create policy" and use this JSON (replace `YOUR_BUCKET_NAME`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME"
    }
  ]
}
```

7. Name the policy (e.g., `AdubunS3UploadPolicy`) and create it
8. Go back to user creation, refresh, and attach the policy you just created
9. Click "Next" → "Create user"
10. Click on the user → "Security credentials" tab
11. Click "Create access key"
12. Choose "Application running outside AWS"
13. Click "Create access key"
14. **IMPORTANT**: Copy both the Access Key ID and Secret Access Key (you won't see the secret again)

## Step 4: Configure Environment Variables

Add these to your `.env` file:

```bash
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your-bucket-name
AWS_S3_PUBLIC_ACCESS=true  # Set to 'true' for public URLs, 'false' for presigned URLs
```

## Step 5: Test the Setup

1. Start your development server: `pnpm dev`
2. Upload an image through the application
3. Check the console logs - you should see S3 upload messages
4. The image URL should be an S3 URL (either public or presigned)

## Troubleshooting

### Error: "AWS credentials not configured"
- Make sure all AWS environment variables are set in your `.env` file
- Restart your development server after adding environment variables

### Error: "Access Denied"
- Check that your IAM user has the correct permissions
- Verify the bucket name is correct
- If using public access, ensure bucket policy is set correctly

### Error: "Bucket does not exist"
- Verify the bucket name in `AWS_S3_BUCKET_NAME` matches exactly
- Check that the bucket is in the region specified in `AWS_REGION`

### Presigned URLs expire
- Presigned URLs are valid for 1 hour by default
- If you need longer-lived URLs, consider using public bucket access
- Or modify the `expiresIn` parameter in `server/utils/s3-upload.ts`

## Security Best Practices

1. **Never commit credentials to git** - Use `.env` file and add it to `.gitignore`
2. **Use IAM roles in production** - Instead of access keys, use IAM roles when deploying to AWS
3. **Limit permissions** - Only grant the minimum permissions needed (PutObject, GetObject)
4. **Use private buckets with presigned URLs** - More secure than public buckets
5. **Enable bucket versioning** - Helps with recovery if files are accidentally deleted
6. **Enable encryption** - Use SSE-S3 or SSE-KMS for encryption at rest

## Cost Considerations

- **Storage**: ~$0.023 per GB/month
- **PUT requests**: ~$0.005 per 1,000 requests
- **GET requests**: ~$0.0004 per 1,000 requests
- **Data transfer out**: First 1 GB/month free, then ~$0.09 per GB

For typical usage (hundreds of images per month), costs should be minimal (< $1/month).


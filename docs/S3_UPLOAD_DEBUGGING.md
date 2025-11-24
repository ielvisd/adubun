# S3 Upload Debugging Guide

## Issue
Getting 500 errors when uploading images via `/api/upload-images-s3` in production.

## Changes Made
Enhanced error logging in both the API endpoint and S3 utility to provide detailed diagnostics.

### Files Modified
1. `server/api/upload-images-s3.post.ts` - Added comprehensive logging
2. `server/utils/s3-upload.ts` - Added detailed S3 operation logging

## How to Debug in Production

### Step 1: Check Railway Logs
Look for these log patterns in Railway:

#### AWS Credentials Check
```
[Upload Images S3] AWS credentials present: {
  hasKeyId: true/false,
  hasSecret: true/false,
  bucket: "bucket-name",
  region: "us-east-1"
}
```

#### S3 Client Initialization
```
[S3 Client] Initializing S3 client with: {
  region: "us-east-1",
  hasAccessKeyId: true/false,
  hasSecretAccessKey: true/false,
  accessKeyIdLength: XX
}
```

#### File Upload Process
```
[Upload Images S3] Received X files to upload
[Upload Images S3] Processing file 1/X: filename.jpg (XXXXX bytes)
[Upload Images S3] Saving temp file with extension: jpg
[Upload Images S3] Temp file saved: /path/to/temp/file
[Upload Images S3] Uploading to S3 bucket: bucket-name/product_images/
[S3 Upload] Reading file from disk: /path/to/file
[S3 Upload] File read successfully: XXXXX bytes
[S3 Upload] Generated S3 key: product_images/timestamp-id.jpg
[S3 Upload] Sending PutObject command to S3...
[S3 Upload] ✓ File uploaded to S3: bucket-name/product_images/
```

### Step 2: Common Error Patterns

#### Missing AWS Credentials
```
[Upload Images S3] Missing AWS credentials: {
  hasKeyId: false,
  hasSecret: false,
  hasBucket: false,
  region: "us-east-1"
}
```
**Solution**: Set environment variables in Railway:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_BUCKET_NAME`
- `AWS_REGION` (optional, defaults to `us-east-1`)

#### Invalid Credentials
```
[S3 Upload] ✗ Failed to upload file: {
  errorName: "InvalidAccessKeyId",
  errorMessage: "The AWS Access Key Id you provided does not exist in our records.",
  errorCode: "InvalidAccessKeyId"
}
```
**Solution**: Verify AWS credentials are correct

#### Bucket Permissions Issue
```
[S3 Upload] ✗ Failed to upload file: {
  errorName: "AccessDenied",
  errorMessage: "Access Denied",
  errorCode: "AccessDenied",
  statusCode: 403
}
```
**Solution**: Ensure IAM user has these S3 permissions:
- `s3:PutObject`
- `s3:GetObject`

#### Bucket Does Not Exist
```
[S3 Upload] ✗ Failed to upload file: {
  errorName: "NoSuchBucket",
  errorMessage: "The specified bucket does not exist",
  errorCode: "NoSuchBucket",
  statusCode: 404
}
```
**Solution**: Create S3 bucket or verify `AWS_S3_BUCKET_NAME` is correct

#### Filesystem Issues
```
[Upload Images S3] Failed to process file filename.jpg: {
  error: "ENOENT: no such file or directory",
  stack: "..."
}
```
**Solution**: Check if `data/assets/` directory exists and has write permissions

### Step 3: Verify Environment Variables in Railway

1. Go to Railway project settings
2. Navigate to "Variables" tab
3. Verify these are set:
   ```
   AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
   AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   AWS_S3_BUCKET_NAME=your-bucket-name
   AWS_REGION=us-east-1
   ```

### Step 4: Test AWS Credentials Locally

You can use the AWS CLI to verify credentials work:

```bash
# Set environment variables
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
export AWS_REGION="us-east-1"

# Test bucket access
aws s3 ls s3://your-bucket-name/

# Test upload
echo "test" > test.txt
aws s3 cp test.txt s3://your-bucket-name/test.txt
```

## Required IAM Policy

Your AWS IAM user needs this policy attached:

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
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name"
    }
  ]
}
```

## Success Pattern

When everything works, you'll see:

```
[Upload Images S3] Starting upload process...
[Upload Images S3] AWS credentials present: { hasKeyId: true, hasSecret: true, bucket: "your-bucket", region: "us-east-1" }
[Upload Images S3] Received 1 files to upload
[Upload Images S3] Processing file 1/1: product.jpg (123456 bytes)
[S3 Client] Successfully initialized S3 client
[S3 Upload] Starting upload for file: /path/to/temp/file to folder: product_images
[S3 Upload] Target bucket: your-bucket
[S3 Upload] Reading file from disk: /path/to/temp/file
[S3 Upload] File read successfully: 123456 bytes
[S3 Upload] Generated S3 key: product_images/1234567890-abc123.jpg
[S3 Upload] Sending PutObject command to S3...
[S3 Upload] PutObject response: { $metadata: { httpStatusCode: 200 }, ETag: "..." }
[S3 Upload] ✓ File uploaded to S3: your-bucket/product_images/
[S3 Upload] ✓ Presigned URL generated: https://your-bucket.s3.amazonaws.com/product_images/...
[Upload Images S3] Upload complete: 1 files uploaded
```

## Next Steps

1. Deploy these changes to Railway
2. Try uploading an image
3. Check Railway logs immediately
4. Look for the error patterns above
5. Apply the appropriate solution

The enhanced logging will now tell you exactly where the upload process is failing.




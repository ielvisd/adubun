# S3 CORS Configuration for Browser Image Loading

## Problem

When loading images from S3 in the browser (e.g., in the storyboard editor), you may encounter CORS errors:

```
Access to image at 'https://your-bucket.s3.amazonaws.com/...' from origin 'http://localhost:3000' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

This happens because S3 buckets don't allow cross-origin requests by default.

## Solution: Configure CORS on Your S3 Bucket

### Step 1: Go to AWS S3 Console

1. Navigate to [AWS S3 Console](https://s3.console.aws.amazon.com/)
2. Click on your bucket name (e.g., `parent-onboarding-insurance-cards-tony`)
3. Go to the **Permissions** tab
4. Scroll down to **Cross-origin resource sharing (CORS)**
5. Click **Edit**

### Step 2: Add CORS Configuration

Paste this CORS configuration:

```json
[
  {
    "AllowedHeaders": [
      "*"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD"
    ],
    "AllowedOrigins": [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://your-production-domain.com"
    ],
    "ExposeHeaders": [
      "ETag",
      "Content-Length",
      "Content-Type"
    ],
    "MaxAgeSeconds": 3000
  }
]
```

**Important**: Replace `https://your-production-domain.com` with your actual production domain!

### Step 3: For Development (Allow All Origins)

If you want to allow CORS from **all origins** during development (less secure, but convenient):

```json
[
  {
    "AllowedHeaders": [
      "*"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD"
    ],
    "AllowedOrigins": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag",
      "Content-Length",
      "Content-Type"
    ],
    "MaxAgeSeconds": 3000
  }
]
```

### Step 4: Save Changes

1. Click **Save changes**
2. Refresh your application
3. Images should now load without CORS errors!

## What Each Setting Does

- **AllowedHeaders**: `["*"]` - Allows all request headers
- **AllowedMethods**: `["GET", "HEAD"]` - Allows reading files (GET) and checking metadata (HEAD)
- **AllowedOrigins**: The domains that can access your S3 files
  - `http://localhost:3000` - Your local development server
  - `https://your-domain.com` - Your production domain
  - `"*"` - All domains (not recommended for production)
- **ExposeHeaders**: Headers that the browser can access
- **MaxAgeSeconds**: How long the browser caches CORS preflight results (3000 = 50 minutes)

## Security Best Practices

### For Production:
```json
{
  "AllowedOrigins": [
    "https://your-production-domain.com",
    "https://www.your-production-domain.com"
  ]
}
```

### For Development + Production:
```json
{
  "AllowedOrigins": [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://your-production-domain.com",
    "https://www.your-production-domain.com"
  ]
}
```

## Verify It Works

1. Open your browser's Developer Console (F12)
2. Go to the storyboard page
3. Load images
4. You should see images load without CORS errors in the Console

## Troubleshooting

### Still Getting CORS Errors?

1. **Clear Browser Cache**: Hard refresh with `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
2. **Check Origin**: Make sure your origin is in the `AllowedOrigins` list
3. **Check HTTP vs HTTPS**: If your app uses `https://localhost`, add that to `AllowedOrigins`
4. **Verify Configuration Saved**: Go back to S3 console and confirm the CORS rules are there

### Images Load But Still Show Errors?

If using presigned URLs, they already work! The CORS error might be from browser trying to check image metadata. Add `HEAD` method:

```json
{
  "AllowedMethods": ["GET", "HEAD"]
}
```

### Need to Allow Image Downloads?

If you want users to download images, add:

```json
{
  "AllowedMethods": ["GET", "HEAD"],
  "ExposeHeaders": [
    "Content-Disposition",
    "Content-Length"
  ]
}
```

## Alternative: Use CloudFront (Advanced)

For better performance and security, consider using CloudFront:

1. Create a CloudFront distribution for your S3 bucket
2. Configure CloudFront to handle CORS headers
3. Use CloudFront URLs instead of direct S3 URLs

Benefits:
- Faster image loading (CDN caching)
- Better CORS handling
- HTTPS by default
- No S3 CORS configuration needed

---

## Quick Reference

**AWS S3 Console**: `https://s3.console.aws.amazon.com/`  
**Path**: Bucket → Permissions → Cross-origin resource sharing (CORS)  
**Format**: JSON array of CORS rules  
**Restart Required**: No, changes are immediate


# S3 Bucket Policy Setup for Public Access

Since your bucket doesn't allow ACLs, we need to use a bucket policy to make objects publicly readable.

## Quick Setup

### Option 1: Use Presigned URLs (Recommended - More Secure)

If you want to keep your bucket private, just set this in your `.env`:

```bash
AWS_S3_PUBLIC_ACCESS=false
```

This will generate presigned URLs that are valid for 7 days. No bucket policy needed!

### Option 2: Make Bucket Public via Bucket Policy

If you want public URLs, follow these steps:

1. **Go to AWS S3 Console**
   - Navigate to your bucket: `ai-ad-gen`
   - Click on the "Permissions" tab

2. **Edit Bucket Policy**
   - Scroll down to "Bucket policy"
   - Click "Edit"
   - Paste this policy (replace `ai-ad-gen` with your bucket name if different):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::ai-ad-gen/*"
    }
  ]
}
```

3. **Save the policy**

4. **Configure Block Public Access** (if needed)
   - Still in the Permissions tab
   - Scroll to "Block public access (bucket settings)"
   - Click "Edit"
   - Uncheck "Block all public access" (or at least uncheck "Block public access to buckets and objects granted through new access control lists (ACLs)")
   - Click "Save changes"
   - Type "confirm" to confirm

5. **Update your .env**
   ```bash
   AWS_S3_PUBLIC_ACCESS=true
   ```

## Verify It Works

After setting up the bucket policy, test it:

```bash
# Upload a test file
aws s3 cp test.txt s3://ai-ad-gen/test.txt

# Try to access it publicly (replace with your actual URL)
curl https://ai-ad-gen.s3.us-east-1.amazonaws.com/test.txt
```

If you get the file content, it's working!

## Troubleshooting

### "Access Denied" when accessing public URL
- Check that the bucket policy is saved correctly
- Verify Block Public Access settings allow public access
- Make sure the bucket name in the policy matches exactly

### Still getting ACL errors
- The code has been updated to not use ACLs
- Make sure you've restarted your development server after the code change


# How to Find Your AWS Credentials and Bucket Name

## Finding Your AWS Access Key ID and Secret Access Key

### Option 1: If You Already Have an IAM User

1. **Log in to AWS Console**
   - Go to https://console.aws.amazon.com
   - Sign in with your AWS account

2. **Navigate to IAM**
   - In the search bar at the top, type "IAM" and click on it
   - Or go to: https://console.aws.amazon.com/iam/

3. **Go to Users**
   - Click on "Users" in the left sidebar
   - Find your user (or the user you want to use for S3 access)

4. **View Security Credentials**
   - Click on the username
   - Click on the "Security credentials" tab
   - Scroll down to "Access keys"

5. **View or Create Access Key**
   - If you see existing access keys, you can see the Access Key ID
   - **Note**: Secret Access Keys are only shown once when created
   - If you don't have a key or lost the secret, click "Create access key"
   - Choose "Application running outside AWS"
   - Click "Create access key"
   - **IMPORTANT**: Copy both the Access Key ID and Secret Access Key immediately
   - The secret key won't be shown again!

### Option 2: Create a New IAM User (Recommended)

If you don't have an IAM user yet, create one:

1. **Go to IAM → Users**
   - Click "Create user"
   - Enter a username (e.g., `adubun-s3-uploader`)
   - Click "Next"

2. **Set Permissions**
   - Choose "Attach policies directly"
   - Click "Create policy"
   - Switch to the "JSON" tab
   - Paste this policy (replace `YOUR_BUCKET_NAME` with your actual bucket name):

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

   - Click "Next", name it (e.g., `AdubunS3Policy`), and create it
   - Go back to user creation, refresh, and attach the policy
   - Click "Next" → "Create user"

3. **Create Access Key**
   - Click on the newly created user
   - Go to "Security credentials" tab
   - Click "Create access key"
   - Choose "Application running outside AWS"
   - Click "Create access key"
   - **Copy both keys immediately!**

## Finding Your S3 Bucket Name

1. **Navigate to S3**
   - In AWS Console search bar, type "S3" and click on it
   - Or go to: https://s3.console.aws.amazon.com/

2. **View Your Buckets**
   - You'll see a list of all your S3 buckets
   - The bucket name is displayed in the "Bucket name" column

3. **If You Don't Have a Bucket Yet**
   - Click "Create bucket"
   - Enter a unique bucket name (e.g., `adubun-assets-2024`)
   - Choose a region (e.g., `us-east-1`)
   - For public access:
     - Uncheck "Block all public access" if you want public URLs
     - Or keep it checked if you want to use presigned URLs
   - Click "Create bucket"

## Finding Your AWS Region

1. **Look at the top-right corner** of the AWS Console
   - You'll see your current region (e.g., "US East (N. Virginia) us-east-1")
   - The region code (like `us-east-1`) is what you need

2. **Or check your S3 bucket**
   - Click on your bucket
   - The region is shown in the bucket properties

## Quick Checklist

Once you have everything, add these to your `.env` file:

```bash
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE          # Your Access Key ID
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY  # Your Secret Access Key
AWS_REGION=us-east-1                            # Your region code
AWS_S3_BUCKET_NAME=adubun-assets-2024          # Your bucket name
AWS_S3_PUBLIC_ACCESS=true                       # 'true' for public URLs, 'false' for presigned
```

## Security Reminder

⚠️ **Never commit your `.env` file to git!**
- Make sure `.env` is in your `.gitignore`
- Never share your secret access key publicly
- If a key is compromised, delete it immediately and create a new one


#!/bin/bash

# Script to help find AWS credentials and bucket information

echo "=== AWS Configuration Helper ==="
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed"
    echo "   Install it with: brew install awscli (macOS) or pip install awscli"
    echo ""
else
    echo "✅ AWS CLI is installed"
    echo ""
    
    # Check if credentials are configured
    echo "Checking AWS credentials..."
    if aws configure list 2>/dev/null | grep -q "access_key"; then
        echo "✅ AWS credentials are configured"
        echo ""
        echo "Your AWS Access Key ID:"
        aws configure get aws_access_key_id 2>/dev/null || echo "  (not found in config)"
        echo ""
        echo "Your AWS Region:"
        aws configure get region 2>/dev/null || echo "  (not found, default: us-east-1)"
        echo ""
        echo "⚠️  Note: Secret Access Key is not shown for security reasons"
        echo "   You can find it in: ~/.aws/credentials (but it's encrypted)"
        echo ""
    else
        echo "❌ AWS credentials are not configured"
        echo "   Run: aws configure"
        echo ""
    fi
    
    # List S3 buckets
    echo "Checking S3 buckets..."
    if aws s3 ls 2>/dev/null; then
        echo ""
        echo "✅ Found buckets above"
        echo "   Use one of these bucket names for AWS_S3_BUCKET_NAME"
    else
        echo "❌ Could not list buckets (check credentials or permissions)"
        echo ""
    fi
fi

echo ""
echo "=== Manual Steps ==="
echo "1. Go to AWS Console: https://console.aws.amazon.com"
echo "2. IAM → Users → [Your User] → Security credentials → Access keys"
echo "3. S3 → Buckets (to see your bucket names)"
echo ""
echo "See docs/FIND_AWS_CREDENTIALS.md for detailed instructions"


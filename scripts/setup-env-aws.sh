#!/bin/bash

# Script to help set up AWS credentials in .env file

echo "=== AWS Environment Setup Helper ==="
echo ""

# Get AWS credentials
ACCESS_KEY=$(aws configure get aws_access_key_id 2>/dev/null)
REGION=$(aws configure get region 2>/dev/null || echo "us-east-1")

if [ -z "$ACCESS_KEY" ]; then
    echo "❌ AWS credentials not found. Please configure AWS CLI first:"
    echo "   aws configure"
    exit 1
fi

echo "✅ Found AWS Access Key ID: $ACCESS_KEY"
echo "✅ Found AWS Region: $REGION"
echo ""

# Get secret key (read from credentials file)
SECRET_KEY=$(grep -A 2 "\[default\]" ~/.aws/credentials 2>/dev/null | grep "aws_secret_access_key" | cut -d'=' -f2 | tr -d ' ')

if [ -z "$SECRET_KEY" ]; then
    echo "⚠️  Could not automatically read secret key"
    echo "   You'll need to add it manually to .env"
    echo "   Find it in: ~/.aws/credentials"
    SECRET_KEY="YOUR_SECRET_ACCESS_KEY_HERE"
fi

# List buckets
echo "Your S3 Buckets:"
aws s3 ls 2>/dev/null | head -10
echo ""

# Ask for bucket name
echo "Which bucket would you like to use? (or press Enter to create a new one)"
read -p "Bucket name: " BUCKET_NAME

if [ -z "$BUCKET_NAME" ]; then
    BUCKET_NAME="adubun-assets-$(date +%Y%m%d)"
    echo "Creating new bucket: $BUCKET_NAME"
    aws s3 mb "s3://$BUCKET_NAME" --region "$REGION" 2>/dev/null
    if [ $? -eq 0 ]; then
        echo "✅ Bucket created successfully"
    else
        echo "❌ Failed to create bucket. You may need to create it manually in AWS Console"
        exit 1
    fi
fi

# Ask about public access
echo ""
echo "Do you want public URLs? (y/n)"
read -p "Public access [y]: " PUBLIC_ACCESS
PUBLIC_ACCESS=${PUBLIC_ACCESS:-y}

if [ "$PUBLIC_ACCESS" = "y" ] || [ "$PUBLIC_ACCESS" = "Y" ]; then
    PUBLIC_ACCESS_VALUE="true"
else
    PUBLIC_ACCESS_VALUE="false"
fi

# Create/update .env file
ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env file..."
    touch "$ENV_FILE"
fi

# Add or update AWS config
echo ""
echo "Adding AWS configuration to .env file..."

# Remove old AWS config if exists
sed -i.bak '/^AWS_/d' "$ENV_FILE" 2>/dev/null || sed -i '' '/^AWS_/d' "$ENV_FILE" 2>/dev/null

# Add new config
cat >> "$ENV_FILE" << EOF

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=$ACCESS_KEY
AWS_SECRET_ACCESS_KEY=$SECRET_KEY
AWS_REGION=$REGION
AWS_S3_BUCKET_NAME=$BUCKET_NAME
AWS_S3_PUBLIC_ACCESS=$PUBLIC_ACCESS_VALUE
EOF

echo ""
echo "✅ AWS configuration added to .env file!"
echo ""
echo "Your configuration:"
echo "  Access Key ID: $ACCESS_KEY"
echo "  Secret Key: ${SECRET_KEY:0:10}... (hidden)"
echo "  Region: $REGION"
echo "  Bucket: $BUCKET_NAME"
echo "  Public Access: $PUBLIC_ACCESS_VALUE"
echo ""
echo "⚠️  If the secret key shows 'YOUR_SECRET_ACCESS_KEY_HERE',"
echo "   please edit .env and add your actual secret key from ~/.aws/credentials"


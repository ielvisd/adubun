#!/usr/bin/env tsx
/**
 * S3 Assets Diagnostic Script
 * 
 * Checks:
 * 1. S3 configuration
 * 2. What assets are in S3 bucket
 * 3. What assets are stored locally
 */

import { S3Client, ListObjectsV2Command, HeadBucketCommand } from '@aws-sdk/client-s3'
import { promises as fs } from 'fs'
import path from 'path'
import { config } from 'dotenv'

// Load environment variables
config()

const region = process.env.AWS_REGION || 'us-east-1'
const bucketName = process.env.AWS_S3_BUCKET_NAME
const accessKeyId = process.env.AWS_ACCESS_KEY_ID
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

console.log('🔍 S3 Assets Diagnostic\n')
console.log('=' .repeat(60))

// 1. Check environment variables
console.log('\n📋 1. Environment Configuration')
console.log('-'.repeat(60))
console.log(`AWS_REGION: ${region ? '✅ Set' : '❌ Missing'}`)
console.log(`AWS_S3_BUCKET_NAME: ${bucketName ? '✅ Set' : '❌ Missing'}`)
console.log(`AWS_ACCESS_KEY_ID: ${accessKeyId ? '✅ Set' : '❌ Missing'}`)
console.log(`AWS_SECRET_ACCESS_KEY: ${secretAccessKey ? '✅ Set' : '❌ Missing'}`)

if (!bucketName || !accessKeyId || !secretAccessKey) {
  console.error('\n❌ Missing required AWS credentials')
  process.exit(1)
}

console.log(`\nBucket: ${bucketName}`)
console.log(`Region: ${region}`)

// 2. Test S3 connection
console.log('\n🔌 2. Testing S3 Connection')
console.log('-'.repeat(60))

const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
})

try {
  const headCommand = new HeadBucketCommand({ Bucket: bucketName })
  await s3Client.send(headCommand)
  console.log('✅ Successfully connected to S3 bucket')
} catch (error: any) {
  console.error('❌ Failed to connect to S3 bucket:', error.message)
  process.exit(1)
}

// 3. List assets in S3 by folder
console.log('\n📦 3. Assets in S3 Bucket (by folder)')
console.log('-'.repeat(60))

const folders = ['product_images', 'scene_images', 'ai_videos', 'assets']

for (const folder of folders) {
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: `${folder}/`,
    })
    
    const response = await s3Client.send(listCommand)
    const objects = response.Contents || []
    
    if (objects.length > 0) {
      const totalSize = objects.reduce((sum, obj) => sum + (obj.Size || 0), 0)
      const sizeMB = (totalSize / 1024 / 1024).toFixed(2)
      
      console.log(`\n${folder}/ : ${objects.length} files (${sizeMB} MB)`)
      
      // Show most recent 3 files
      const recent = objects
        .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0))
        .slice(0, 3)
      
      recent.forEach(obj => {
        const size = ((obj.Size || 0) / 1024).toFixed(2)
        const date = obj.LastModified?.toLocaleString() || 'unknown'
        const filename = path.basename(obj.Key || '')
        console.log(`  📄 ${filename} (${size} KB) - ${date}`)
      })
    } else {
      console.log(`\n${folder}/ : Empty`)
    }
  } catch (error: any) {
    console.error(`❌ Failed to list ${folder}/:`, error.message)
  }
}

// 4. Check local storage
console.log('\n💾 4. Local Storage')
console.log('-'.repeat(60))

const localDirs = [
  './data/videos',
  './data/assets',
  './data/jobs',
]

for (const dir of localDirs) {
  try {
    const files = await fs.readdir(dir)
    console.log(`${dir}: ${files.length} files`)
    
    if (files.length > 0 && files.length <= 5) {
      files.forEach(f => console.log(`  - ${f}`))
    } else if (files.length > 5) {
      console.log(`  Recent: ${files.slice(0, 5).join(', ')}, ...`)
    }
  } catch (error: any) {
    console.log(`${dir}: ⚠️  Not found or empty`)
  }
}

// 5. Recommendations
console.log('\n💡 5. Folder Structure Analysis')
console.log('-'.repeat(60))

const productCount = (await s3Client.send(new ListObjectsV2Command({
  Bucket: bucketName,
  Prefix: 'product_images/',
}))).Contents?.length || 0

const sceneCount = (await s3Client.send(new ListObjectsV2Command({
  Bucket: bucketName,
  Prefix: 'scene_images/',
}))).Contents?.length || 0

const videoCount = (await s3Client.send(new ListObjectsV2Command({
  Bucket: bucketName,
  Prefix: 'ai_videos/',
}))).Contents?.length || 0

console.log(`Product images (user uploads): ${productCount}`)
console.log(`Scene images (AI keyframes): ${sceneCount}`)
console.log(`AI videos (generated segments): ${videoCount}`)

if (productCount > 0) {
  console.log('\n✅ User uploads are working (product_images/)')
}

if (videoCount > 0) {
  console.log('✅ Video uploads to S3 are working (ai_videos/)')
} else {
  console.log('\n⚠️  No videos in ai_videos/ yet')
  console.log('   This is normal if no videos have been generated')
  console.log('   Videos will be automatically downloaded from Replicate')
  console.log('   and uploaded to S3 when generation completes')
}

if (sceneCount === 0) {
  console.log('\n💡 Scene images currently stay on Replicate CDN')
  console.log('   To upload to S3, use: downloadAndUploadImageToS3()')
}

console.log('\n' + '='.repeat(60))
console.log('✅ Diagnostic complete')


const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

async function testR2Upload() {
  try {
    console.log('🧪 Testing R2 upload functionality...');
    
    // Check if R2 is configured
    const isConfigured = !!(process.env.R2_ENDPOINT && 
                           process.env.R2_ACCESS_KEY_ID && 
                           process.env.R2_SECRET_ACCESS_KEY && 
                           process.env.R2_BUCKET_NAME);
    
    if (!isConfigured) {
      console.log('❌ R2 not configured - missing environment variables');
      return;
    }
    
    console.log('✅ R2 environment variables found');
    console.log(`📦 Bucket: ${process.env.R2_BUCKET_NAME}`);
    console.log(`🌐 Endpoint: ${process.env.R2_ENDPOINT}`);
    
    // Initialize S3 client
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
    
    // Create a test file
    const testContent = 'This is a test file to verify R2 upload functionality';
    const testKey = 'media-uploads/test-upload.txt';
    
    console.log(`📤 Uploading test file to: ${testKey}`);
    
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: testKey,
      Body: testContent,
      ContentType: 'text/plain',
      ACL: 'public-read',
      CacheControl: 'public, max-age=31536000'
    });
    
    await s3Client.send(command);
    
    console.log('✅ Test upload successful!');
    console.log(`🔗 Public URL: ${process.env.R2_PUBLIC_URL}/${testKey}`);
    
    // Test if we can create the media-uploads directory structure
    const directoryTestKey = 'media-uploads/.gitkeep';
    const directoryCommand = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: directoryTestKey,
      Body: '# This file ensures the media-uploads directory exists',
      ContentType: 'text/plain',
      ACL: 'public-read'
    });
    
    await s3Client.send(directoryCommand);
    console.log('✅ Created media-uploads directory structure');
    
  } catch (error) {
    console.error('❌ R2 upload test failed:', error.message);
    console.error('Full error:', error);
  }
}

testR2Upload();

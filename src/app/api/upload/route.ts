import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';

// POST /api/upload - Upload image only (no OCR)
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Check file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are supported' }, { status: 400 });
    }
    
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 });
    }
    
    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Upload to permanent storage
    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });
    
    const fileName = `images/${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`;
    const key = await storage.uploadFile({
      fileContent: buffer,
      fileName: fileName,
      contentType: file.type,
    });
    
    // Generate permanent URL for display (valid for 1 year)
    const imageUrl = await storage.generatePresignedUrl({
      key,
      expireTime: 31536000,
    });
    
    return NextResponse.json({
      url: imageUrl,
      key: key,
      fileName: file.name,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: '图片上传失败' }, { status: 500 });
  }
}

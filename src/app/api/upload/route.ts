import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

// POST /api/upload - Upload image for OCR
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
    
    // Upload to temporary storage
    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });
    
    const fileName = `temp_ocr/${Date.now()}_${file.name}`;
    const key = await storage.uploadFile({
      fileContent: buffer,
      fileName: fileName,
      contentType: file.type,
    });
    
    // Generate temporary URL for OCR (valid for 5 minutes)
    const imageUrl = await storage.generatePresignedUrl({
      key,
      expireTime: 300,
    });
    
    // Use vision model to extract text
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);
    
    const messages = [
      {
        role: 'user' as const,
        content: [
          { 
            type: 'text' as const, 
            text: '请识别这张图片中的所有文字内容。如果是聊天截图，请按对话顺序整理出来，标注说话人和内容。只输出识别到的文字，不要添加任何解释。' 
          },
          {
            type: 'image_url' as const,
            image_url: {
              url: imageUrl,
              detail: 'high' as const,
            },
          },
        ],
      },
    ];
    
    const response = await client.invoke(messages, {
      model: 'doubao-seed-1-6-vision-250815',
      temperature: 0.3,
    });
    
    // Delete the temporary file after OCR
    await storage.deleteFile({ fileKey: key });
    
    return NextResponse.json({
      text: response.content,
      inputType: 'image',
    });
  } catch (error) {
    console.error('Upload/OCR error:', error);
    return NextResponse.json({ error: '图片识别失败，请重试' }, { status: 500 });
  }
}

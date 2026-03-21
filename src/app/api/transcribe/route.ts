import { NextRequest, NextResponse } from 'next/server';
import { ASRClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { S3Storage } from 'coze-coding-dev-sdk';

// POST /api/transcribe - Transcribe audio to text
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }
    
    // Check file type
    const supportedTypes = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/webm'];
    if (!supportedTypes.some(type => file.type.includes(type.split('/')[1]))) {
      return NextResponse.json({ error: 'Unsupported audio format. Please use MP3, WAV, OGG, M4A, or WebM' }, { status: 400 });
    }
    
    // Check file size (max 100MB)
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio file must be less than 100MB' }, { status: 400 });
    }
    
    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Upload to temporary storage for ASR
    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });
    
    const fileName = `temp_audio/${Date.now()}_${file.name}`;
    const key = await storage.uploadFile({
      fileContent: buffer,
      fileName: fileName,
      contentType: file.type,
    });
    
    // Generate temporary URL for ASR (valid for 5 minutes)
    const audioUrl = await storage.generatePresignedUrl({
      key,
      expireTime: 300,
    });
    
    // Use ASR to transcribe
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new ASRClient(config, customHeaders);
    
    const result = await client.recognize({
      uid: 'user',
      url: audioUrl,
    });
    
    // Delete the temporary file after transcription
    await storage.deleteFile({ fileKey: key });
    
    return NextResponse.json({
      text: result.text,
      inputType: 'voice',
      duration: result.duration,
    });
  } catch (error) {
    console.error('Transcribe error:', error);
    return NextResponse.json({ error: '语音识别失败，请重试' }, { status: 500 });
  }
}

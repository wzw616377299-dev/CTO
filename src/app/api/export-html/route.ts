import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { readFile } from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const workspacePath = process.env.COZE_WORKSPACE_PATH || '/workspace/projects';
    const projectDomain = process.env.COZE_PROJECT_DOMAIN_DEFAULT || '';
    
    // 获取当前服务器地址（projectDomain 已经包含 https:// 前缀）
    const apiBaseUrl = projectDomain || 'http://localhost:5000';
    
    // 读取HTML模板
    const templatePath = path.join(workspacePath, 'src/templates/standalone.html');
    let htmlContent = await readFile(templatePath, 'utf-8');
    
    // 替换API地址占位符
    htmlContent = htmlContent.replace('{{API_BASE_URL}}', apiBaseUrl);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `cto-assistant-${timestamp}.html`;

    // 初始化对象存储
    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });

    // 上传到对象存储
    const fileKey = await storage.uploadFile({
      fileContent: Buffer.from(htmlContent, 'utf-8'),
      fileName: `exports/${fileName}`,
      contentType: 'text/html; charset=utf-8',
    });

    // 生成签名 URL（有效期 24 小时）
    const downloadUrl = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 86400,
    });

    const fileSizeKB = (Buffer.byteLength(htmlContent, 'utf-8') / 1024).toFixed(2);

    return NextResponse.json({
      success: true,
      downloadUrl,
      fileName,
      fileSize: `${fileSizeKB} KB`,
      apiBaseUrl,
      message: 'HTML导出成功',
    });

  } catch (error) {
    console.error('Export HTML error:', error);
    return NextResponse.json(
      { error: '导出失败，请稍后重试' },
      { status: 500 }
    );
  }
}

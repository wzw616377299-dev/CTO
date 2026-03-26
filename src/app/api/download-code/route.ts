import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import archiver from 'archiver';
import { Readable } from 'stream';
import { readdir, stat, readFile } from 'fs/promises';
import path from 'path';

// 要排除的目录和文件
const EXCLUDE_DIRS = [
  'node_modules',
  '.next',
  '.git',
  '.cozeproj',
  'dist',
  'build',
];

const EXCLUDE_FILES = [
  '.DS_Store',
  'Thumbs.db',
  '.env.local',
  '.env.development.local',
  '.env.production.local',
];

// 递归获取所有文件
async function getAllFiles(dir: string, baseDir: string): Promise<{ path: string; relativePath: string }[]> {
  const files: { path: string; relativePath: string }[] = [];
  
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    
    if (entry.isDirectory()) {
      // 跳过排除的目录
      if (EXCLUDE_DIRS.includes(entry.name)) continue;
      const subFiles = await getAllFiles(fullPath, baseDir);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      // 跳过排除的文件
      if (EXCLUDE_FILES.includes(entry.name)) continue;
      if (entry.name.endsWith('.log')) continue;
      files.push({ path: fullPath, relativePath });
    }
  }
  
  return files;
}

export async function POST(request: NextRequest) {
  try {
    const workspacePath = process.env.COZE_WORKSPACE_PATH || '/workspace/projects';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipFileName = `cto-assistant-code-${timestamp}.zip`;

    // 获取所有文件
    const files = await getAllFiles(workspacePath, workspacePath);
    
    // 创建 zip 流
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    // 收集所有文件内容
    for (const file of files) {
      try {
        const content = await readFile(file.path);
        archive.append(content, { name: file.relativePath });
      } catch (e) {
        // 跳过无法读取的文件
        console.warn(`Skip file: ${file.path}`);
      }
    }
    
    // 完成打包
    archive.finalize();
    
    // 将流转换为 Buffer
    const chunks: Buffer[] = [];
    for await (const chunk of Readable.toWeb(archive) as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    const zipBuffer = Buffer.concat(chunks);

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
      fileContent: zipBuffer,
      fileName: `downloads/${zipFileName}`,
      contentType: 'application/zip',
    });

    // 生成签名 URL（有效期 1 小时）
    const downloadUrl = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 3600,
    });

    // 获取文件大小（MB）
    const fileSizeMB = (zipBuffer.length / (1024 * 1024)).toFixed(2);
    const fileCount = files.length;

    return NextResponse.json({
      success: true,
      downloadUrl,
      fileName: zipFileName,
      fileSize: `${fileSizeMB} MB`,
      fileCount,
      message: '代码打包成功，点击下载',
    });

  } catch (error) {
    console.error('Download code error:', error);
    return NextResponse.json(
      { error: '打包失败，请稍后重试' },
      { status: 500 }
    );
  }
}

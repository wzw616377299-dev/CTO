import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

/**
 * POST /api/upload
 *
 * 把上传的图片写入 public/uploads 目录，返回一个同站可访问的 URL。
 * 这样不依赖外部对象存储也能跑通整条链路：
 *  - 前端展示     -> /uploads/xxx.png
 *  - 服务端 OCR   -> 读本地文件转 base64 再喂给大模型
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are supported' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    const safeName = (file.name || 'image').replace(/[^\w.\-]+/g, '_');
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
    const diskPath = path.join(uploadsDir, fileName);

    await writeFile(diskPath, buffer);

    const publicUrl = `/uploads/${fileName}`;

    return NextResponse.json({
      url: publicUrl,
      key: publicUrl,
      fileName: file.name,
      size: buffer.length,
      mimeType: file.type,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: '图片上传失败' }, { status: 500 });
  }
}

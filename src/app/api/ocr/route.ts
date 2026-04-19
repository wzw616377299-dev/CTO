import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { tokenhub, type ChatMessage } from '@/lib/tokenhub-client';
import { getModelConfig } from '@/config/model.config';

/**
 * POST /api/ocr - Batch OCR multiple images
 *
 * imageUrls 可以是：
 *   - 完整 http(s) URL  -> 直接以 image_url 方式喂给大模型
 *   - 以 / 开头的站内路径 (如 /uploads/xxx.png) -> 服务端读本地文件，转成 data URL 再喂
 *
 * 当前 TokenHub 网关未必保证所有模型都支持多模态图片，
 * 若调用失败，会对该张图片返回占位文本，避免整个链路挂掉。
 */

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

async function resolveImagePayload(
  rawUrl: string
): Promise<{ url: string; kind: 'http' | 'data' } | null> {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return { url: trimmed, kind: 'http' };
  }

  // 仅允许 /uploads 开头的本地路径，防止任意读
  if (!trimmed.startsWith('/uploads/')) {
    return null;
  }

  const diskPath = path.join(process.cwd(), 'public', trimmed.replace(/^\//, ''));
  try {
    const buf = await readFile(diskPath);
    const ext = path.extname(trimmed).toLowerCase();
    const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
    return { url: dataUrl, kind: 'data' };
  } catch (err) {
    console.error('Read local image failed:', diskPath, err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrls } = body as { imageUrls: string[] };

    if (!imageUrls || imageUrls.length === 0) {
      return NextResponse.json({ error: 'No images provided' }, { status: 400 });
    }

    if (imageUrls.length > 20) {
      return NextResponse.json({ error: '最多支持20张图片' }, { status: 400 });
    }

    const visionConfig = getModelConfig('vision');

    const results = await Promise.all(
      imageUrls.map(async (rawUrl, index) => {
        const resolved = await resolveImagePayload(rawUrl);
        if (!resolved) {
          return { index, text: `[图片${index + 1}无效或无法访问]` };
        }

        const messages: ChatMessage[] = [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '请识别这张图片中的所有文字内容。如果是聊天截图，请按对话顺序整理出来，标注说话人和内容。只输出识别到的文字，不要添加任何解释。',
              },
              {
                type: 'image_url',
                image_url: {
                  url: resolved.url,
                  detail: 'high',
                },
              },
            ],
          },
        ];

        try {
          const response = await tokenhub.invoke(messages, {
            model: visionConfig.model,
            temperature: visionConfig.temperature,
          });
          return { index, text: response.content || '' };
        } catch (error) {
          console.error(`OCR failed for image ${index}:`, error);
          return {
            index,
            text: `[图片${index + 1}识别失败：当前视觉模型暂不可用，已跳过]`,
          };
        }
      })
    );

    results.sort((a, b) => a.index - b.index);
    const allText = results.map((r) => r.text).join('\n\n---\n\n');

    return NextResponse.json({
      text: allText,
      success: true,
    });
  } catch (error) {
    console.error('Batch OCR error:', error);
    return NextResponse.json({ error: '图片识别失败' }, { status: 500 });
  }
}

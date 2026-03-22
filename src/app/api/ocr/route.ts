import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

// POST /api/ocr - Batch OCR multiple images
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
    
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);
    
    // 并发处理所有图片
    const ocrPromises = imageUrls.map(async (imageUrl, index) => {
      try {
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
        
        return { index, text: response.content };
      } catch (error) {
        console.error(`OCR failed for image ${index}:`, error);
        return { index, text: `[图片${index + 1}识别失败]` };
      }
    });
    
    // 等待所有OCR完成
    const results = await Promise.all(ocrPromises);
    
    // 按顺序排列结果
    results.sort((a, b) => a.index - b.index);
    
    // 合并所有文字
    const allText = results.map(r => r.text).join('\n\n---\n\n');
    
    return NextResponse.json({
      text: allText,
      success: true,
    });
  } catch (error) {
    console.error('Batch OCR error:', error);
    return NextResponse.json({ error: '图片识别失败' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { tokenhub } from '@/lib/tokenhub-client';
import { getModelConfig } from '@/config/model.config';

export async function POST(request: NextRequest) {
  try {
    const { inputText } = await request.json();

    if (!inputText?.trim()) {
      return NextResponse.json({ error: '请输入内容' }, { status: 400 });
    }

    const messages = [
      {
        role: 'system' as const,
        content: `你是一个标题生成助手。根据用户输入的内容，生成一个简短的标题（20字以内）。

要求：
1. 标题要准确概括用户问题的核心内容
2. 使用简洁的中文表达
3. 不要使用标点符号
4. 只返回标题，不要其他内容`,
      },
      {
        role: 'user' as const,
        content: `为以下内容生成一个标题：\n\n${inputText}`,
      },
    ];

    // 使用轻量模型生成标题，更快更省
    const modelConfig = getModelConfig('title');

    let title = '';
    const stream = tokenhub.stream(messages, {
      model: modelConfig.model,
      temperature: modelConfig.temperature,
    });

    for await (const chunk of stream) {
      if (chunk.content) {
        title += chunk.content;
      }
    }

    // 清理标题
    title = title.trim().replace(/[。！？，、；：""''（）【】《》]/g, '').slice(0, 20);

    return NextResponse.json({ title });
  } catch (error) {
    console.error('Title generation error:', error);
    return NextResponse.json({ error: '生成标题失败' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const SYSTEM_PROMPT = `你是一位经验丰富的产品经理，帮助同行理解开发在沟通中提到的技术内容，并给出实用的应对建议。

## 你的角色

你也是产品经理，所以你要站在产品经理的角度思考和说话。你的回答要接地气、实用、口语化，像是同事之间的交流。

## 分析框架

### 1. 对话还原
首先识别这段对话中的角色和内容：
- 谁说的？（开发/产品/其他）
- 说了什么？
- 前因后果是什么？

### 2. 技术点拆解
用大白话解释技术概念，要结合具体的对话上下文：
- 这个技术在对话里是什么意思
- 开发为什么这时候提这个
- 对你（产品经理）有什么实际影响
- 用生活中的例子来类比

### 3. 意图判断（接地气版）
直接告诉用户：
- 开发是在正常讨论问题，还是在给需求设门槛
- 是真的有技术困难，还是在"忽悠"你
- 是不是在转移话题、拖延时间
- 用一两句话说清楚你的判断

### 4. 应对话术（口语化）
给3-4句可以直接用的话，要：
- 口语化，像正常人说话，不要书面腔
- 语气要专业但不卑微
- 可以带一点"软钉子"
- 给产品经理留后路，不要把话说死
- 让开发觉得你懂，但又不纠缠技术细节

### 5. 追问建议
给2-3个可以追问的问题：
- 让开发自己把问题说清楚
- 或者让开发给出具体的限制条件
- 引导对话往你想要的方向走

### 6. 知识补充
补充一些相关技术背景，帮你以后遇到类似情况能心里有数。

## 输出格式

严格按JSON格式：

{
  "dialogContext": {
    "speakers": ["开发", "产品经理"],
    "summary": "一两句话概括对话核心",
    "background": "背景说明"
  },
  "technicalPoints": [
    {
      "term": "技术术语",
      "inContext": "在这段对话里是什么意思",
      "whyMentioned": "开发为什么这时候提出来",
      "realImpact": "对你有什么实际影响",
      "analogy": "生活中的类比"
    }
  ],
  "intentVerdict": {
    "judgment": "正常讨论/设门槛/忽悠你/转移话题/拖延",
    "reason": "为什么这么判断，一句话",
    "confidence": "高/中/低"
  },
  "scripts": [
    "可以直接说的一句话",
    "另一句话"
  ],
  "followUp": [
    "可以问的问题1",
    "可以问的问题2"
  ],
  "knowledge": {
    "summary": "一句话总结",
    "details": ["要点1", "要点2"]
  }
}

## 重要提醒

1. 话术要口语化！不要写"您好，我想了解一下..."这种书面语，要写"这个具体是啥问题？大概要多久？"这种正常人说话的方式
2. 意图判断要直白，不要含糊其辞
3. 技术解释要结合具体对话，不要泛泛而谈
4. 你是产品经理的战友，帮他们说话`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inputText, mode = 'concise', saveRecord = true, userId } = body;
    
    if (!inputText || inputText.trim().length === 0) {
      return NextResponse.json({ error: '请输入内容' }, { status: 400 });
    }
    
    // Fetch user's history for context
    let historyContext = '';
    if (userId) {
      try {
        const client = getSupabaseClient();
        const { data: records } = await client
          .from('analysis_records')
          .select('id, title, input_text, technical_points, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5);
        
        if (records && records.length > 0) {
          historyContext = `\n\n## 你之前遇到过的类似情况\n\n${records.map((r, i) => {
            const techPoints = r.technical_points as Array<{ term: string }> | null;
            return `${i + 1}. ${r.title || r.input_text.slice(0, 60)}
   技术点: ${techPoints?.map(p => p.term).join('、') || '无'}
`;
          }).join('\n')}`;
        }
      } catch (e) {
        console.log('Could not fetch history:', e);
      }
    }
    
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);
    
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT + historyContext },
      { role: 'user' as const, content: `分析这段对话：\n\n${inputText}` }
    ];
    
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullContent = '';
        
        try {
          const llmStream = client.stream(messages, {
            model: 'doubao-seed-1-8-251228',
            temperature: 0.8,
          });
          
          for await (const chunk of llmStream) {
            if (chunk.content) {
              const text = chunk.content.toString();
              fullContent += text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
            }
          }
          
          if (saveRecord && userId) {
            try {
              const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsedResult = JSON.parse(jsonMatch[0]);
                
                const supabaseClient = getSupabaseClient();
                const title = inputText.slice(0, 80) + (inputText.length > 80 ? '...' : '');
                
                // Flatten the new structure for database
                const { data: record } = await supabaseClient
                  .from('analysis_records')
                  .insert({
                    user_id: userId,
                    input_text: inputText,
                    input_type: 'text',
                    title: title,
                    mode: mode,
                    technical_points: parsedResult.technicalPoints,
                    intent_analysis: parsedResult.intentVerdict,
                    response_scripts: parsedResult.scripts,
                    follow_up_questions: parsedResult.followUp,
                    knowledge_extension: parsedResult.knowledge,
                  })
                  .select()
                  .single();
                
                if (record) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ recordId: record.id })}\n\n`));
                }
              }
            } catch (parseError) {
              console.log('Parse error');
            }
          }
          
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (streamError) {
          console.error('Stream error:', streamError);
          controller.close();
        }
      }
    });
    
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Analyze API error:', error);
    return NextResponse.json({ error: '分析失败' }, { status: 500 });
  }
}

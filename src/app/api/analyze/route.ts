import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const SYSTEM_PROMPT = `你是一位资深的技术顾问，专门帮助产品经理理解开发人员在沟通中使用的技术概念和术语。

你的任务是对用户提供的对话内容进行深入分析，并以通俗易懂的方式解释技术概念。

## 分析框架

### 1. 技术点拆解
识别对话中涉及的技术概念，用非技术人员能理解的语言解释：
- 这个技术概念是什么？（用类比和例子）
- 为什么开发会提到这个？（可能的原因）
- 这个技术点的实际影响是什么？

### 2. 意图分析
判断开发人员说这番话的真实意图：
- 是正常的技术讨论吗？
- 是在解释为什么某个需求难以实现吗？
- 是在转移话题或设置障碍吗？
- 是在合理的技术约束下工作吗？
给出你的判断和理由。

### 3. 应对话术
提供3-5条可以直接使用的话术建议：
- 话术要专业、温和但立场坚定
- 不要攻击对方，而是聚焦于解决问题
- 可以要求对方进一步澄清或解释
- 体现产品经理的专业性

### 4. 追问方向
列出2-3个可以反问的问题：
- 帮助厘清技术细节
- 引导对方解释实际影响
- 推动讨论向前进展

### 5. 知识扩展
提供相关的技术背景知识，帮助产品经理在未来遇到类似情况时更有底气。

## 输出格式

请严格按照以下JSON格式输出：

{
  "technicalPoints": [
    {
      "term": "技术术语",
      "explanation": "通俗解释",
      "whyMentioned": "为什么被提到",
      "impact": "实际影响"
    }
  ],
  "intentAnalysis": {
    "type": "normal/discussion/explanation/obstruction/deflection",
    "summary": "意图总结",
    "reasoning": "判断理由"
  },
  "responseScripts": [
    "话术1",
    "话术2",
    "话术3"
  ],
  "followUpQuestions": [
    "追问1",
    "追问2"
  ],
  "knowledgeExtension": {
    "summary": "知识总结",
    "details": [
      "知识点1",
      "知识点2"
    ]
  }
}

注意：
1. 解释要简洁明了，避免使用更多技术术语
2. 话术要可直接使用，符合职场沟通规范
3. 保持专业态度，不偏不倚
4. 默认使用简洁模式，输出精炼有效`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inputText, mode = 'concise', saveRecord = true, userId } = body;
    
    if (!inputText || inputText.trim().length === 0) {
      return NextResponse.json({ error: '请输入需要分析的内容' }, { status: 400 });
    }
    
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);
    
    // Build prompt based on mode
    const modeInstruction = mode === 'detailed' 
      ? '\n\n请使用详细模式，提供更深入的分析和更多的背景知识。'
      : '\n\n请使用简洁模式，输出精炼有效，直击要点。';
    
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT + modeInstruction },
      { role: 'user' as const, content: `请分析以下对话内容：\n\n${inputText}` }
    ];
    
    // Use streaming for better UX
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullContent = '';
        
        try {
          const llmStream = client.stream(messages, {
            model: 'doubao-seed-1-8-251228',
            temperature: 0.7,
          });
          
          for await (const chunk of llmStream) {
            if (chunk.content) {
              const text = chunk.content.toString();
              fullContent += text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
            }
          }
          
          // Try to parse JSON and save record
          if (saveRecord && userId) {
            try {
              // Extract JSON from the response
              const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsedResult = JSON.parse(jsonMatch[0]);
                
                const supabaseClient = getSupabaseClient();
                const title = inputText.slice(0, 100) + (inputText.length > 100 ? '...' : '');
                
                const { data: record, error: dbError } = await supabaseClient
                  .from('analysis_records')
                  .insert({
                    user_id: userId,
                    input_text: inputText,
                    input_type: 'text',
                    title: title,
                    mode: mode,
                    technical_points: parsedResult.technicalPoints,
                    intent_analysis: parsedResult.intentAnalysis,
                    response_scripts: parsedResult.responseScripts,
                    follow_up_questions: parsedResult.followUpQuestions,
                    knowledge_extension: parsedResult.knowledgeExtension,
                  })
                  .select()
                  .single();
                
                if (!dbError && record) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ recordId: record.id })}\n\n`));
                }
              }
            } catch (parseError) {
              // JSON parsing failed, but that's okay - the content is still useful
              console.log('Could not parse JSON from response, skipping record save');
            }
          }
          
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (streamError) {
          console.error('Stream error:', streamError);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: '分析过程中出现错误' })}\n\n`));
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
    return NextResponse.json({ error: '分析失败，请重试' }, { status: 500 });
  }
}

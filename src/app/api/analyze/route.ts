import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const SYSTEM_PROMPT = `你是一位资深的技术顾问，专门帮助产品经理理解开发人员在沟通中使用的技术概念和术语。

## 你的特点

你会结合用户的历史记录来进行分析，引用相似案例，帮助用户建立知识关联。

## 分析框架

### 1. 相关历史
如果用户的历史记录中有类似的技术点或场景，请列出相关的记录，帮助用户回顾学习。

### 2. 技术点拆解
识别对话中涉及的技术概念，用非技术人员能理解的语言解释：
- 这个技术概念是什么？（用类比和例子）
- 为什么开发会提到这个？（可能的原因）
- 这个技术点的实际影响是什么？

### 3. 意图分析
判断开发人员说这番话的真实意图：
- normal: 正常沟通
- discussion: 技术讨论
- explanation: 解释说明
- obstruction: 可能设置障碍
- deflection: 可能转移话题

### 4. 应对话术
提供3-5条可以直接使用的话术建议：
- 专业、温和但立场坚定
- 聚焦于解决问题
- 可以要求对方进一步澄清

### 5. 追问方向
列出2-3个可以反问的问题，推动讨论向前进展。

### 6. 知识扩展
提供相关的技术背景知识。

## 输出格式

严格按照以下JSON格式输出：

{
  "relatedHistory": [
    {
      "id": "记录ID",
      "title": "记录标题",
      "similarity": "相似度说明"
    }
  ],
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
    "话术2"
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
1. 如果用户历史记录中有相关内容，务必在 relatedHistory 中引用
2. 解释要简洁明了
3. 默认使用简洁模式`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inputText, mode = 'concise', saveRecord = true, userId } = body;
    
    if (!inputText || inputText.trim().length === 0) {
      return NextResponse.json({ error: '请输入需要分析的内容' }, { status: 400 });
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
          .limit(10);
        
        if (records && records.length > 0) {
          historyContext = `\n\n## 用户历史记录\n\n以下是用户最近的分析记录，请参考这些内容，如果与当前输入相关，在分析中引用：\n\n${records.map((r, i) => {
            const techPoints = r.technical_points as Array<{ term: string }> | null;
            return `${i + 1}. 【ID: ${r.id}】${r.title || r.input_text.slice(0, 50)}
   内容摘要: ${r.input_text.slice(0, 100)}...
   涉及技术: ${techPoints?.map(p => p.term).join('、') || '无'}
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
    
    // Build prompt based on mode
    const modeInstruction = mode === 'detailed' 
      ? '\n\n请使用详细模式，提供更深入的分析和更多的背景知识。'
      : '\n\n请使用简洁模式，输出精炼有效，直击要点。';
    
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT + historyContext + modeInstruction },
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
              console.log('Could not parse JSON from response');
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

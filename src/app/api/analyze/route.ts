import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils, SearchClient } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 企微沟通场景
const SYSTEM_PROMPT_WORK = `你是月薪100万的资深技术总监，产品经理的贴心军师。

## 你的角色

帮产品经理解读工作场景中的技术对话，给出可落地的应对策略。

## 说话风格

- 像朋友聊天，不要太正式
- 直接给结论，别绕弯子

## 输出格式（Markdown）

**这是什么意思**

[用一句话概括这段对话在说什么]

**小白版解释**

[用给6年级学生讲故事的方式解释，用生活类比]

**技术点解读**

- **[术语1]**：[大白话解释]
- **[术语2]**：[大白话解释]

**我的判断：[结论]**

[具体分析，用 ✅ ⚠️ ❌ 表示判断]

**建议你这样做**

1. [具体建议]

**可以这样说**

> [话术1]
> 
> [话术2]

**可以追问**

- [追问1]`;

// 技术理解场景
const SYSTEM_PROMPT_UNDERSTAND = `你是月薪100万的资深技术总监，帮产品经理理解技术方案、评估可行性。

## 你的角色

帮产品经理把技术方案翻译成人话，让他们能做判断、能跟进。

## 说话风格

- 像导师讲解，但不要说教
- 用类比让技术概念更好懂

## 输出格式（Markdown）

**这是什么意思**

[用一句话概括这个技术方案想解决什么问题]

**小白版解释**

[用生活类比解释，6年级学生能懂]

**技术方案拆解**

- **[技术1]**：[解释 + 优缺点]
- **[技术2]**：[解释 + 优缺点]

**风险和坑**

- [风险1]
- [风险2]

**你需要关注**

- [关注点1]
- [关注点2]`;

// 概念梳理场景
const SYSTEM_PROMPT_CONCEPT = `你是月薪100万的资深技术总监，帮产品经理学习技术概念、扫清知识盲区。

## 你的角色

把技术概念讲清楚，让产品经理能理解、能记住、能用得上。

## 说话风格

- 像朋友讲解，轻松但专业
- 多用类比，让抽象概念具体化

## 输出格式（Markdown）

**这是什么**

[用一句话定义这个概念]

**小白版解释**

[用生活类比解释，说清楚来龙去脉，6年级学生能懂]

**核心要点**

- [要点1]
- [要点2]

**实际应用**

- [场景1]
- [场景2]

**记忆口诀**

> [一句话记住这个概念]`;

// 追问场景
const SYSTEM_PROMPT_FOLLOW_UP = `你是月薪100万的资深技术总监，正在和产品经理进行连续对话。

## 你的角色

基于之前的对话内容，回答产品经理的追问。保持上下文连贯，不要重复解释已经说过的内容。

## 说话风格

- 直接回答问题
- 如果追问涉及新的技术点，用大白话解释
- 像朋友聊天一样自然`;

// 汇报框架
const SYSTEM_PROMPT_REPORT = `你是月薪100万的资深技术总监，帮产品经理准备向上级汇报的内容。

## 你的角色

用金字塔原理（结论先行）帮产品经理整理汇报思路。

## 输出格式（Markdown）

**核心结论**

> [一句话结论]

**关键论点**

1. **[论点1]**：[一句话说明]
2. **[论点2]**：[一句话说明]

**详细展开**

**论点1：[标题]**
- [具体说明]

**论点2：[标题]**
- [具体说明]

**风险提示**

- [风险1]：[应对方案]

**下一步行动**

- [ ] [行动项1]
- [ ] [行动项2]`;

function getSystemPrompt(scenario: string, isFollowUp: boolean = false): string {
  if (isFollowUp) return SYSTEM_PROMPT_FOLLOW_UP;
  
  switch (scenario) {
    case 'understand': return SYSTEM_PROMPT_UNDERSTAND;
    case 'concept': return SYSTEM_PROMPT_CONCEPT;
    default: return SYSTEM_PROMPT_WORK;
  }
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      inputText, 
      imageUrls, 
      scenario = 'work', 
      saveRecord = true, 
      userId,
      isFollowUp = false,
      history = [],
      generateReport = false,
    } = body as {
      inputText?: string;
      imageUrls?: string[];
      scenario?: string;
      saveRecord?: boolean;
      userId?: string;
      isFollowUp?: boolean;
      history?: Message[];
      generateReport?: boolean;
    };
    
    if (!inputText?.trim()) {
      return NextResponse.json({ error: '请输入内容' }, { status: 400 });
    }
    
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);
    
    // 构建消息
    let messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    
    if (isFollowUp && history.length > 0) {
      messages = [
        { role: 'system', content: SYSTEM_PROMPT_FOLLOW_UP },
        ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: inputText }
      ];
    } else {
      const systemPrompt = getSystemPrompt(scenario, false);
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: scenario === 'concept' ? `请解释这个概念：\n\n${inputText}` : `分析这段内容：\n\n${inputText}` }
      ];
    }
    
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullContent = '';
        
        try {
          // 直接开始 LLM 流式输出（不做联网搜索，提升速度）
          const llmStream = client.stream(messages, {
            model: 'doubao-seed-2-0-pro-260215',
            temperature: 0.7,
          });
          
          for await (const chunk of llmStream) {
            if (chunk.content) {
              const text = chunk.content.toString();
              fullContent += text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
            }
          }
          
          // 生成汇报框架（如果需要）
          if (generateReport && !isFollowUp) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ reportStart: true })}\n\n`));
            
            const reportMessages = [
              { role: 'system' as const, content: SYSTEM_PROMPT_REPORT },
              { role: 'user' as const, content: `基于以下内容，生成向上级汇报的思维导图框架：\n\n${inputText}\n\n---\n\n分析结果：\n${fullContent}` }
            ];
            
            const reportStream = client.stream(reportMessages, {
              model: 'doubao-seed-2-0-pro-260215',
              temperature: 0.7,
            });
            
            for await (const chunk of reportStream) {
              if (chunk.content) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ reportContent: chunk.content.toString() })}\n\n`));
              }
            }
          }
          
          // 保存记录
          if (saveRecord && userId && !isFollowUp) {
            try {
              const supabaseClient = getSupabaseClient();
              const title = inputText.slice(0, 80) + (inputText.length > 80 ? '...' : '');
              
              await supabaseClient.from('analysis_records').insert({
                user_id: userId,
                input_text: inputText,
                input_type: imageUrls?.length ? 'image' : 'text',
                image_urls: imageUrls || [],
                title,
                mode: scenario,
                response_scripts: [fullContent],
              });
            } catch {}
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

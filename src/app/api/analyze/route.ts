import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const SYSTEM_PROMPT = `你是一位有10年经验的全栈开发工程师，现在是产品经理的"军师"。

## 你的角色

产品经理遇到技术相关的困惑时，你来帮他分析。你不是在写报告，你是在和他聊天——像一个靠谱的同事，站在他这边，帮他做决策。

## 说话风格

- 口语化，像正常人说话，不要书面腔
- 直接点，别绕弯子
- 该质疑质疑，该帮开发说话也要说
- 用大白话解释技术，必要时用生活类比
- 给明确的行动建议，不要模棱两可

## 对话角色识别

首先，你要识别对话中的角色：
- 谁是产品经理（用户）
- 谁是开发/技术方
- 每个人说了什么

在分析时，要带上每个人的名字和观点，比如：
- "张三（开发）说XXX，其实意思是..."
- "李四说的这个，你要注意..."

## 分析框架

### 1. 这是什么意思
用大白话解释对话中的技术概念，**要结合具体的人说的话**：
- 谁说了什么技术术语
- 这个人为什么这么说
- 对你（产品经理）有什么实际影响

### 2. 我的判断
直接告诉产品经理：
- 开发说的是事实吗？
- 时间/难度合理吗？
- 是不是有水分、在留buffer、在设门槛？
- 还是确实有困难，需要理解？

用 ✅ ⚠️ ❌ 来表示判断：
- ✅ 合理，他说的是事实
- ⚠️ 有水分/有替代方案没说/在留余地
- ❌ 在忽悠你/明显夸大

### 3. 建议你这样做
给1-2条具体的行动建议，比如：
- 先问清楚什么
- 怎么跟他谈
- 可以退让什么、坚持什么

### 4. 可以这样说
给2-3句可以直接用的话，要口语化，像正常人说话。如果对话中有具体的人，可以提到对方的名字。

### 5. 可以追问
给1-2个能戳穿或推进的问题。

## 输出格式（Markdown）

**对话里谁说了什么**

[简要列出：XX（开发）说了XXX；YY（产品）说了XXX]

**这是什么意思**

[用大白话解释，自然段落，带上人名]

**我的判断：[判断结论]**

[具体分析，为什么这么判断]

**建议你这样做**

1. [具体行动建议]
2. [如果有第二条]

**可以这样说**

> [话术1，可以提到对方名字]
> 
> [话术2]

**可以追问**

- [追问1]
- [追问2]

## 重要

1. 你是产品经理的战友，帮他们说话，但也要客观
2. 话术要口语化！"这个具体是什么问题"比"我想了解一下具体情况"好
3. 判断要明确，不要"可能、也许、不一定"
4. 建议要具体可执行，不要"可以沟通一下"这种废话
5. **分析时要带上每个人的名字，让用户知道你在说谁**`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inputText, mode = 'concise', saveRecord = true, userId } = body;
    
    if (!inputText || inputText.trim().length === 0) {
      return NextResponse.json({ error: '请输入内容' }, { status: 400 });
    }
    
    // 识别用户（产品经理）的名字
    const pmNames: string[] = [];
    if (inputText.includes('王昭旺')) pmNames.push('王昭旺');
    if (inputText.toLowerCase().includes('jairwang')) pmNames.push('jairwang');
    
    // 构建角色提示
    let roleHint = '';
    if (pmNames.length > 0) {
      roleHint = `\n\n## 角色说明\n\n你是王昭旺（jairwang）的军师。在对话中，${pmNames.join(' 和 ')} 就是产品经理，也就是你的用户。你要站在他/她的角度分析问题。`;
    }
    
    // Fetch user's history for context
    let historyContext = '';
    if (userId) {
      try {
        const client = getSupabaseClient();
        const { data: records } = await client
          .from('analysis_records')
          .select('id, title, input_text, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(3);
        
        if (records && records.length > 0) {
          historyContext = `\n\n## 这位产品经理最近遇到的情况\n\n${records.map((r, i) => `${i + 1}. ${r.input_text.slice(0, 100)}`).join('\n')}\n\n（如果和当前情况有关联，可以提一下）`;
        }
      } catch (e) {
        console.log('Could not fetch history:', e);
      }
    }
    
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);
    
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT + roleHint + historyContext },
      { role: 'user' as const, content: `分析这段对话：\n\n${inputText}` }
    ];
    
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
          
          if (saveRecord && userId) {
            try {
              const supabaseClient = getSupabaseClient();
              const title = inputText.slice(0, 80) + (inputText.length > 80 ? '...' : '');
              
              const { data: record } = await supabaseClient
                .from('analysis_records')
                .insert({
                  user_id: userId,
                  input_text: inputText,
                  input_type: 'text',
                  title: title,
                  mode: mode,
                  response_scripts: [fullContent],
                })
                .select()
                .single();
              
              if (record) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ recordId: record.id })}\n\n`));
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

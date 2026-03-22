import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const SYSTEM_PROMPT = `你是一位有10年经验的全栈开发工程师，现在是产品经理的"军师"。

## 你的角色

你的唯一任务：帮产品经理解读对话中的技术信息，给他做决策建议。

## 说话风格

- 口语化，像正常人说话
- 直接点，别绕弯子
- 用大白话解释技术，必要时用生活类比
- 给明确的行动建议

## 分析框架

### 1. 技术点解读（重点）
首先识别对话中提到的所有技术术语/概念，逐个用大白话解释：
- 这个技术是什么
- 在这段对话里是什么意思
- 对产品有什么影响

### 2. 小白版解释（必选）
把上面的技术概念，用给6年级小学生讲故事的方式再解释一遍：
- 用生活中的例子打比方
- 说清楚来龙去脉：为什么要有这个东西、解决了什么问题
- 让完全不懂技术的人也能听懂

### 3. 这是什么意思
用大白话概括整段对话在说什么。

### 4. 我的判断
直接告诉产品经理：
- 说的是事实吗？
- 时间/难度合理吗？
- 是不是有水分、在留buffer、在设门槛？

用 ✅ ⚠️ ❌ 来表示：
- ✅ 合理，是事实
- ⚠️ 有水分/有替代方案没说/在留余地
- ❌ 在忽悠/明显夸大

### 5. 建议你这样做
给1-2条具体的行动建议。

### 6. 可以这样说
给2-3句可以直接用的话，口语化。

### 7. 可以追问
给1-2个能戳穿或推进的问题。

## 输出格式（Markdown）

**技术点解读**

- **[术语1]**：[大白话解释，在这段对话里是什么意思]
- **[术语2]**：[大白话解释，在这段对话里是什么意思]

**小白版解释**

[用给6年级小学生讲故事的方式，解释上面提到的技术概念。用生活中的例子打比方，说清楚来龙去脉]

**这是什么意思**

[用大白话概括]

**我的判断：[判断结论]**

[具体分析]

**建议你这样做**

1. [具体行动建议]

**可以这样说**

> [话术1]
> 
> [话术2]

**可以追问**

- [追问1]
- [追问2]

## 重要

1. 你是产品经理的战友，帮他们说话，但也要客观
2. 话术要口语化
3. 判断要明确，不要"可能、也许"
4. **技术点解读是重点，要逐个解释清楚**
5. **小白版解释要用6年级学生能懂的语言，用生活类比，说清楚来龙去脉**
6. 没有明确名字时，不要猜测是谁说的，只分析内容本身`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inputText, imageUrls, mode = 'concise', saveRecord = true, userId } = body;
    
    if ((!inputText || inputText.trim().length === 0) && (!imageUrls || imageUrls.length === 0)) {
      return NextResponse.json({ error: '请输入内容' }, { status: 400 });
    }
    
    // 识别用户（产品经理）的名字
    const pmNames: string[] = [];
    if (inputText.includes('王昭旺')) pmNames.push('王昭旺');
    if (inputText.toLowerCase().includes('jairwang')) pmNames.push('jairwang');
    
    // 构建角色提示
    let roleHint = '';
    if (pmNames.length > 0) {
      roleHint = `\n\n## 对话中的角色\n\n${pmNames.join(' 和 ')} 是产品经理，也就是你的用户。分析时如果提到这些名字，要知道这是你帮的人。`;
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
          
          if (saveRecord && userId) {
            try {
              const supabaseClient = getSupabaseClient();
              const title = inputText.slice(0, 80) + (inputText.length > 80 ? '...' : '');
              
              const { data: record } = await supabaseClient
                .from('analysis_records')
                .insert({
                  user_id: userId,
                  input_text: inputText,
                  input_type: imageUrls && imageUrls.length > 0 ? 'image' : 'text',
                  image_urls: imageUrls || [],
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

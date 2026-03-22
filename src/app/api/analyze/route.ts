import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 企微沟通场景 - 工作群聊、需求对接、技术评审
const SYSTEM_PROMPT_WORK = `你是月薪100万的资深技术总监，产品经理的贴心军师。

## 你的角色

帮产品经理解读工作场景中的技术对话，给出可落地的应对策略。

## 说话风格

- 像朋友聊天，不要太正式
- 直接给结论，别绕弯子
- 该怎么说就怎么说，不用客套

## 分析框架

### 1. 技术点解读
识别所有技术术语/概念，逐个用大白话解释：
- 这个技术是什么
- 在这段对话里是什么意思
- 对产品有什么影响

### 2. 小白版解释
把技术概念用给6年级学生讲故事的方式解释：
- 用生活中的例子打比方
- 说清楚为什么要有这个东西、解决了什么问题

### 3. 这是什么意思
用大白话概括整段对话在说什么。

### 4. 我的判断
直接告诉产品经理：
- 说的是事实吗？
- 时间/难度合理吗？
- 是不是有水分、在留buffer、在设门槛？

用 ✅ ⚠️ ❌ 来表示判断结论。

### 5. 建议你这样做
给1-2条具体的行动建议。

### 6. 可以这样说
给2-3句可以直接用的话，口语化。

### 7. 可以追问
给1-2个能戳穿或推进的问题。

## 输出格式（Markdown）

**技术点解读**

- **[术语1]**：[大白话解释]
- **[术语2]**：[大白话解释]

**小白版解释**

[用6年级学生能懂的语言，生活类比]

**这是什么意思**

[大白话概括]

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
- [追问2]`;

// 技术理解场景 - 理解技术方案、评估可行性
const SYSTEM_PROMPT_UNDERSTAND = `你是月薪100万的资深技术总监，帮产品经理理解技术方案、评估可行性。

## 你的角色

帮产品经理把技术方案翻译成人话，让他们能做判断、能跟进。

## 说话风格

- 像导师讲解，但不要说教
- 用类比让技术概念更好懂
- 给明确的风险提示和建议

## 分析框架

### 1. 技术方案拆解
识别所有技术点，逐个解释：
- 这个技术是什么
- 为什么要用它
- 有什么优缺点
- 对产品/业务的影响

### 2. 小白版解释
用6年级学生能懂的语言解释技术方案：
- 用生活中的例子打比方
- 说清楚来龙去脉

### 3. 这在做什么
用大白话概括这个技术方案想解决什么问题。

### 4. 风险和坑
这个方案可能有什么问题：
- 技术风险
- 时间风险
- 资源风险

### 5. 你需要关注
作为产品经理，需要重点关注什么：
- 关键指标
- 验收标准
- 沟通要点

### 6. 可以这样问
给1-2个关键问题，帮你了解真实情况。

## 输出格式（Markdown）

**技术方案拆解**

- **[技术1]**：[解释 + 优缺点]
- **[技术2]**：[解释 + 优缺点]

**小白版解释**

[用6年级学生能懂的语言，生活类比]

**这在做什么**

[大白话概括]

**风险和坑**

- [风险1]
- [风险2]

**你需要关注**

- [关注点1]
- [关注点2]

**可以这样问**

- [问题1]
- [问题2]`;

// 概念梳理场景 - 学习技术概念、扫清知识盲区
const SYSTEM_PROMPT_CONCEPT = `你是月薪100万的资深技术总监，帮产品经理学习技术概念、扫清知识盲区。

## 你的角色

把技术概念讲清楚，让产品经理能理解、能记住、能用得上。

## 说话风格

- 像朋友讲解，轻松但专业
- 多用类比，让抽象概念具体化
- 不用模拟工作场景的对话，重点是把概念讲清楚

## 分析框架

### 1. 核心概念
这个概念/技术是什么：
- 简单定义
- 为什么要有它
- 解决了什么问题

### 2. 小白版解释
用给6年级学生讲故事的方式解释：
- 用生活中的例子打比方
- 说清楚来龙去脉
- 让完全不懂技术的人也能听懂

### 3. 实际应用
这个概念在实际工作中怎么用：
- 什么时候会遇到
- 怎么判断用得好不好
- 和其他概念的关系

### 4. 常见误区
新手容易搞混的点：
- 概念A vs 概念B
- 常见错误理解

### 5. 记忆口诀
一句话记住这个概念。

## 输出格式（Markdown）

**核心概念**

[简单定义 + 为什么要有它]

**小白版解释**

[用6年级学生能懂的语言，生活类比，说清楚来龙去脉]

**实际应用**

- [应用场景1]
- [应用场景2]

**常见误区**

- [误区1]
- [误区2]

**记忆口诀**

> [一句话记住这个概念]`;

// 追问场景的系统提示
const SYSTEM_PROMPT_FOLLOW_UP = `你是月薪100万的资深技术总监，正在和产品经理进行连续对话。

## 你的角色

基于之前的对话内容，回答产品经理的追问。保持上下文连贯，不要重复解释已经说过的内容。

## 说话风格

- 直接回答问题，不要重复之前说过的内容
- 如果追问涉及到新的技术点，用大白话解释
- 保持之前对话的语气和风格
- 像朋友聊天一样自然

## 输出要求

- 直接回答用户的问题
- 如果需要补充新的技术解释，简洁明了
- 保持 Markdown 格式`;

function getSystemPrompt(scenario: string, isFollowUp: boolean = false): string {
  if (isFollowUp) {
    return SYSTEM_PROMPT_FOLLOW_UP;
  }
  
  switch (scenario) {
    case 'understand':
      return SYSTEM_PROMPT_UNDERSTAND;
    case 'concept':
      return SYSTEM_PROMPT_CONCEPT;
    case 'work':
    default:
      return SYSTEM_PROMPT_WORK;
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
      mode = 'concise', 
      saveRecord = true, 
      userId,
      isFollowUp = false,
      history = []
    } = body as {
      inputText?: string;
      imageUrls?: string[];
      scenario?: string;
      mode?: string;
      saveRecord?: boolean;
      userId?: string;
      isFollowUp?: boolean;
      history?: Message[];
    };
    
    if ((!inputText || inputText.trim().length === 0) && (!imageUrls || imageUrls.length === 0)) {
      return NextResponse.json({ error: '请输入内容' }, { status: 400 });
    }
    
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);
    
    // 根据场景选择不同的系统提示
    const systemPrompt = getSystemPrompt(scenario, isFollowUp);
    
    // 构建消息
    let messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    
    if (isFollowUp && history.length > 0) {
      // 追问模式：带历史上下文
      messages = [
        { role: 'system', content: systemPrompt },
        ...history.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        })),
        { role: 'user', content: inputText || '' }
      ];
    } else {
      // 首次分析
      // 识别用户（产品经理）的名字
      const pmNames: string[] = [];
      if (inputText?.includes('王昭旺')) pmNames.push('王昭旺');
      if (inputText?.toLowerCase().includes('jairwang')) pmNames.push('jairwang');
      
      // 构建角色提示
      let roleHint = '';
      if (pmNames.length > 0) {
        roleHint = `\n\n## 对话中的角色\n\n${pmNames.join(' 和 ')} 是产品经理，也就是你的用户。分析时如果提到这些名字，要知道这是你帮的人。`;
      }
      
      // Fetch user's history for context
      let historyContext = '';
      if (userId) {
        try {
          const supabaseClient = getSupabaseClient();
          const { data: records } = await supabaseClient
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
      
      messages = [
        { role: 'system', content: systemPrompt + roleHint + historyContext },
        { role: 'user', content: scenario === 'concept' 
          ? `请解释这个概念：\n\n${inputText}`
          : `分析这段内容：\n\n${inputText}` }
      ];
    }
    
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
          
          // 只在首次分析时保存记录
          if (saveRecord && userId && !isFollowUp) {
            try {
              const supabaseClient = getSupabaseClient();
              const title = (inputText || '').slice(0, 80) + ((inputText?.length || 0) > 80 ? '...' : '');
              
              const { data: record } = await supabaseClient
                .from('analysis_records')
                .insert({
                  user_id: userId,
                  input_text: inputText || '',
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

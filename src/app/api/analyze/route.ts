import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getModelByScenario } from '@/config/model.config';

// 智能分析场景 - 自动判断内容类型并选择合适的输出格式
const SYSTEM_PROMPT_SMART = `你是首席技术官（CTO），帮产品经理理解技术内容。

## 说话风格
- 直接给结论，别绕弯子
- 用简单直白的话解释术语
- 不要生活类比

## 重点高亮
- \`*文字*\` 最核心信息
- \`**文字**\` 次要要点
- \`***文字***\` 补充说明

## 输出格式

**这是什么意思**
[一句话概括]

**小白版解释**
[简单直白解释]

**技术点解读**
- **[术语]**：[简单解释]

**我的判断：[结论]**
[分析，用 ✅ ⚠️ ❌]

**建议你这样做**
1. [建议]

**可以这样说**
> [话术]`;

// 汇报框架场景
const SYSTEM_PROMPT_REPORT = `你是CTO，帮产品经理准备汇报。

## 说话风格
- 极度简洁，每个要点不超过一行
- 结论先行，论据支撑
- 适合直接复制到微信或邮件

## 重点高亮
- \`*文字*\` 最核心结论
- \`**文字**\` 支撑论据
- \`***文字***\` 补充说明

## 输出格式

**背景**
[一句话]

**核心结论**
> [一句话结论]

**关键要点**
1. [要点1]
2. [要点2]

**风险提示**
- [风险] → [应对]

**下一步行动**
- [ ] [行动项]`;

// 追问场景
const SYSTEM_PROMPT_FOLLOW_UP = `你是资深技术总监，正在和产品经理连续对话。

## 说话风格
- 直接回答问题
- 用大白话解释新术语
- 像朋友聊天一样自然

## 重点高亮
- \`*文字*\` 最核心信息
- \`**文字**\` 次要要点
- \`***文字***\` 补充说明

## 输出格式
直接回答追问，保持上下文连贯，不重复已说内容。`;

// Prompt 梳理场景
const SYSTEM_PROMPT_PROMPT = `你是CTO，帮产品经理理解 AI Prompt 的思考过程。

## 重点高亮
- \`*文字*\` 最核心信息
- \`**文字**\` 次要要点
- \`***文字***\` 补充说明

## 输出格式

### Prompt 目标
用一句话说明这个 Prompt 让 AI 做什么。

### AI 思考流程
按执行顺序列出每个步骤：
- 步骤1：【名称】做什么 → 输出什么
- 步骤2：...

### 条件分支
如果有条件判断：
如果 [条件] → 执行 [动作]

### 异常处理
- 触发条件
- 处理方式

### 关键规则
- 规则1
- 规则2`;

// 代码梳理场景 - 从产品经理视角梳理代码逻辑
const SYSTEM_PROMPT_CODE = `你是CTO，帮产品经理理解代码业务逻辑。

## 重点高亮
- \`*文字*\` 最核心信息
- \`**文字**\` 次要要点
- \`***文字***\` 补充说明

## 输出格式

### 代码功能
用一句话说明代码实现了什么。

### 业务逻辑
按执行顺序列出：
- 步骤1：【动作】做什么 → 结果
- 步骤2：...

### 条件分支
如果 [条件] → 执行 [动作]

### 异常处理
- 触发条件
- 处理方式

### 关键规则
- 规则1
- 规则2`;

function getSystemPrompt(scenario: string, isFollowUp: boolean = false): string {
  if (isFollowUp) return SYSTEM_PROMPT_FOLLOW_UP;
  
  switch (scenario) {
    case 'smart':
    case 'work':
    case 'understand':
    case 'concept':
      return SYSTEM_PROMPT_SMART;
    case 'report':
      return SYSTEM_PROMPT_REPORT;
    case 'prompt':
      return SYSTEM_PROMPT_PROMPT;
    case 'code':
      return SYSTEM_PROMPT_CODE;
    default:
      return SYSTEM_PROMPT_SMART;
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
      title: customTitle,
    } = body as {
      inputText?: string;
      imageUrls?: string[];
      scenario?: string;
      saveRecord?: boolean;
      userId?: string;
      isFollowUp?: boolean;
      history?: Message[];
      title?: string;
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
    
    // 根据场景获取模型配置
    const modelConfig = getModelByScenario(scenario);
    
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullContent = '';
        
        try {
          // 使用真正的流式输出 - client.stream()
          const llmStream = client.stream(messages, {
            model: modelConfig.model,
            temperature: modelConfig.temperature,
          });
          
          // 逐块处理流式响应
          for await (const chunk of llmStream) {
            if (chunk.content) {
              const text = chunk.content.toString();
              fullContent += text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
            }
          }
          
          // 发送完成信号
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          
          // 保存记录（在发送完成信号之后，关闭 controller 之前）
          if (saveRecord && userId && !isFollowUp) {
            try {
              const supabaseClient = getSupabaseClient();
              // 使用前端传入的标题，如果没有则截取输入内容
              const title = customTitle || inputText.slice(0, 80) + (inputText.length > 80 ? '...' : '');
              
              // 插入新记录
              await supabaseClient.from('analysis_records').insert({
                user_id: userId,
                input_text: inputText,
                input_type: imageUrls?.length ? 'image' : 'text',
                image_urls: imageUrls || [],
                title,
                mode: scenario,
                response_scripts: [fullContent],
              });
              
              // 获取该用户的所有记录ID（按时间降序）
              const { data: allRecords } = await supabaseClient
                .from('analysis_records')
                .select('id')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
              
              // 如果超过30条，删除多余的旧记录
              if (allRecords && allRecords.length > 30) {
                const idsToDelete = allRecords.slice(30).map(r => r.id);
                await supabaseClient
                  .from('analysis_records')
                  .delete()
                  .in('id', idsToDelete);
              }
            } catch (dbError) {
              console.error('Database save error:', dbError);
            }
          }
          
          controller.close();
        } catch (streamError) {
          console.error('Stream error:', streamError);
          try {
            controller.close();
          } catch {}
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

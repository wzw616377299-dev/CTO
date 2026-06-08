import { NextRequest, NextResponse } from 'next/server';
import { tokenhub } from '@/lib/tokenhub-client';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getModelChain } from '@/config/model.config';

/**
 * 老陈 · 产品经理的随身 CTO —— 统一 System Prompt
 *
 * 基于 SKILL「cto-assistant」的规范沉淀：
 *   1. 自行识别场景（work / understand / concept / report / code / prompt / meeting / incident）
 *   2. 按对应模板生成结构化 Markdown
 *   3. 第一块必须是「🙋 小白版」（report / followup 例外）
 *   4. 只输出 Markdown，不生成图片，不调用任何渲染脚本
 */
const SKILL_SYSTEM_PROMPT = `你是「老陈」——用户的 CTO 搭档。用户是产品经理，不懂技术但需要读懂技术对话、理解方案、跟进进展。

## 总则
- 直接给结论，不反问用户、不要求补充信息；信息再少也基于现有内容做技术理解
- 永远站在 PM 立场：关心「对业务什么影响 / 我需要做什么」
- 第一个模块必须是「### 🙋 小白版：...」（report 场景例外）
- 用 \`###\` 分模块；每模块至少 3 条
- 重点：\`*核心*\` / \`**次要**\` / \`***补充***\`
- 话术用「」包裹，可直接复制
- 禁止输出图片、渲染脚本、JSON 调试、token 用量等元信息

## 场景自动判定
- work：聊天截图、对话记录、开发说的话
- understand：技术方案、评审、选型
- concept：「什么是…」「…意思是」
- report：汇报、周报、总结
- code：代码片段
- prompt：Prompt / AI 指令
- meeting：会议记录
- incident：故障、告警
无法判断时走 work。

## 统一产出（按场景挑适合的模块名）
1. 🙋 小白版：发生了什么 / 这是什么 / 这段代码在干什么 ...
2. 技术点解读（3-5 条，解释出现过的词）
3. 当前进展 / 核心要点 / 业务步骤（带 ✅ ⚠️ ❌）
4. ⚠️ 你需要跟进的 / 风险和坑 / 需要参与的决策
5. 💬 建议你这样问（可复制话术）

report 专用：📋 背景 → ✅ 核心结论 → 关键支撑 → ⚠️ 风险提示 → 下一步行动；末尾给一段纯文字版：【背景】…【结论】…【支撑】①…【风险】…【行动】①…

incident 补定级：🔴 P0 / 🟠 P1 / 🟡 P2 / 🟢 P3
work 补定级（写在"当前进展"里）：🔴 严重 ❌ / 🟡 需关注 ⚠️ / 🟢 正常 ✅

code 翻译词典（严格）：if/else→满足条件/否则；try/catch→出错了；循环→逐个处理；API→向[服务]请求；DB query→查询记录；null→为空；async/await→等待完成；cache→临时保存；timeout→超时。

## 长度约束（非常重要）
- 小白版控制在 2 句话、60 字以内
- 其他每个模块最多 3 条，每条最多一句话、25 字以内
- 话术每条最多一句
- 全文总长度控制在 450–550 字
- 宁可精练，不要堆叠
`;

/**
 * 追问场景 —— 文字回复，不出卡片
 */
const FOLLOW_UP_SYSTEM_PROMPT = `你是「老陈」——用户的 CTO 搭档。用户是产品经理，正在对之前的分析进行追问。请遵循以下规则：

- 直接回答问题，不重复之前已经说过的内容
- 语气像聊天，不要变成正式文档
- 「为什么」类：先说核心原因（一句话）→ 展开技术背景（2-3 句）→ 「对你意味着什么」
- 「这个词」类：30 字内建立认知 + 举工作中会遇到的例子
- 「怎么做」类：给具体行动建议；需要话术时用「」格式直接给
- 「严不严重」类：直接定性 → 判断依据（一句话）→ 跟进建议
- 重点高亮：\`*文字*\` 最核心，\`**文字**\` 次要，\`***文字***\` 补充

## 绝对禁止
- 禁止反问用户「你是不是发错了」「请提供更多内容」等澄清类话术
- 禁止质疑输入完整性，信息再少也要基于现有内容做技术理解
- 禁止输出 token 用量、JSON 调试信息
- 禁止生成图片，禁止调用任何渲染脚本
`;

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
      saveRecord = true,
      userId,
      isFollowUp = false,
      history = [],
      title: customTitle,
    } = body as {
      inputText?: string;
      imageUrls?: string[];
      saveRecord?: boolean;
      userId?: string;
      isFollowUp?: boolean;
      history?: Message[];
      title?: string;
    };

    if (!inputText?.trim()) {
      return NextResponse.json({ error: '请输入内容' }, { status: 400 });
    }

    // 构建消息
    let messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;

    if (isFollowUp && history.length > 0) {
      messages = [
        { role: 'system', content: FOLLOW_UP_SYSTEM_PROMPT },
        ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: inputText },
      ];
    } else {
      messages = [
        { role: 'system', content: SKILL_SYSTEM_PROMPT },
        { role: 'user', content: inputText },
      ];
    }

    // 统一使用 primary 候选链（自动降级：deepseek → kimi → hunyuan → glm）
    const primaryChain = getModelChain('primary');

    // 识别「反问 / 要求用户补充」类开头，避免模型跳过 SKILL 模板
    const BAD_PATTERNS = [
      /请提供/,
      /请补充/,
      /请发送/,
      /请告诉我/,
      /请给出/,
      /请先提供/,
      /请问您/,
      /请问你/,
      /您想了解|你想了解/,
      /您希望|你希望/,
      /输入.{0,6}不完整/,
      /输入.{0,6}似乎/,
      /输入.{0,6}不足/,
      /似乎只.{0,6}(JSON|token|统计)/i,
      /我可以帮您|我可以帮你/,
      /是否可以/,
      /能否/,
      /我注意到您|我注意到你/,
    ];
    const looksLikeBadResponse = (text: string) => BAD_PATTERNS.some(re => re.test(text));

    const encoder = new TextEncoder();
    const sseStream = new ReadableStream({
      async start(controller) {
        const flush = (text: string) => {
          if (!text) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
        };

        let fullContent = '';

        try {
          // 策略：实时流式吐给前端（保证首屏最快），
          //       只拿前 160 字在后台做一次“反问模式”检测；
          //       命中才 reset 重试，不影响正常首包速度。
          const CHECK_WINDOW = 160;
          let headBuffer = '';
          let badDetected = false;

          const firstStream = tokenhub.streamWithFallback(messages, primaryChain);

          for await (const chunk of firstStream) {
            if (!chunk.content) continue;
            const piece = chunk.content;

            // 实时向前端吐
            fullContent += piece;
            flush(piece);

            // 顺便采样前段做质量检测
            if (!badDetected && headBuffer.length < CHECK_WINDOW) {
              headBuffer += piece;
              if (
                headBuffer.length >= CHECK_WINDOW &&
                !headBuffer.startsWith('### 🙋') &&
                looksLikeBadResponse(headBuffer)
              ) {
                badDetected = true;
                break;
              }
            }
          }

          // 命中反问模式 → 补指令重试，并用 reset 通知前端清屏
          if (badDetected || (fullContent.length < 40 && fullContent.trim().length === 0)) {
            const retryMessages = [
              ...messages,
              {
                role: 'system' as const,
                content:
                  '你上一次的回答违反了规则（反问用户 / 要求补充信息）。现在请忽略上一次回答，严格按 SKILL 模板输出：第一个模块必须是「🙋 小白版」，并对用户输入直接进行技术理解解读；哪怕信息很少也要基于现有内容推断。禁止反问、禁止要求补充、禁止输出任何 JSON / 调试信息。',
              },
            ];

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ reset: true })}\n\n`));
            fullContent = '';

            // 重试仍然流式，保证用户看得见进度（同样带降级）
            const retryChain = primaryChain.map(m => ({ ...m, maxTokens: 700 }));
            const retryStream = tokenhub.streamWithFallback(retryMessages, retryChain);
            for await (const chunk of retryStream) {
              if (!chunk.content) continue;
              fullContent += chunk.content;
              flush(chunk.content);
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));

          if (saveRecord && userId && !isFollowUp) {
            try {
              const supabaseClient = getSupabaseClient();
              const title =
                customTitle ||
                inputText.slice(0, 80) + (inputText.length > 80 ? '...' : '');

              await supabaseClient.from('analysis_records').insert({
                user_id: userId,
                input_text: inputText,
                input_type: imageUrls?.length ? 'image' : 'text',
                image_urls: imageUrls || [],
                title,
                mode: 'cto-assistant',
                response_scripts: [fullContent],
              });

              const { data: allRecords } = await supabaseClient
                .from('analysis_records')
                .select('id')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

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
      },
    });

    return new Response(sseStream, {
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

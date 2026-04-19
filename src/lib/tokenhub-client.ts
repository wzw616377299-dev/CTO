/**
 * TokenHub 统一大模型客户端
 *
 * 统一走 https://tokenhub.tencentmaas.com/v1/chat/completions
 * 遵循 OpenAI 兼容格式。
 *
 * 环境变量：
 *  - TOKENHUB_API_KEY   必填
 *  - TOKENHUB_BASE_URL  可选，默认 https://tokenhub.tencentmaas.com
 */

export type ChatMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | {
      role: 'user';
      content: Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
      >;
    };

export interface InvokeOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
}

function getBaseUrl(): string {
  return process.env.TOKENHUB_BASE_URL || 'https://tokenhub.tencentmaas.com';
}

function getApiKey(): string {
  const key = process.env.TOKENHUB_API_KEY;
  if (!key) {
    throw new Error('TOKENHUB_API_KEY is not set. 请在 .env.local 中配置。');
  }
  return key;
}

/**
 * 非流式调用，返回纯文本 content。
 */
export async function invoke(
  messages: ChatMessage[],
  options: InvokeOptions
): Promise<{ content: string }> {
  const res = await fetch(`${getBaseUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      messages,
      temperature: options.temperature,
      stream: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`TokenHub invoke failed: ${res.status} ${res.statusText} ${errText}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data?.choices?.[0]?.message?.content ?? '';
  return { content };
}

/**
 * 流式调用，按增量 token 产出文本。
 */
export async function* stream(
  messages: ChatMessage[],
  options: InvokeOptions
): AsyncGenerator<{ content: string }, void, unknown> {
  const res = await fetch(`${getBaseUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    throw new Error(`TokenHub stream failed: ${res.status} ${res.statusText} ${errText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE 按 \n\n 分块
      let sepIdx: number;
      while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        const lines = rawEvent.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload) continue;
          if (payload === '[DONE]') return;
          try {
            const json = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: unknown } }>;
            };
            const rawDelta = json?.choices?.[0]?.delta?.content;
            if (typeof rawDelta === 'string' && rawDelta.length > 0) {
              yield { content: rawDelta };
            }
          } catch {
            // 忽略无法解析的心跳/注释行
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

export const tokenhub = { invoke, stream };

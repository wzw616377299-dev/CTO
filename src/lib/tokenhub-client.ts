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

/**
 * 判断错误是否「可降级」——账号未开通 / 没免费额度 / 模型不可用 / 限流
 * 命中时应自动切到候选链里的下一个模型；
 * 未命中（比如 messages 字段错误、鉴权 401）就直接抛，避免无意义重试。
 */
function isFallbackable(err: unknown): boolean {
  const msg = String((err as Error)?.message || err || '');
  return (
    /\b402\b/.test(msg) ||
    /\b429\b/.test(msg) ||
    /payment\s+required/i.test(msg) ||
    /no_free_package/i.test(msg) ||
    /endpoint\s+is\s+inactive/i.test(msg) ||
    /not\s+active/i.test(msg) ||
    /\b401007\b/.test(msg) ||
    /quota\s+exceed/i.test(msg) ||
    /insufficient/i.test(msg) ||
    /model\s+not\s+found/i.test(msg) ||
    /unsupported\s+model/i.test(msg)
  );
}

export interface FallbackCandidate {
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * 带自动降级的非流式调用：
 * 顺序尝试 candidates，遇到「可降级」错误（402 / NO_FREE_PACKAGE 等）就切下一个，
 * 第一个成功的就返回。
 */
export async function invokeWithFallback(
  messages: ChatMessage[],
  candidates: FallbackCandidate[]
): Promise<{ content: string; model: string }> {
  if (candidates.length === 0) {
    throw new Error('invokeWithFallback: candidates is empty');
  }
  let lastErr: unknown = null;
  for (let i = 0; i < candidates.length; i++) {
    const opt = candidates[i];
    try {
      const r = await invoke(messages, opt);
      return { content: r.content, model: opt.model };
    } catch (e) {
      lastErr = e;
      const hasNext = i < candidates.length - 1;
      if (hasNext && isFallbackable(e)) {
        console.warn(
          `[TokenHub] invoke model "${opt.model}" unavailable, fallback -> "${candidates[i + 1].model}". reason: ${String((e as Error)?.message || e).slice(0, 200)}`
        );
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('All TokenHub fallback models failed');
}

/**
 * 带自动降级的流式调用：
 * - 第一个 chunk 之前失败 => 自动切下一个候选（用户无感知）
 * - 第一个 chunk 已产出后失败 => 直接抛（避免拼接两个模型的输出）
 *
 * 第一个产出的 chunk 会带上 `model` 字段，方便业务层埋点 / 调试。
 */
export async function* streamWithFallback(
  messages: ChatMessage[],
  candidates: FallbackCandidate[]
): AsyncGenerator<{ content: string; model?: string }, void, unknown> {
  if (candidates.length === 0) {
    throw new Error('streamWithFallback: candidates is empty');
  }
  let lastErr: unknown = null;

  for (let i = 0; i < candidates.length; i++) {
    const opt = candidates[i];
    let yielded = false;
    try {
      const it = stream(messages, opt);
      for await (const chunk of it) {
        if (!chunk.content) continue;
        if (!yielded) {
          yielded = true;
          yield { content: chunk.content, model: opt.model };
        } else {
          yield { content: chunk.content };
        }
      }
      // 正常结束
      return;
    } catch (e) {
      lastErr = e;
      const hasNext = i < candidates.length - 1;
      if (!yielded && hasNext && isFallbackable(e)) {
        console.warn(
          `[TokenHub] stream model "${opt.model}" unavailable, fallback -> "${candidates[i + 1].model}". reason: ${String((e as Error)?.message || e).slice(0, 200)}`
        );
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('All TokenHub fallback models failed');
}

export const tokenhub = { invoke, stream, invokeWithFallback, streamWithFallback };

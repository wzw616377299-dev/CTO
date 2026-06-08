/**
 * 模型配置中心（TokenHub 版）
 *
 * 全部调用走 https://tokenhub.tencentmaas.com/v1/chat/completions
 * 通过 .env.local 的 TOKENHUB_API_KEY 鉴权。
 *
 * 2026-06-08 调整（自动降级）：
 *  - primary / title 原本指向 glm-5-turbo，但当前账号下该 endpoint 未开通免费包
 *    （TokenHub 返回 402 NO_FREE_PACKAGE），导致 /api/analyze 空响应。
 *  - 现切换为已实测可用的 deepseek-v3.1-terminus 作为 primary，
 *    并新增 MODEL_CHAIN（候选降级链）：tokenhub-client 的
 *    streamWithFallback / invokeWithFallback 会按链顺序自动重试，
 *    任一模型「没费用 / 未开通 / 限流」即切下一个，业务层无感知。
 *
 *  - Kimi K2.5 网关要求 temperature 固定为 1，链中已就地覆盖。
 */

export const MODEL_CONFIG = {
  // 主模型 - 已实测可用，质量与速度兼顾
  primary: {
    model: 'deepseek-v3.1-terminus',
    temperature: 0.6,
    description: 'DeepSeek V3.1 Terminus - 推理质量稳，TokenHub 当前账号已开通',
    lastUpdated: '2026-06',
  },

  // 备选模型 - 主模型异常时兜底
  fallback: {
    model: 'kimi-k2.5',
    temperature: 1,
    description: 'Kimi K2.5 - 长上下文兜底（网关要求 temperature=1）',
    lastUpdated: '2026-06',
  },

  // 标题生成 - 轻量
  title: {
    model: 'deepseek-v3.1-terminus',
    temperature: 0.3,
    description: 'DeepSeek V3.1 Terminus - 用于标题等短文本任务',
    lastUpdated: '2026-06',
  },

  // OCR / 图像理解 - 多模态
  vision: {
    model: 'kimi-k2.5',
    temperature: 1,
    description: 'Kimi K2.5 - 支持 image_url 多模态输入（网关要求 temperature=1）',
    lastUpdated: '2025',
  },

  // 代码理解
  code: {
    model: 'kimi-k2.5',
    temperature: 1,
    description: 'Kimi K2.5 - 代码理解专家（网关要求 temperature=1）',
    lastUpdated: '2025',
  },

  // Prompt 分析 - 思考型更合适
  prompt: {
    model: 'hunyuan-2.0-thinking-20251109',
    temperature: 0.5,
    description: '腾讯混元 2.0 Thinking - 思考链路化，适合 Prompt 拆解',
    lastUpdated: '2025-11-09',
  },
} as const;

/**
 * 候选模型降级链：tokenhub-client 会按顺序尝试，
 * 命中「可降级错误」（402 / NO_FREE_PACKAGE / 限流 / 模型不存在等）就切下一个。
 *
 * 注意：链中各项是独立的 (model, temperature)，
 *   切到 kimi-k2.5 时 temperature 必须为 1（TokenHub 网关硬限制）。
 */
export const MODEL_CHAIN = {
  primary: [
    { model: 'deepseek-v3.1-terminus', temperature: 0.6 },
    { model: 'kimi-k2.5', temperature: 1 },
    { model: 'hunyuan-2.0-thinking-20251109', temperature: 0.5 },
    { model: 'glm-5-turbo', temperature: 0.5 }, // 万一 TokenHub 后续给开通了
  ],
  fallback: [
    { model: 'kimi-k2.5', temperature: 1 },
    { model: 'deepseek-v3.1-terminus', temperature: 0.6 },
  ],
  title: [
    { model: 'deepseek-v3.1-terminus', temperature: 0.3 },
    { model: 'kimi-k2.5', temperature: 1 },
    { model: 'glm-5-turbo', temperature: 0.3 },
  ],
  vision: [
    { model: 'kimi-k2.5', temperature: 1 },
  ],
  code: [
    { model: 'kimi-k2.5', temperature: 1 },
    { model: 'deepseek-v3.1-terminus', temperature: 0.6 },
  ],
  prompt: [
    { model: 'hunyuan-2.0-thinking-20251109', temperature: 0.5 },
    { model: 'deepseek-v3.1-terminus', temperature: 0.6 },
    { model: 'kimi-k2.5', temperature: 1 },
  ],
} as const;

export type ModelType = keyof typeof MODEL_CHAIN;

export function getModelChain(type: ModelType = 'primary') {
  // 复制成普通数组，方便业务层再覆盖 maxTokens 等参数
  return MODEL_CHAIN[type].map(m => ({ ...m }));
}

export const CURRENT_MODEL_VERSION = {
  primary: MODEL_CONFIG.primary.model,
  fallback: MODEL_CONFIG.fallback.model,
  lastReviewDate: '2026-06-08',
  nextReviewDate: '2026-07-08',
};

export function getModelConfig(
  type: 'primary' | 'fallback' | 'title' | 'vision' | 'code' | 'prompt' = 'primary'
) {
  return MODEL_CONFIG[type];
}

export function getModelByScenario(scenario: string): { model: string; temperature: number } {
  switch (scenario) {
    case 'code':
      return MODEL_CONFIG.code;
    case 'prompt':
      return MODEL_CONFIG.prompt;
    case 'smart':
    case 'work':
    case 'understand':
    case 'concept':
    case 'report':
    default:
      return MODEL_CONFIG.primary;
  }
}

export const MODEL_RECOMMENDATIONS = {
  complexReasoning: 'deepseek-v3.1-terminus',
  codeAndAgent: 'kimi-k2.5',
  advancedReasoning: 'deepseek-r1-0528',
  vision: 'kimi-k2.5',
  longContext: 'kimi-k2.5',
  fastResponse: 'glm-5-turbo',
  promptAnalysis: 'hunyuan-2.0-thinking-20251109',
  codeAnalysis: 'kimi-k2.5',
};

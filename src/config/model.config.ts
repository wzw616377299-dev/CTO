/**
 * 模型配置中心（TokenHub 版）
 *
 * 全部调用走 https://tokenhub.tencentmaas.com/v1/chat/completions
 * 通过 .env.local 的 TOKENHUB_API_KEY 鉴权。
 *
 * 2026-04-19 调整：
 *  - 按腾讯云 TokenHub 可用列表做分层：
 *    analyze  -> deepseek-v3.1-terminus（分析主力，推理稳）
 *    title    -> glm-5-turbo（轻任务，最低延迟）
 *    vision   -> kimi-k2.5（支持多模态图片输入）
 *    code     -> kimi-k2.5（代码领域强）
 *    prompt   -> hunyuan-2.0-thinking（思考链路化）
 *    fallback -> glm-5（综合备选）
 *
 *  - 注意：Kimi K2.5 网关要求 temperature 固定为 1。
 */

export const MODEL_CONFIG = {
  // 主模型 - 主攻速度：TokenHub 列表里 glm-5-turbo TTFB 和 TPS 最优
  primary: {
    model: 'glm-5-turbo',
    temperature: 0.5,
    description: 'GLM-5 Turbo - 首包最快，适合流式打字机体验',
    lastUpdated: '2026-04',
  },

  // 备选模型 - 主模型异常时兜底（质量取向）
  fallback: {
    model: 'deepseek-v3.1-terminus',
    temperature: 0.6,
    description: 'DeepSeek V3.1 Terminus - 推理质量兜底',
    lastUpdated: '2025-11',
  },

  // 标题生成 - 轻量 & 低延迟
  title: {
    model: 'glm-5-turbo',
    temperature: 0.3,
    description: 'GLM-5 Turbo - 轻量低延迟，用于标题等短文本任务',
    lastUpdated: '2025',
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

export const CURRENT_MODEL_VERSION = {
  primary: MODEL_CONFIG.primary.model,
  fallback: MODEL_CONFIG.fallback.model,
  lastReviewDate: '2026-04-19',
  nextReviewDate: '2026-05-19',
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

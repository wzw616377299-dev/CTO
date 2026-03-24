/**
 * 模型配置中心
 * 
 * 更新日志：
 * - 2025-03-23: 初始配置，使用 doubao-seed-2-0-pro-260215
 * 
 * 可用模型列表（按推荐程度排序）：
 * 1. doubao-seed-2-0-pro-260215 - 旗舰模型，复杂推理（最新 2025-02-15）
 * 2. kimi-k2-5-260127 - Kimi 最强模型，Agent/代码/视觉（2025-01-27）
 * 3. deepseek-v3-2-251201 - DeepSeek V3.2，高级推理
 * 4. doubao-seed-1-8-251228 - 多模态 Agent 优化
 * 5. doubao-seed-1-6-vision-250815 - 图像/视频理解
 */

// 模型优先级配置
export const MODEL_CONFIG = {
  // 主模型 - 用于核心分析任务
  primary: {
    model: 'doubao-seed-2-0-pro-260215',
    temperature: 0.7,
    description: '豆包旗舰模型 - 复杂推理、长上下文',
    lastUpdated: '2025-02-15',
  },
  
  // 备选模型 - 当主模型不可用时
  fallback: {
    model: 'kimi-k2-5-260127',
    temperature: 0.6, // Kimi K2.5 要求固定 0.6 或 1.0
    description: 'Kimi K2.5 - Agent/代码/视觉全能',
    lastUpdated: '2025-01-27',
  },
  
  // 标题生成 - 简单任务用轻量模型
  title: {
    model: 'doubao-seed-2-0-mini-260215',
    temperature: 0.3,
    description: '豆包轻量模型 - 快速响应',
    lastUpdated: '2025-02-15',
  },
  
  // OCR/图像理解
  vision: {
    model: 'doubao-seed-1-6-vision-250815',
    temperature: 0.5,
    description: '豆包视觉模型 - 图像/视频理解',
    lastUpdated: '2024-08-15',
  },
} as const;

// 当前生效的模型版本
export const CURRENT_MODEL_VERSION = {
  primary: MODEL_CONFIG.primary.model,
  fallback: MODEL_CONFIG.fallback.model,
  lastReviewDate: '2025-03-23',
  nextReviewDate: '2025-03-24', // 每天检查
};

// 获取模型配置
export function getModelConfig(type: 'primary' | 'fallback' | 'title' | 'vision' = 'primary') {
  return MODEL_CONFIG[type];
}

// 模型选择建议
export const MODEL_RECOMMENDATIONS = {
  // 复杂推理、多步规划
  complexReasoning: 'doubao-seed-2-0-pro-260215',
  
  // 代码生成、Agent 任务
  codeAndAgent: 'kimi-k2-5-260127',
  
  // 高级推理、数学逻辑
  advancedReasoning: 'deepseek-v3-2-251201',
  
  // 图像/视频理解
  vision: 'doubao-seed-1-6-vision-250815',
  
  // 长文本处理
  longContext: 'kimi-k2-250905',
  
  // 快速响应、高并发
  fastResponse: 'doubao-seed-2-0-mini-260215',
};

import { NextRequest, NextResponse } from 'next/server';
import { tokenhub } from '@/lib/tokenhub-client';
import { MODEL_CONFIG, CURRENT_MODEL_VERSION, MODEL_RECOMMENDATIONS } from '@/config/model.config';

/**
 * 模型状态检查 API
 * GET /api/model/status - 获取当前模型配置和版本信息
 * POST /api/model/status - 测试模型连接
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    provider: 'tokenhub',
    currentVersion: CURRENT_MODEL_VERSION,
    modelConfig: {
      primary: {
        model: MODEL_CONFIG.primary.model,
        description: MODEL_CONFIG.primary.description,
        lastUpdated: MODEL_CONFIG.primary.lastUpdated,
      },
      fallback: {
        model: MODEL_CONFIG.fallback.model,
        description: MODEL_CONFIG.fallback.description,
        lastUpdated: MODEL_CONFIG.fallback.lastUpdated,
      },
      title: {
        model: MODEL_CONFIG.title.model,
        description: MODEL_CONFIG.title.description,
      },
      vision: {
        model: MODEL_CONFIG.vision.model,
        description: MODEL_CONFIG.vision.description,
      },
    },
    recommendations: MODEL_RECOMMENDATIONS,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { testType = 'primary' } = body;

    const modelConfig = testType === 'fallback' ? MODEL_CONFIG.fallback : MODEL_CONFIG.primary;

    const startTime = Date.now();

    const response = await tokenhub.invoke(
      [{ role: 'user', content: '你好，请回复"OK"' }],
      {
        model: modelConfig.model,
        temperature: modelConfig.temperature,
      }
    );

    const latency = Date.now() - startTime;

    return NextResponse.json({
      status: 'ok',
      testType,
      model: modelConfig.model,
      latency: `${latency}ms`,
      response: response.content.slice(0, 50),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

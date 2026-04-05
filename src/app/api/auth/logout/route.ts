import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// POST /api/auth/logout - 用户登出
export async function POST() {
  try {
    const cookieStore = await cookies();
    
    // 清除 cookie
    cookieStore.delete('auth_token');

    return NextResponse.json({
      success: true,
      message: '登出成功',
    });
  } catch (error) {
    console.error('登出错误:', error);
    return NextResponse.json(
      { error: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}

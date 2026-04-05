import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// GET /api/auth/me - 获取当前用户信息
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      );
    }

    // 验证 token
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: number;
      username: string;
    };

    return NextResponse.json({
      success: true,
      user: {
        id: decoded.userId,
        username: decoded.username,
      },
    });
  } catch {
    // token 无效或过期
    const cookieStore = await cookies();
    cookieStore.delete('auth_token');

    return NextResponse.json(
      { error: '登录已过期，请重新登录' },
      { status: 401 }
    );
  }
}

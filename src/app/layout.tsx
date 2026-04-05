import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: {
    default: '首席技术官-老陈',
    template: '%s | CTO',
  },
  description:
    '首席技术官（CTO）老陈 AI 助手，帮助产品经理理解技术概念、分析沟通意图、提供应对策略。',
  keywords: [
    'CTO',
    '首席技术官',
    '产品经理',
    '技术沟通',
    'AI 助手',
    '职场沟通',
    '技术术语',
  ],
  authors: [{ name: 'CTO' }],
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}

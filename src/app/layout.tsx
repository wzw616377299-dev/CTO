import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '技术总监',
    template: '%s | 技术总监',
  },
  description:
    '月薪100万的资深技术总监，帮产品经理理解技术概念、分析沟通意图、提供应对话术。',
  keywords: [
    '产品经理',
    '技术沟通',
    '技术总监',
    'AI 助手',
    '职场沟通',
    '技术术语',
  ],
  authors: [{ name: '技术总监' }],
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
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {isDev && <Inspector />}
        {children}
      </body>
    </html>
  );
}

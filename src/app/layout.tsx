import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'PM 技术沟通助手',
    template: '%s | PM 助手',
  },
  description:
    '帮助产品经理理解开发的技术术语，分析沟通意图，提供应对话术，让技术沟通不再困难。',
  keywords: [
    '产品经理',
    '技术沟通',
    'PM 助手',
    'AI 分析',
    '职场沟通',
    '技术术语',
  ],
  authors: [{ name: 'PM Assistant' }],
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

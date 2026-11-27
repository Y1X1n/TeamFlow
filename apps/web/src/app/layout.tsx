import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'TeamFlow · 团队项目协作',
  description: '实时看板、细粒度权限与自动化提醒，轻量管理学生团队项目。',
};

// viewport-fit=cover 让安全区（刘海屏 / 手势条）样式生效。
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

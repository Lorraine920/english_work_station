import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "口语练习室 · Yiyuan",
  description: "英语口语纠正、每日跟读与翻译练习、AI 对话和 Notion 课程笔记工作台。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}

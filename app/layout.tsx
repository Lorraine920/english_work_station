import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "口语纠正室 · Yiyuan",
  description: "英语口语转录、搭配纠正、课程记录与 Notion 笔记工作台。",
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

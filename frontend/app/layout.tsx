import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EcomClaw — Amazon 品类分析",
  description: "输入关键词，获取专业 Amazon 品类分析报告",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-white">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "atoms-lite",
  description: "对话式应用生成平台（笔试 Demo）",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}

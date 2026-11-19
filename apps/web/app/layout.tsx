import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  applicationName: "atoms-lite",
  title: "atoms-lite",
  description: "对话式应用生成平台（笔试 Demo）",
};

export const viewport: Viewport = {
  themeColor: "#0e0f13",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="h-full bg-background text-foreground antialiased">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}

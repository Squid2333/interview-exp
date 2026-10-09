import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "知题 · 秋招题库",
  description: "收集、理解和复习技术面试题",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}

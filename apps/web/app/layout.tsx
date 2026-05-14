import type { Metadata } from "next";
import { GameClientProvider } from "./lib/game-client";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 狼人杀 MVP",
  description: "真人玩家与 AI 玩家同场推理的最小可运行版本",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <GameClientProvider>{children}</GameClientProvider>
      </body>
    </html>
  );
}

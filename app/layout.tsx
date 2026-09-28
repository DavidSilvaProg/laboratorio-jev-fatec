import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Laboratório JEV | Tópicos Especiais",
  description: "Aula interativa sobre Choice, Noul e Score com comparação ao Claude Opus 5.5.",
  other: {
    "codex-preview": "development",
  },
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
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}

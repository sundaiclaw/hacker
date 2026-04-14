import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Build Observatory",
  description:
    "A live observability layer for agent-driven software builds, deploys, and sub-agent workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[var(--background)] text-white">{children}</body>
    </html>
  );
}

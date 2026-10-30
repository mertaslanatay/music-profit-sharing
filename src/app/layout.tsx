import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AosInit, themeInitScript } from "@/components/theme";

export const metadata: Metadata = {
  title: "M4NM Pulse",
  description:
    "Virgin Music dağıtım raporlarından sanatçı hakedişlerini hesaplayan araç. Excel yükle, bölüşümü ve SWIFT kesintisini otomatik hesapla.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B0D12" },
    { media: "(prefers-color-scheme: light)", color: "#F5F6FA" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <AosInit />
        {children}
      </body>
    </html>
  );
}

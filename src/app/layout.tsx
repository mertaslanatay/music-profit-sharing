import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Müzik Gelir Dağılımı",
  description:
    "Virgin Music dağıtım raporlarından sanatçı hakedişlerini hesaplayan araç. Excel yükle, bölüşümü ve SWIFT kesintisini otomatik hesapla.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F1F3F5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}

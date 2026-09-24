import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Touch to Play | Voucher Check",
  description: "Cổng kiểm tra và xác nhận voucher dành cho nhân viên Nhà ga hành khách quốc tế Đà Nẵng.",
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
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}

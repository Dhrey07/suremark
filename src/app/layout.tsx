import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Suremark — Know what you're buying", template: "%s · Suremark" },
  description: "Verify a product in seconds and help build a more trusted marketplace.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a5e41" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}

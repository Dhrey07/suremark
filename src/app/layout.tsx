import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Product Authentication Platform", template: "%s · Product Authentication Platform" },
  description: "Unit-level product identity, issuance and consumer verification — pitch prototype.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a5e41" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}

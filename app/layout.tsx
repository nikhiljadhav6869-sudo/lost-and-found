import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lost & Found — Good things find their way back",
  description: "Find what’s missing. Return what matters. A kinder, safer community lost and found.",
  manifest: "/manifest.webmanifest",
  applicationName: "Lost & Found",
  appleWebApp: { capable: true, title: "Lost & Found", statusBarStyle: "default" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = { themeColor: "#226457" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lost & Found — Good things find their way back",
  description: "Find what’s missing. Return what matters. A kinder, safer community lost and found.",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

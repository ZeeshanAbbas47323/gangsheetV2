import type { Metadata, Viewport } from "next";
import { googleFontsHref } from "@/lib/text";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gangsheet Builder by ModFirst",
  description:
    "Professional DTF gang sheet builder — design, nest, and order print-ready gang sheets.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href={googleFontsHref()} />
      </head>
      <body>{children}</body>
    </html>
  );
}

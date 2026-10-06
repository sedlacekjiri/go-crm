import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
import { Loading } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Go CRM",
  description: "Partner CRM for Go Car Rentals & Go Campers – Reykjavík office",
  appleWebApp: { capable: true, title: "Go CRM", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a19" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <Providers>
          <Suspense fallback={<Loading />}>
            <Shell>{children}</Shell>
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}

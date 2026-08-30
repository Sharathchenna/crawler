import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { SiteShell } from "@/components/site-shell";
import { APP_DESCRIPTION, APP_NAME, THEME_COLOR } from "@/lib/config";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: `${APP_NAME} · a library of the open web`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: `${APP_NAME} · a library of the open web`,
    description: APP_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${inter.className} h-full antialiased`}>
      <body className="min-h-full bg-paper font-sans text-ink">
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}

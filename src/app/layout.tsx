import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { localeInitScript } from "@/lib/i18n";
import { themeInitScript } from "@/lib/theme";
import enMessages from "../../messages/en.json";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: enMessages.app.title,
  title: enMessages.app.title,
  description: enMessages.app.description,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: enMessages.app.title,
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/alumex-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/alumex-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/alumex-icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/logos/AlumexLogo.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      dir="ltr"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased light ltr`}
    >
      <body className="min-h-full">
        <Script
          id="alumex-locale-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: localeInitScript }}
        />
        <Script
          id="alumex-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        <I18nProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

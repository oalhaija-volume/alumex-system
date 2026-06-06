import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { ClientsProvider } from "@/components/clients/ClientsProvider";
import { ProjectsProvider } from "@/components/projects/ProjectsProvider";
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
  title: enMessages.app.title,
  description: enMessages.app.description,
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
          <ThemeProvider>
            <ClientsProvider>
              <ProjectsProvider>{children}</ProjectsProvider>
            </ClientsProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

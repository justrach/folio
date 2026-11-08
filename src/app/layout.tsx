import { FolioAppearance } from "@/components/folio-appearance";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./workspace-theme.css";
import "./theme.css";
import "@/components/ui/press-motion.css";

const dmSans = localFont({
  src: [
    { path: "./fonts/dm-sans-latin.woff2", weight: "100 1000", style: "normal" },
    { path: "./fonts/dm-sans-italic-latin.woff2", weight: "100 1000", style: "italic" },
  ],
  variable: "--font-dm-sans",
  display: "swap",
});

const dmMono = localFont({
  src: [
    { path: "./fonts/dm-mono-400-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/dm-mono-500-latin.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://usefolio.site"),
  title: "Folio — Your visibility, in perspective",
  description:
    "See which websites AI recommends for real questions. Inspect the sources, check your pages, and decide what to improve.",
  openGraph: {
    type: "website",
    url: "https://usefolio.site",
    siteName: "Folio",
    title: "Folio — See which websites AI recommends",
    description: "Inspect recorded recommendations, their sources, and your own website evidence.",
    images: [{ url: "/images/folio-og.jpg", width: 1200, height: 630, alt: "Folio: See which websites AI recommends" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Folio — See which websites AI recommends",
    description: "Inspect recorded recommendations, their sources, and your own website evidence.",
    images: ["/images/folio-og.jpg"],
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html suppressHydrationWarning lang="en" data-scroll-behavior="smooth" className={`${dmSans.variable} ${dmMono.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: "(()=>{let p='system';try{const v=localStorage.getItem('folio-dashboard-appearance');if(v==='light'||v==='dark')p=v}catch{}document.documentElement.dataset.folioPreference=p;document.documentElement.dataset.folioTheme=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p})()" }} /></head>
      <body><FolioAppearance />{children}</body>
    </html>
  );
}

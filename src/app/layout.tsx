import { FolioAppearance } from "@/components/folio-appearance";
import type { Metadata } from "next";
import { DM_Mono, DM_Sans } from "next/font/google";
import "./globals.css";
import "./workspace-theme.css";
import "./theme.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-dm-sans",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
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
    <html lang="en" data-scroll-behavior="smooth" className={`${dmSans.variable} ${dmMono.variable}`}>
      <body><FolioAppearance />{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import "./workspace-theme.css";
import "./theme.css";

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
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}

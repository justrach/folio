import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://usefolio.site"),
  title: "Folio — Your visibility, in perspective",
  description:
    "Audit your website, inspect agent answers against saved evidence, and review changes. Connect Google Search Console for private search reports.",
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

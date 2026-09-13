import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./workspace-theme.css";

const dmSans = localFont({
  src: [
    { path: "./fonts/dm-sans.ttf", weight: "100 1000", style: "normal" },
    { path: "./fonts/dm-sans-italic.ttf", weight: "100 1000", style: "italic" },
  ],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Folio — Your visibility, in perspective",
  description:
    "One considered view of your search visibility. Monitor SEO, explore AI discovery, and see where your website stands.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={dmSans.variable}>
      <body>{children}</body>
    </html>
  );
}

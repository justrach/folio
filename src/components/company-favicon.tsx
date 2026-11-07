import React from "react";
import Image from "next/image";
import favicons from "@/data/company-favicons.json";

/** Local public-brand assets only: browsing a result makes no third-party image request. */
export function CompanyFavicon({ url, name }: { url: string | null; name: string }) {
  let host = "";
  try { host = new URL(url ?? "").hostname.replace(/^(www|docs|developers|help|support)\./, ""); } catch { /* An absent URL uses the name below. */ }
  const src = (favicons as Record<string, string>)[host];
  return <span className="company-favicon" aria-hidden="true">{src
    ? <Image src={src} alt="" width={24} height={24} unoptimized />
    : <span>{name.trim().slice(0, 1).toUpperCase()}</span>}</span>;
}

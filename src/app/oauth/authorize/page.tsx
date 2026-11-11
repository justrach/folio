import type { Metadata } from "next";
import { Suspense } from "react";
import { OAuthAuthorize } from "@/components/oauth-authorize";

export const metadata: Metadata = { title: "Connect an app | Folio", robots: { index: false, follow: false } };

/** Where MCP clients send people to approve a connection (OAuth authorization endpoint). */
export default function AuthorizePage() {
  return <main className="cc-page"><Suspense fallback={null}><OAuthAuthorize /></Suspense></main>;
}

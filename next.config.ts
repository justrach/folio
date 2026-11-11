import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingRoot: process.cwd(),
  // The idle "N" badge sits in the bottom-left corner, on top of the sidebar's account menu. Errors still open the overlay.
  devIndicators: false,
};

export default function config(phase: string): NextConfig {
  // The local binding emulator belongs to next dev, not type generation/build.
  if (phase === PHASE_DEVELOPMENT_SERVER) initOpenNextCloudflareForDev({
    // getPlatformProxy takes the versioned directory; Wrangler CLI adds /v3 itself.
    // Keep the existing database location so a restart never starts an empty workspace.
    persist: { path: resolve(process.cwd(), ".wrangler/state/v3") },
    remoteBindings: false,
  });
  return nextConfig;
}

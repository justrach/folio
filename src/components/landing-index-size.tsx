"use client";

import { useEffect, useState } from "react";

/** Reads the real index size; the number grows as the crawl does. */
export function LandingIndexSize() {
  const [stats, setStats] = useState<{ pages: number; domains: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/index-stats", { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then((data: { available?: boolean; pages?: number; domains?: number } | null) => {
        if (data?.available && data.pages) setStats({ pages: data.pages, domains: data.domains ?? 0 });
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (!stats) return null;
  return (
    <p className="landing-index-size">
      {stats.pages.toLocaleString()} pages from {stats.domains.toLocaleString()} domains indexed
    </p>
  );
}

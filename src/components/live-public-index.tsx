"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { assertPublicDashboardData, type PublicDashboardData } from "@/lib/public-dashboard";

import "./live-public-index.css";

const LiveIndex = createContext<PublicDashboardData | null>(null);
export function useOptionalLivePublicIndex() { return useContext(LiveIndex); }
export function useLivePublicIndex() {
  const data = useContext(LiveIndex);
  if (!data) throw new Error("Live public Index data is unavailable.");
  return data;
}

/** One public-only read supplies both the website comparison and source answers. */
export function LivePublicIndex({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PublicDashboardData | null>(null);
  const [error, setError] = useState(false), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(false);
    void fetch("/api/public/benchmarks", { signal: controller.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("Public data unavailable"); const next: unknown = await response.json(); assertPublicDashboardData(next); if (!controller.signal.aborted) setData(current => current && next.snapshotNotice ? { ...current, snapshotNotice: next.snapshotNotice } : next); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  return <>
    <div className="public-index-refresh"><p role="status">{loading ? "Loading published results…" : error ? "Live results could not be refreshed. Try again." : data?.snapshotNotice ?? "Published results refreshed."}</p><button className="button button-secondary squishy-control" disabled={loading} onClick={() => setRevision(value => value + 1)}>{loading ? "Loading…" : "Refresh results"}</button></div>
    {data && <LiveIndex.Provider value={data}>{children}</LiveIndex.Provider>}
  </>;
}

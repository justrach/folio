import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";
import { Landing } from "@/components/landing";
import { Pricing } from "@/components/pricing";

const routes = [
  "overview",
  "search-data",
  "websites",
  "visibility",
  "seo",
  "patches",
  "leaderboard",
  "agents",
  "evaluations",
  "pricing",
  "settings",
  "login",
];
export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  if (!slug?.length) return <Landing />;
  const section = slug?.[0] ?? "overview";
  if ((slug?.length ?? 0) > 1 || !routes.includes(section)) notFound();
  if (section === "pricing") return <Pricing />;
  return <Suspense fallback={<main className="workspace-loading" role="status">Loading your workspace…</main>}><Dashboard section={section} /></Suspense>;
}

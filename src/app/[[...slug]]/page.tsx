import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";
import { Landing } from "@/components/landing";
import { Pricing } from "@/components/pricing";
import { Privacy } from "@/components/privacy";
import { WorkspaceLoader } from "@/components/workspace-loader";

const routes = [
  "overview",
  "search-data",
  "search-console",
  "websites",
  "visibility",
  "seo",
  "patches",
  "leaderboard",
  "agents",
  "evaluations",
  "benchmarks",
  "pricing",
  "settings",
  "login",
  "privacy",
];
export async function generateMetadata({params}:{params:Promise<{slug?:string[]}>}):Promise<Metadata> {
  const {slug} = await params;
  const path = slug?.length ? `/${slug.join("/")}` : "/";
  const isPublic = ["/", "/privacy", "/pricing", "/leaderboard"].includes(path);
  return { alternates: isPublic ? {canonical:path} : undefined, robots: {index:isPublic,follow:isPublic},
    ...(path === "/privacy" ? {title:"Privacy | Folio"} : {}) };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  if (!slug?.length) return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"WebSite",name:"Folio",url:"https://usefolio.site",description:"Website audits, evidence-based agent evaluations, and private Google Search Console reports."})}}/><Landing /></>;
  const section = slug?.[0] ?? "overview";
  if ((slug?.length ?? 0) > 1 || !routes.includes(section)) notFound();
  if (section === "pricing") return <Pricing />;
  if (section === "privacy") return <Privacy />;
  return <Suspense fallback={<WorkspaceLoader />}><Dashboard section={section} /></Suspense>;
}

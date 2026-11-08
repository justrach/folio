"use client";
import {isAdminOwner} from "@/lib/admin-emails";
import {trackProductEvent} from "@/lib/product-analytics-client";

import Link from "next/link";
import Image from "next/image";
import "./login.css";
import { DashboardAppearance, DashboardNavigation } from "./dashboard-appearance";
import { LabelInput } from "./bencho/label-input/LabelInput";
import "./bencho/label-input/LabelInput.css";
import "./dashboard-refresh.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Building2,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Code2,
  Compass,
  ExternalLink,
  Eye,
  EyeOff,
  FileCode2,
  FileText,
  FlaskConical,
  Globe2,
  Info,
  LayoutDashboard,
  Loader2,
  LogOut,
  Mail,
  Menu,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trophy,
  WandSparkles,
  X,
} from "lucide-react";
import { AnimatedCounter } from "@/components/ui/rare-animated-counter";
import { NotificationBell } from "@/components/ui/rare-notification-bell";
import { authClient } from "@/lib/auth-client";
import {
  brands,
  prompts,
  sampleChecks,
  samplePatches,
  type Patch,
  type Scan,
} from "@/lib/demo-data";
import { Sparkline, VisibilityChart } from "./charts";
import { PublishedIndex, PublicationControls } from "./published-index";
import { SeoDataPanel } from "./seo-data-panel";
import { SeoChecks } from "./seo-checks";
import { SearchConsolePanel } from "./search-console-panel";
import { OwnedWebsites } from "./owned-websites";
import { RealOverview, workspaceOverviewHref } from "./real-overview";
import { OverviewDemoNotice, OverviewSetupGuide } from "./overview-setup-guide";
import { CompanyFavicon } from "./company-favicon";
import dynamic from "next/dynamic";
import {ProductAnalyticsPanel} from "./product-analytics-panel";
import { ManusDashboardDemo } from "./manus-dashboard-demo";
import { IndexedDomains } from "./indexed-domains";
import { OrgPreview } from "./org-preview";
import { StartHere } from "./start-here";
import { WorkspaceRecords } from "./workspace-records";
import { XStandingPanel } from "./x-standing";

import { PublicBenchmarkDashboard } from "./public-benchmark-dashboard";
import "./public-overview-shell.css";
import { KeywordActivitySummary } from "./keyword-activity-summary";
import "./evaluation-page-shell.css";
import { KeywordBenchmarksPanel } from "./keyword-benchmarks-panel";
import { DeveloperToolsIndex } from "./developer-tools-index";
import { ModelLandscape } from "./model-landscape";
import { LivePublicIndex } from "./live-public-index";
import { RankedSearchTable } from "./ranked-search-table";
import "./index-page.css";
import { EvaluationsPanel } from "./evaluations-panel";
import { AgentRunsPanel, AgentRunDock } from "./agent-runs-panel";
import { evaluationHref, readEvaluationIntent } from "@/lib/evaluation-navigation";
import { WebsiteSwitcher } from "./website-switcher";
import { GithubConnection } from "./github-connection";
import { WorkspaceLoader } from "./workspace-loader";

const TeamUsageDemo=dynamic(()=>import("./team-usage-demo").then(module=>module.TeamUsageDemo),{ssr:false});
const RevenueGlobeDemo = dynamic(() => import("./revenue-globe-demo").then(module => module.RevenueGlobeDemo), {ssr:false,loading:()=> <p role="status">Loading sample globe…</p>});

type Modal = "scan" | "methodology" | "notifications" | "search" | null;
const navigation = [
  { label: "My workspace", href: "/overview?view=workspace", section: "overview", icon: LayoutDashboard },
  {
    label: "My websites",
    href: "/websites",
    section: "websites",
    icon: Globe2,
  },
  {
    label: "AI visibility",
    href: "/visibility",
    section: "visibility",
    icon: Sparkles,
  },
  { label: "SEO health", href: "/seo", section: "seo", icon: BarChart3 },
  {
    label: "Search & backlinks",
    href: "/search-data",
    section: "search-data",
    icon: Search,
  },
  {
    label: "Website checks",
    href: "/evaluations?view=page",
    section: "evaluations",
    icon: FlaskConical,
  },
  { label: "Keyword evaluations", href: "/benchmarks", section: "benchmarks", icon: FlaskConical },
  { label: "Search Console", href: "/search-console", section: "search-console", icon: Search },
  {
    label: "Patch studio",
    href: "/patches",
    section: "patches",
    icon: WandSparkles,
  },
];
const titles: Record<
  string,
  { eyebrow: string; title: string; description: string }
> = {
  analytics: {eyebrow:"INTERNAL",title:"Product analytics",description:"First-party usage and event timelines."},
  orgs: {
    eyebrow: "",
    title: "Organizations",
    description: "Sample team workspace: seats, roles, shared records, and audit activity.",
  },
  overview: {
    eyebrow: "THE BIG PICTURE",
    title: "My website results",
    description: "Your website, setup, and saved answers.",
  },
  websites: {
    eyebrow: "YOUR DIGITAL FOOTPRINT",
    title: "Your websites",
    description: "Add your website, choose customer questions, and review your saved answers.",
  },
  visibility: {
    eyebrow: "BE PART OF THE ANSWER",
    title: "AI visibility",
    description:
      "Explore the questions, answers, and sources that shape discovery.",
  },
  seo: {
    eyebrow: "BUILT TO BE FOUND",
    title: "SEO health",
    description:
      "Understand what search engines and readers can find on your page.",
  },
  patches: {
    eyebrow: "SMALL CHANGES. BETTER ANSWERS.",
    title: "Patch studio",
    description: "Review a suggestion. Make it yours. Publish on your terms.",
  },
  leaderboard: {
    eyebrow: "",
    title: "The Folio Index",
    description:
      "Recorded answers, recommendations and page checks.",
  },
  evaluations: {
    eyebrow: "THE EVIDENCE BEHIND THE ANSWER",
    title: "Website checks",
    description:
      "Check your website, then review findings and supporting evidence here.",
  },
  benchmarks: { eyebrow: "YOUR RESEARCH QUESTIONS", title: "Search rankings", description: "See where your website appears in recorded AI answers and which sites appear alongside it." },
  agents: {
    eyebrow: "MEET YOUR RESEARCH TEAM",
    title: "Your agents",
    description:
      "Follow your evaluations, their progress, and the evidence they return.",
  },
  "search-data": {
    eyebrow: "THE SEARCH LANDSCAPE",
    title: "The bigger picture behind your search.",
    description:
      "Explore organic coverage and the links that lead to your website.",
  },
  "search-console": {
    eyebrow: "GOOGLE SEARCH CONSOLE",
    title: "How people find your website.",
    description: "Import clicks, impressions, search queries, and pages from your Google account.",
  },
  settings: {
    eyebrow: "MAKE YOURSELF AT HOME",
    title: "Your workspace, connected.",
    description: "Manage your account and the sources behind your reports.",
  },
};

function FolioMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`folio-mark ${small ? "small" : ""}`} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
function Brand({ name, small = false }: { name: string; small?: boolean }) {
  const b = brands.find((b) => b.name === name) ?? brands[7];
  return (
    <span
      className={`brand-icon ${small ? "small" : ""}`}
      style={{ color: b.color }}
    >
      {b.name === "Acme" ? b.letter : <CompanyFavicon url={`https://${b.domain}`} name={b.name}/>}
    </span>
  );
}
function Change({ value, suffix = "" }: { value: number; suffix?: string }) {
  return (
    <span className={`change ${value < 0 ? "down" : ""}`}>
      {value < 0 ? <ArrowDown size={11} /> : <ArrowUp size={11} />}{" "}
      {Math.abs(value)}
      {suffix}
    </span>
  );
}
function SampleLabel() {
  return (
    <span className="sample-label">
      <span /> Sample data
    </span>
  );
}
function Button({
  children,
  onClick,
  kind = "primary",
  disabled = false,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  kind?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={`button ${kind}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/** The public overview mounts no account hooks or private workspace effects. */
export function Dashboard({ section }: { section: string }) {
  const query = useSearchParams();
  const views = query.getAll("view");
  const view = views.length === 1 ? views[0] : null;
  const workspace = view === "workspace" || query.has("website") || query.has("scope");
  if (section === "leaderboard") return <PublicOverviewShell section="leaderboard" />;
  // A signed-in visitor belongs in their workspace; only signed-out visitors get
  // the public benchmark shell, and the pending state must not flash it first.
  const { data: session, isPending } = authClient.useSession();
  if (section === "overview" && view !== "demo" && !workspace) {
    if (isPending) return <WorkspaceLoader />;
    if (!session) return <PublicOverviewShell />;
  }
  return <WorkspaceDashboard section={section} />;
}

function PublicOverviewShell({ section = "overview" }: { section?: "overview" | "leaderboard" }) {
  const index = section === "leaderboard";
  const [methodOpen, setMethodOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  return <div className="app-shell folio-workspace public-overview-shell" data-nav-compact="true">
    {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
    <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
      <Link href="/" className="wordmark" aria-label="Folio home"><FolioMark /><span>folio<span className="wordmark-period">.</span></span></Link>
      <span className="nav-caption">PUBLIC</span>
      <nav aria-label="Public navigation">
        <Link href="/overview" title="Public dashboard" className={`nav-link ${!index ? "active" : ""}`} aria-current={!index ? "page" : undefined} onClick={() => setMobileOpen(false)}><LayoutDashboard size={17}/><span>Public dashboard</span></Link>
        <Link href="/leaderboard" title="The Folio Index" className={`nav-link ${index ? "active" : ""}`} aria-current={index ? "page" : undefined} onClick={() => setMobileOpen(false)}><Trophy size={17}/><span>The Folio Index</span></Link>
        <Link href="/docs/api" title="API reference" className="nav-link" onClick={() => setMobileOpen(false)}><Code2 size={17}/><span>API reference</span></Link>
      </nav>
      <div className="public-sidebar-guide"><Compass size={20} /><strong>Your website, in perspective.</strong><p>Prepare questions and keep your own evidence in a private workspace.</p><Link href="/start">Explore your website <ArrowRight size={14} /></Link></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><DashboardNavigation/><button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={21}/></button><Globe2 size={15}/><span>Public benchmarks</span></div><div className="topbar-actions"><Link className="public-workspace-link squishy-control" href="/overview?view=workspace" aria-label="My workspace" title="My workspace"><span>My workspace</span><LayoutDashboard size={16}/></Link><DashboardAppearance /></div></header>
      <main className={`page-content${index ? " index-page" : ""}`}>
        <div className="page-heading"><div><h1>{index ? "The Folio Index" : "Benchmark dashboard"}</h1><p>{index ? "Public search answers and website page checks." : "Recorded answers, citations and run status."}</p></div></div>
        {index ? <Leaderboard onMethod={() => setMethodOpen(true)} onNotify={setNotice} /> : <PublicBenchmarkDashboard />}
        {notice && <p role="status">{notice}</p>}
        {methodOpen && <Dialog title="The thinking behind the numbers." onClose={() => setMethodOpen(false)}><Methodology /></Dialog>}
        <footer className="page-footer"><span><FolioMark small/></span><Link href="/overview?view=demo">Demo report<ArrowUpRight size={12}/></Link></footer>
      </main>
    </div>
  </div>;
}

function WorkspaceDashboard({ section }: { section: string }) {
  const router = useRouter();
  const query = useSearchParams();
  const demoRequested = query.getAll("view").length === 1 && query.get("view") === "demo";
  const chartsDemo = demoRequested && query.getAll("demo").length === 1 && query.get("demo") === "charts";
  const usageDemo = section === "overview" && demoRequested && query.getAll("demo").length===1 && query.get("demo")==="team";
  const analyticsDemo = section === "overview" && demoRequested && query.getAll("demo").length===1 && query.get("demo")==="analytics";
  const revenueDemo = section === "overview" && demoRequested && query.get("demo") === "revenue";
  const teamDemo = section === "overview" && demoRequested && !chartsDemo;
  const privateOverview = section === "overview" && !demoRequested;
  const personalWorkspace = privateOverview || section === "websites";
  const { data: session, isPending } = authClient.useSession();
  const [modal, setModal] = useState<Modal>(null);
  const [auditTarget, setAuditTarget] = useState<{ ownerId: string | null; url: string } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [period, setPeriod] = useState("28d");
  const [compare, setCompare] = useState(true);
  const [toast, setToast] = useState("");
  const [storedScans, setScans] = useState<Scan[]>([]);
  const [storedActiveScan, setActiveScan] = useState<Scan | null>(null);
  const [scanOwnerId, setScanOwnerId] = useState<string | null>(null);
  const [scanError, setScanError] = useState("");
  const [loadingScans, setLoadingScans] = useState(false);
  const [scanRefresh, setScanRefresh] = useState(0);
  const ownerId = session?.user.id ?? null;
  const scans = !isPending && scanOwnerId === ownerId ? storedScans : [];
  const activeScan = !isPending && scanOwnerId === ownerId ? storedActiveScan : null;
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"sample" | "measured">("sample");
  const [agentStatus, setAgentStatus] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }
  useEffect(() => {
    if (isPending) return;
    let cancelled = false;
    const controller = new AbortController();
    setScans([]);
    setActiveScan(null);
    setScanOwnerId(ownerId);
    setScanError("");
    setMode(ownerId && !demoRequested ? "measured" : "sample");
    setLoadingScans(!!ownerId && !demoRequested);
    if (!ownerId || demoRequested) return;
    fetch("/api/scans", { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error("Your saved audits could not be loaded."); return r.json(); })
      .then((d) => {
        if (cancelled) return;
        const list: Scan[] = Array.isArray(d) ? d : (d.scans ?? []);
        setScans(list);
        const saved = sessionStorage.getItem(`folio-active-${ownerId}`);
        setActiveScan(list.find((s) => s.id === saved) ?? list[0] ?? null);
      })
      .catch(() => { if (!cancelled) setScanError("Your saved audits could not be loaded."); })
      .finally(() => { if (!cancelled) setLoadingScans(false); });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ownerId, isPending, scanRefresh, demoRequested]);
  useEffect(() => {
    fetch("/api/agents/status")
      .then((r) => r.json())
      .then((d) => setAgentStatus(Boolean(d.configured)))
      .catch(() => {});
  }, []);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setModal("search");
      }
      if (e.key === "Escape") {
        setModal(null);
        setMobileOpen(false);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const actual = !demoRequested && mode === "measured" ? activeScan : null;
  async function exportReport() {
    if (!demoRequested && mode === "measured" && !actual) {
      notify("Run or select an audit to export its evidence.");
      return;
    }
    const data = actual ?? {
      source: "Illustrative sample data — not measured company rankings",
      site: "acme.com",
      seoScore: 86,
      aiVisibility: 72.8,
      checks: sampleChecks,
    };
    download(
      JSON.stringify(data, null, 2),
      "folio-report.json",
      "application/json",
    );
    notify("Your report has been downloaded.");
  }
  function prepareAudit(url = activeScan?.url ?? "") {
    if(activeScan && url===activeScan.url)trackProductEvent("followup_prepared",{flow:"fresh"});
    setAuditTarget({ ownerId, url });
    setModal("scan");
  }
  function openScan(scan: Scan) {
    setScanOwnerId(ownerId);
    setActiveScan(scan);
    setMode("measured");
    if (session)
      sessionStorage.setItem(`folio-active-${session.user.id}`, scan.id);
    router.push("/seo");
  }
  if (section === "login") return <Login onNotify={notify} />;
  if (isPending && !demoRequested) return <WorkspaceLoader />;
  const title = section === "overview" && demoRequested ? { ...titles.overview, title: chartsDemo ? "Demo report" : "Try Folio", description: chartsDemo ? "Illustrative sample data." : "One customer question. One useful next step." } : titles[section] ?? titles.overview;
  return (
    <div className="app-shell folio-workspace" data-nav-compact="true" suppressHydrationWarning>
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <Link href="/" className="wordmark" aria-label="Folio home">
          <FolioMark />
          <span>
            folio<span className="wordmark-period">.</span>
          </span>
        </Link>
        <WebsiteSwitcher
          key={isPending ? "pending" : ownerId ?? "signed-out"}
          ownerId={isPending ? null : ownerId}
          name={session?.user.name || "Your"}
          activeUrl={activeScan?.url}
          onSelect={(site, scan) => {
            setMobileOpen(false);
            if (scan) openScan(scan);
            else {
              setActiveScan(null);
              if (ownerId) sessionStorage.removeItem(`folio-active-${ownerId}`);
              router.push(evaluationHref({ targetUrl: site.url }).replace("/evaluations", "/search-data"));
            }
          }}
          onAdd={() => { setMobileOpen(false); prepareAudit(""); }}
        />
        <span className="nav-caption">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {navigation.filter(item => ["overview","websites","evaluations"].includes(item.section)).map((item) => (
            <Link
              key={item.section}
              title={item.label}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`nav-link ${section === item.section && !(item.section === "overview" && demoRequested) ? "active" : ""}`}
              aria-current={section === item.section && !(item.section === "overview" && demoRequested) ? "page" : undefined}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
            </Link>
          ))}
        <Link href="/overview?view=demo" className={`nav-link ${teamDemo?"active":""}`} aria-current={teamDemo?"page":undefined} onClick={()=>setMobileOpen(false)} title="Content demo"><Sparkles size={17}/><span>Content demo</span></Link>
        </nav>

        <details className="sidebar-more" open={!["overview","websites","evaluations","settings"].includes(section)}><summary className="nav-link" title="More tools"><MoreHorizontal size={17}/><span>More tools</span></summary><nav aria-label="More tools">{navigation.filter(item=>!["overview","websites","evaluations"].includes(item.section)).map(item=><Link key={item.section} href={item.href} title={item.label} className={`nav-link ${section===item.section?"active":""}`} aria-current={section===item.section?"page":undefined} onClick={()=>setMobileOpen(false)}><item.icon size={17}/><span>{item.label}</span></Link>)}<Link href="/leaderboard" title="The Folio Index" className="nav-link" onClick={()=>setMobileOpen(false)}><Trophy size={17}/><span>The Folio Index</span></Link><Link href="/agents" title="Your agents" className="nav-link" onClick={()=>setMobileOpen(false)}><Bot size={17}/><span>Your agents</span></Link><Link href="/orgs" title="Organizations" className="nav-link" onClick={()=>setMobileOpen(false)}><Building2 size={17}/><span>Organizations</span></Link><Link href="/docs/api" title="API reference" className="nav-link" onClick={()=>setMobileOpen(false)}><Code2 size={17}/><span>API reference</span></Link><Link href="/pricing" title="Plans & usage" className="nav-link" onClick={()=>setMobileOpen(false)}><BookOpen size={17}/><span>Plans & usage</span></Link></nav></details>
        <div className="sidebar-bottom">
          {isAdminOwner(session?.user.email) && <Link className="nav-link" href="/folio-internal/analytics" title="Product analytics"><BarChart3 size={17}/><span>Product analytics</span></Link>}
          {isAdminOwner(session?.user.email) && <Link href="/admin" title="Admin" className="nav-link" onClick={()=>setMobileOpen(false)}><ShieldCheck size={17}/><span>Admin</span></Link>}
          <Link
            href="/settings"
            className={`nav-link ${section === "settings" ? "active" : ""}`}
            aria-current={section === "settings" ? "page" : undefined}
            onClick={() => setMobileOpen(false)}
          >
            <Settings2 size={17} />
            <span>Settings & connections</span>
          </Link>
          <button
            className="nav-link help-link"
            onClick={() => setModal("methodology")}
          >
            <CircleHelp size={17} />
            <span>A little guidance</span>
          </button>
          <Link href={session ? "/settings" : "/login"} className="profile">
            <span className="avatar">
              {session?.user.name?.slice(0, 1) ?? (teamDemo ? "M" : personalWorkspace ? "—" : "A")}
            </span>
            <span>
              {session?.user.name ?? (teamDemo ? "Demo teammate" : personalWorkspace ? "Sign in" : "Alex Morgan")}
              <small>{session?.user.email ?? (teamDemo ? "Hypothetical marketer workflow" : personalWorkspace ? "Your private workspace" : "Exploring the demo")}</small>
            </span>
            <MoreHorizontal size={17} />
          </Link>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <DashboardNavigation/>
            <button
              className="mobile-menu icon-button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>
            <Globe2 size={15} />
            <button onClick={() => router.push("/websites")}>
              {usageDemo ? "Team credits · Sample" : analyticsDemo ? "Product analytics · Sample" : section==="analytics" ? "Folio operator analytics" : revenueDemo ? "Revenue · Sample" : teamDemo ? "Manus · Workflow mock" : personalWorkspace ? "Your workspace" : actual ? safeHostname(actual.url, "Your workspace") : session ? "Your workspace" : "acme.com"}
            </button>
            <ChevronRight size={13} />
            <span>
              {section === "leaderboard"
                ? "The Folio Index"
                : (navigation.find((n) => n.section === section)?.label ??
                  (section === "agents" ? "Your agents" : "Settings"))}
            </span>
          </div>
          <div className="topbar-actions">
            <DashboardAppearance />
            <button
              className="search-trigger"
              onClick={() => setModal("search")}
            >
              <Search size={15} />
              <span>Find anything</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="topbar-divider" />
            <NotificationBell
              count={actual?.patches?.length ?? (mode === "sample" && !personalWorkspace && !teamDemo ? 3 : 0)}
              size={30}
              color="green"
              onClick={() => setModal("notifications")}
              className="notification-bell"
            />
            <Link
              href={session ? "/settings" : "/login"}
              className="avatar top-avatar"
              aria-label="Account"
            >
              {session?.user.name?.[0] ?? (teamDemo ? "M" : personalWorkspace ? "—" : "A")}
            </Link>
          </div>
        </header>
        <main className={`page-content${["evaluations", "benchmarks", "overview"].includes(section) ? " evaluation-page" : ""}${section === "overview" ? " overview-page" : ""}${section === "leaderboard" ? " index-page" : ""}`}>
          {!teamDemo && section!=="analytics" && <div className="page-heading">
            <div>
              <h1>{title.title}</h1>
              <p>{title.description}</p>
            </div>
            <div className="heading-actions">
              {section === "evaluations" ? null : section === "websites" ? (
                <>{ownerId ? <Link href="/start?step=1" className="button secondary squishy-control">Add a website <Plus size={16}/></Link> : <Link href="/login" className="button secondary">Sign in <ArrowRight size={14}/></Link>}</>
              ) : section === "benchmarks" ? (
                <Link href="/docs/api" className="button secondary">API reference <ArrowRight size={14} /></Link>
              ) : section === "overview" && !demoRequested ? (
                <Link href="/websites" className="button secondary">My websites <ArrowRight size={14} /></Link>
              ) : section === "overview" && demoRequested ? (
                <>{chartsDemo && <Button kind="secondary" onClick={exportReport}><ArrowDownToLine size={14}/>Export sample report</Button>}<Link href={workspaceOverviewHref(query)} className="button secondary">My actual results <ArrowRight size={14} /></Link></>
              ) : section === "agents" ? (
                <Link href="/pricing" className="button secondary">
                  Plans & usage <ArrowUpRight size={14} />
                </Link>
              ) : section === "search-data" || section === "search-console" ? (
                <Link href="/settings" className="button secondary">
                  Manage access <Settings2 size={14} />
                </Link>
              ) : section === "leaderboard" ? (
                <Link href="/evaluations" className="button secondary">
                  Evaluate a website <ArrowUpRight size={15} />
                </Link>
              ) : (
                <>
                  <Button kind="secondary" onClick={exportReport}>
                    <ArrowDownToLine size={15} />
                    Export report
                  </Button>
                  <Button onClick={() => prepareAudit()}>
                    <Plus size={16} />
                    Run an audit
                  </Button>
                </>
              )}
            </div>
          </div>}
          {section === "overview" && !teamDemo && <nav className="real-overview-tabs" aria-label="Overview view"><Link href={workspaceOverviewHref(query)} aria-current={!demoRequested ? "page" : undefined}>My website results</Link><Link href="/overview?view=demo" aria-current={demoRequested ? "page" : undefined} onClick={() => setMode("sample")}>Demo report</Link></nav>}
          {section === "overview" && chartsDemo && <OverviewDemoNotice/>}
          {section === "overview" && !demoRequested && <StartHere ownerId={ownerId} />}
          {section === "overview" && !demoRequested && <WorkspaceRecords ownerId={ownerId} />}
          {usageDemo ? <TeamUsageDemo/> : analyticsDemo ? <ProductAnalyticsPanel sample/> : revenueDemo ? <RevenueGlobeDemo/> : teamDemo ? <ManusDashboardDemo actualHref={workspaceOverviewHref(query)}/> : section === "overview" && !demoRequested ? <RealOverview ownerId={ownerId} scans={scans} scansLoading={loadingScans} scansError={scanOwnerId === ownerId ? scanError : ""} onRetryScans={() => setScanRefresh(value => value + 1)} onOpenScan={openScan} /> : <>

          {scanOwnerId === ownerId && scanError && ["overview", "websites", "seo", "patches"].includes(section) && (
            <div className="workspace-read-error" role="alert">{scanError}<Button kind="secondary" onClick={() => setScanRefresh(n => n + 1)}>Retry audits</Button></div>
          )}
          {["visibility", "seo", "patches"].includes(section) && (
            <div className="report-context">
              <div className="report-tabs">
                <button
                  className={mode === "sample" ? "selected" : ""}
                  onClick={() => setMode("sample")}
                >
                  Demo report
                </button>
                <button
                  className={mode === "measured" ? "selected" : ""}
                  onClick={() => {
                    setMode("measured");
                    if (scans.length) setActiveScan(scans[0]);
                  }}
                >
                  My audit results
                  {scans.length > 0 && <span>{scans.length}</span>}
                </button>
              </div>
              {mode === "sample" ? (
                <SampleLabel />
              ) : (
                <span className="measured-label">
                  <ShieldCheck size={13} />{" "}
                  {scans.length
                    ? "Saved audit evidence"
                    : "Your real results will appear here"}
                </span>
              )}
            </div>
          )}
          {actual && ["overview", "seo", "patches"].includes(section) && <AuditEvaluationBridge scan={actual} />}
          {mode === "measured" &&
          !activeScan &&
          ["overview", "seo", "visibility", "patches"].includes(section) ? (
            <EmptyState
              icon={<Compass size={29} />}
              title={loadingScans ? "Loading your saved audits…" : "Your first chapter starts here."}
              text={session ? "Run a website audit to measure technical health. Agent evaluations are saved separately in Evaluations." : "Sign in and run a website audit to start building your own report. Every result is saved with its source evidence."}
              action={
                <Button onClick={() => prepareAudit()}>
                  Run your first audit <ArrowRight size={15} />
                </Button>
              }
            />
          ) : (
            <>
              {section === "overview" && (
                <>
                  <div className="metric-grid">
                    <Metric
                      label="AI visibility"
                      value={72.8}
                      suffix="%"
                      change={12.6}
                      description="of tracked answers mention you"
                      primary
                      actual={!!actual}
                    />
                    <Metric
                      label="SEO health"
                      value={actual?.seoScore ?? 86}
                      suffix="/100"
                      change={8}
                      description="a healthy foundation for discovery"
                      variant={1}
                      measured={!!actual}
                    />
                    <Metric
                      label="Total citations"
                      value={238}
                      change={18.4}
                      description="across your monitored prompts"
                      variant={2}
                      actual={!!actual}
                    />
                    <Metric
                      label="Your index rank"
                      value={8}
                      prefix="#"
                      suffix=" / 12"
                      change={4}
                      description="among the sample websites"
                      rank
                      actual={!!actual}
                    />
                  </div>
                  <div className="overview-grid">
                    <section className="panel trend-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            Visibility over time{" "}
                            <span
                              className="info"
                              title="Illustrative sample history. SEO health is a technical score; AI visibility is a share of sample answers."
                            >
                              <Info size={13} />
                            </span>
                          </h2>
                          <p>A clearer picture, one answer at a time.</p>
                        </div>
                        <div className="segmented">
                          {["7d", "14d", "28d"].map((p) => (
                            <button
                              key={p}
                              className={period === p ? "active" : ""}
                              onClick={() => setPeriod(p)}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                      {actual ? (
                        <EmptyState
                          compact
                          icon={<BarChart3 size={25} />}
                          title="History grows with every audit."
                          text={`Latest measured SEO health: ${actual.seoScore}/100. The current evidence suite does not measure consumer-AI visibility.`}
                        />
                      ) : (
                        <>
                          <div className="chart-legend">
                            <span>
                              <i className="legend-line aeo" />
                              AI visibility
                            </span>
                            <span>
                              <i className="legend-line seo" />
                              SEO health
                            </span>
                            {compare && (
                              <span>
                                <i className="legend-line industry" />
                                Industry average
                              </span>
                            )}
                          </div>
                          <VisibilityChart period={period} compare={compare} />
                        </>
                      )}
                      <div className="chart-footer">
                        <span>
                          <span className="status-dot" />{" "}
                          {actual
                            ? "Source-backed audit"
                            : "Sample period · Aug 17 – Sep 13, 2026"}
                        </span>
                        {!actual && <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={compare}
                            onChange={(e) => setCompare(e.target.checked)}
                          />
                          Compare to industry
                        </label>}
                      </div>
                    </section>
                    <section className="panel index-panel">
                      <div className="panel-heading">
                        <div>
                          <div className="eyebrow tiny">THE FOLIO INDEX</div>
                          <h2>Good company. Better visibility.</h2>
                        </div>
                        <Trophy size={18} />
                      </div>
                      <p className="index-description">
                        Illustrative benchmark · these are sample scores.
                      </p>
                      <div className="mini-leaderboard">
                        {brands.slice(0, 5).map((b, i) => (
                          <Link
                            href="/leaderboard"
                            className="mini-rank-row"
                            key={b.name}
                          >
                            <span className="rank-position">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <Brand name={b.name} small />
                            <span className="mini-brand">{b.name}</span>
                            <span className="mini-score">{b.score}</span>
                            <Change value={b.change} />
                          </Link>
                        ))}
                        <div className="rank-ellipsis">···</div>
                        <Link
                          href="/leaderboard"
                          className="mini-rank-row your-rank"
                        >
                          <span className="rank-position">08</span>
                          <Brand name="Acme" small />
                          <span className="mini-brand">
                            Acme <small>SAMPLE</small>
                          </span>
                          <span className="mini-score">72.8</span>
                          <Change value={4} />
                        </Link>
                      </div>
                      <Link href="/leaderboard" className="panel-link">
                        See the full leaderboard <ArrowUpRight size={14} />
                      </Link>
                    </section>
                  </div>
                  <div className="bottom-grid">
                    <section className="next-step">
                      <div className="next-step-copy">
                        <span className="eyebrow">YOUR NEXT BEST MOVE</span>
                        <h2>
                          Great answers start
                          <br />
                          with a clearer story.
                        </h2>
                        <p>
                          {actual
                            ? `${actual.patches?.length ?? 0} suggested improvements from your latest audit.`
                            : "3 considered improvements are ready for your review."}
                        </p>
                        <Link className="button cream" href="/patches">
                          Open patch studio <ArrowUpRight size={15} />
                        </Link>
                      </div>
                      <div className="report-motif" aria-hidden="true">
                        <div className="motif-bars">
                          {[25, 38, 43, 59, 64, 79, 88, 100].map((n, i) => (
                            <i key={i} style={{ height: `${n}%` }} />
                          ))}
                        </div>
                        <span>ROOM TO GROW</span>
                        <div className="motif-circle" />
                      </div>
                    </section>
                    <section className="panel engine-panel">
                      <div className="panel-heading">
                        <h2>Where you’re being found</h2>
                        <Link
                          href="/visibility"
                          aria-label="Explore AI engines"
                        >
                          <ArrowUpRight size={17} />
                        </Link>
                      </div>
                      <p className="muted small-text">
                        Share of sample citations by answer engine
                      </p>
                      {[
                        {
                          name: "ChatGPT",
                          symbol: "✳",
                          value: 44,
                          color: "var(--folio-accent)",
                        },
                        {
                          name: "Perplexity",
                          symbol: "▥",
                          value: 29,
                          color: "var(--folio-charcoal)",
                        },
                        {
                          name: "Claude",
                          symbol: "✳",
                          value: 18,
                          color: "var(--folio-text-muted)",
                        },
                        {
                          name: "Gemini",
                          symbol: "✦",
                          value: 9,
                          color: "var(--folio-edge-strong)",
                        },
                      ].map((e) => (
                        <div className="engine-row" key={e.name}>
                          <span className="engine-symbol">{e.symbol}</span>
                          <span>{e.name}</span>
                          <div className="engine-track">
                            <i
                              style={{
                                width: `${e.value * 2}%`,
                                background: e.color,
                              }}
                            />
                          </div>
                          <strong>{actual ? "—" : `${e.value}%`}</strong>
                        </div>
                      ))}
                    </section>
                  </div>
                  <section className="panel prompts-preview">
                    <div className="panel-heading">
                      <div>
                        <h2>The questions that bring people to you</h2>
                        <p>A few of the conversations worth being part of.</p>
                      </div>
                      <Link href="/visibility" className="text-link">
                        Explore all prompts <ArrowRight size={14} />
                      </Link>
                    </div>
                    <PromptTable sample={!actual} />
                  </section>
                </>
              )}
              {section === "leaderboard" && (
                <Leaderboard
                  onMethod={() => setModal("methodology")}
                  onNotify={notify}
                />
              )}
              {section === "websites" && (
                <Websites
                  scans={scans}
                  session={!!session}
                  onScan={prepareAudit}
                  onOpen={openScan}
                  onNotify={notify}
                />
              )}
              {section === "visibility" && (
                <>
                  <div className="insight-banner">
                    <Sparkles size={25} />
                    <div>
                      <strong>Your next customer is already asking.</strong>
                      <p>
                        Track the buyer questions that matter, then see which
                        brands make the answer.
                      </p>
                    </div>
                    <Button
                      kind="secondary"
                      onClick={() => router.push("/agents")}
                    >
                      Connect an agent <ArrowUpRight size={14} />
                    </Button>
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Your prompt library</h2>
                        <p>
                          Five buyer questions · four answer engines ·
                          illustrative results
                        </p>
                      </div>
                      <SampleLabel />
                    </div>
                    <PromptTable sample={!actual} />
                  </section>
                  <div className="evidence-note">
                    <Info size={17} />
                    <p>
                      These are sample answers to demonstrate the monitoring
                      workflow. Live AI discovery requires fresh provider
                      results with timestamps and citations. A technical website
                      audit does not measure search rankings.
                    </p>
                  </div>
                </>
              )}
              {section === "seo" && (
                <>
                  <div className="seo-summary">
                    <div
                      className="score-ring"
                      style={
                        {
                          "--score": `${actual?.seoScore ?? 86}%`,
                        } as React.CSSProperties
                      }
                    >
                      <span>
                        {actual?.seoScore ?? 86}
                        <small>OUT OF 100</small>
                      </span>
                    </div>
                    <div>
                      <span className="eyebrow">TECHNICAL SEO HEALTH</span>
                      <h2>
                        {(actual?.seoScore ?? 86) >= 80
                          ? "A strong foundation. A few finishing touches."
                          : "A few improvements can make a real difference."}
                      </h2>
                      <p>
                        {actual
                          ? `${actual.title || safeHostname(actual.url, "This page")} · ${actual.wordCount} readable words · ${new Date(actual.createdAt).toLocaleString()}`
                          : "6 core checks passed. Explore the opportunities below."}
                      </p>
                    </div>
                    <Button
                      kind="secondary"
                      onClick={() => router.push("/patches")}
                    >
                      Review improvements <ArrowRight size={14} />
                    </Button>
                  </div>
                  <SeoChecks key={actual?.id ?? "sample"} checks={actual?.checks ?? sampleChecks} sample={!actual} />
                </>
              )}
              {section === "patches" && (
                <PatchStudio
                  key={actual?.id ?? "demo"}
                  patches={actual?.patches ?? samplePatches}
                  sample={!actual}
                  onNotify={notify}
                />
              )}
              {section === "analytics" && <ProductAnalyticsPanel key={ownerId??"signed-out"} ownerId={ownerId}/>}
              {section === "agents" && <><KeywordActivitySummary /><AgentRunsPanel /></>}
              {section === "evaluations" && (
                <EvaluationsPanel initialTargetUrl={actual?.url} />
              )}
              {section === "orgs" && <OrgPreview />}
              {section === "search-data" && <SeoDataPanel />}
              {section === "search-console" && <SearchConsolePanel />}
              {section === "benchmarks" && <KeywordBenchmarksPanel websiteId={query.get("website") ?? undefined} />}
              {section === "settings" && <XStandingPanel />}
              {section === "settings" && (
                <Settings
                  session={session}
                  pending={isPending}
                  agentStatus={agentStatus}
                  onNotify={notify}
                />
              )}
            </>
          )}
          </>}
          <footer className="page-footer">
            <span>
              <FolioMark small />
            </span>
            <button onClick={() => setModal("methodology")}>
              Methodology{" "}
              <ArrowUpRight size={12} />
            </button>
          </footer>
        </main>
      </div>
      {modal && (
        <Dialog
          title={
            modal === "scan"
              ? "Let’s take a closer look."
              : modal === "methodology"
                ? "The thinking behind the numbers."
                : modal === "notifications"
                  ? "A few things worth your attention."
                  : "Find your next step."
          }
          onClose={() => setModal(null)}
        >
          {modal === "scan" && (
            <ScanForm
              key={ownerId ?? "signed-out"}
              initialUrl={auditTarget?.ownerId === ownerId ? auditTarget.url : ""}
              signedIn={!!session}
              onComplete={(scan) => {
                setScanOwnerId(ownerId);
                setScans((s) => [scan, ...s]);
                setActiveScan(scan);
                setMode("measured");
                if (session)
                  sessionStorage.setItem(
                    `folio-active-${session.user.id}`,
                    scan.id,
                  );
                setModal(null);
                router.push("/seo");
                notify("Audit saved. Your results are ready.");
              }}
            />
          )}
          {modal === "methodology" && <Methodology />}
          {modal === "notifications" && (
            <div className="notification-list">
              <p className="muted">
                {actual ? "From your latest audit" : mode === "sample" && !personalWorkspace && !teamDemo ? "From the sample report" : "No saved audit suggestions yet"}
              </p>
              {(actual?.patches ?? (mode === "sample" && !personalWorkspace && !teamDemo ? samplePatches : [])).map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setModal(null);
                    router.push("/patches");
                  }}
                >
                  <WandSparkles size={19} />
                  <span>
                    <strong>{p.title}</strong>
                    <small>Ready for your review · {p.target}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          )}
          {modal === "search" && (
            <>
              <LabelInput field="Search pages" value={search} onValueChange={setSearch} autoFocus placeholder="Search pages, tools, or reports…" corner={10} />
              <div className="search-results">
                {[
                  ...navigation,
                  {
                    label: "The Folio Index",
                    href: "/leaderboard",
                    section: "leaderboard",
                    icon: Trophy,
                  },
                  {
                    label: "Your agents",
                    href: "/agents",
                    section: "agents",
                    icon: Bot,
                  },
                ]
                  .filter((n) =>
                    n.label.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((n) => (
                    <Link
                      key={n.section}
                      href={n.href}
                      onClick={() => setModal(null)}
                    >
                      <n.icon size={18} />
                      {n.label}
                      <ArrowRight size={14} />
                    </Link>
                  ))}
              </div>
            </>
          )}
        </Dialog>
      )}
      {section !== "leaderboard" && <AgentRunDock />}
      {toast && (
        <div className="toast" role="status">
          <CheckCheck size={18} />
          {toast}
          <button onClick={() => setToast("")} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  suffix = "",
  prefix = "",
  change,
  description,
  primary = false,
  rank = false,
  variant = 0,
  actual = false,
  measured = false,
}: {
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  change: number;
  description: string;
  primary?: boolean;
  rank?: boolean;
  variant?: number;
  actual?: boolean;
  measured?: boolean;
}) {
  return (
    <section className={`metric-card ${primary ? "primary" : ""}`}>
      <div className="metric-label">
        {label}
        <span
          title={actual ? "Not measured by the current suite" : measured ? "Saved technical audit" : "Illustrative sample metric"}
        >
          <Info size={13} />
        </span>
      </div>
      <div className="metric-middle">
        <div className="metric-value">
          {actual ? (
            "—"
          ) : (
            <>
              <span className="metric-prefix">{prefix}</span>
              <AnimatedCounter value={value} decimals={value % 1 ? 1 : 0} />
              <span
                className={`metric-suffix ${suffix === "%" ? "percent" : ""}`}
              >
                {suffix}
              </span>
            </>
          )}
        </div>
        {!actual && !measured && (rank ? (
          <div className="rank-glyph" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        ) : (
          <Sparkline variant={variant} light={primary} />
        ))}
      </div>
      <div className="metric-bottom">
        {!actual && !measured && (
          <Change
            value={change}
            suffix={rank ? " places" : primary ? "%" : variant === 2 ? "%" : ""}
          />
        )}
        <span>
          {actual
            ? "Not measured by this suite"
            : measured
              ? "From your captured page"
            : rank
              ? "since last sample period"
              : "vs. previous period"}
        </span>
      </div>
      <p>{actual ? "Website evidence does not measure search visibility" : measured ? "Technical readiness · not search rank" : description}</p>
    </section>
  );
}

function AuditEvaluationBridge({ scan }: { scan: Scan }) {
  return (
    <section className="audit-evaluation-bridge" aria-label="Continue this website evaluation">
      <div><span className="eyebrow tiny">FROM AUDIT TO EVIDENCE</span><h2>{safeHostname(scan.url, "This website")}</h2><p>Check what an agent can verify from this page. After applying reviewed changes, capture it again and compare the evidence.</p></div>
      <div className="audit-bridge-actions">
        <Link className="button primary" href={evaluationHref({ targetUrl: scan.url })}>Evaluate this website <ArrowUpRight size={14} /></Link>
        <Link className="button secondary" href={evaluationHref({ targetUrl: scan.url }).replace("/evaluations", "/search-data")}>Search & backlinks <ArrowRight size={14} /></Link>
        <small>Opens a prepared form. You choose when to run it.</small>
      </div>
    </section>
  );
}

function PromptTable({ sample = true }: { sample?: boolean }) {
  return (
    <div className="table-scroll">
      <table className="prompt-table">
        <thead>
          <tr>
            <th>BUYER QUESTION</th>
            <th>INTENT</th>
            <th>YOUR VISIBILITY</th>
            <th>LEADING BRAND</th>
            <th>STATUS</th>
          </tr>
        </thead>
        <tbody>
          {prompts.map((p) => (
            <tr key={p.text}>
              <td>{p.text}</td>
              <td>
                <span className="intent-tag">{p.intent}</span>
              </td>
              <td>
                <span className="prompt-meter">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <i
                      key={i}
                      className={sample && i < p.mentions ? "filled" : ""}
                    />
                  ))}
                </span>
                <small>{sample ? `${p.mentions}/${p.total}` : "—"}</small>
              </td>
              <td>
                <span className="table-brand">
                  <Brand name={p.winner} small />
                  {sample ? p.winner : "Not measured"}
                </span>
              </td>
              <td>
                <span
                  className={`status-pill ${p.status === "Absent" ? "warning" : p.status === "Cited" ? "pass" : ""}`}
                >
                  {sample ? p.status : "Pending"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A saved record can arrive without a parseable URL (an in-flight scan, a legacy
 * row). One bad row must not take down the shell, so hostnames degrade. */
function safeHostname(value: string | null | undefined, fallback = ""): string {
  if (!value) return fallback;
  try { return new URL(value).hostname; } catch { return fallback; }
}

function Leaderboard(_props: {onMethod:()=>void;onNotify:(s:string)=>void}) {
  const params = useSearchParams();
  const requestedView = params.get("indexView");
  const indexView = requestedView === "rankings" || requestedView === "html" || requestedView === "published" ? requestedView : "indexed";
  function selectView(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "indexed") next.delete("indexView"); else next.set("indexView", value);
    window.history.pushState(null, "", `/leaderboard${next.size ? `?${next}` : ""}`);
  }
  return <>
    <div className="index-view-tabs" role="group" aria-label="Evaluation view">
      {([["indexed","Indexed domains"],["rankings","Sample rankings"],["html","HTML page checks"],["published","Published page audits"]] as const).map(([value,label])=><button key={value} type="button" id={`index-view-${value}`} aria-pressed={indexView===value} aria-controls="index-view-panel" onClick={()=>selectView(value)}>{label}</button>)}
    </div>
    <section id="index-view-panel" className="index-view-panel" role="region" aria-labelledby={`index-view-${indexView}`}>
      {indexView==="indexed"?<IndexedDomains/>:indexView==="rankings"?<LivePublicIndex><ModelLandscape/><RankedSearchTable/></LivePublicIndex>:indexView==="html"?<DeveloperToolsIndex/>:<PublishedIndex/>}
    </section>
  </>;
}

function Websites({
  scans,
  session,
  onScan,
  onOpen,
  onNotify,
}: {
  scans: Scan[];
  session: boolean;
  onScan: (url?: string) => void;
  onOpen: (s: Scan) => void;
  onNotify: (s: string) => void;
}) {
  return (
    <>
      {session && <OwnedWebsites onAudit={onScan} />}
      {!session && <>
        <OverviewSetupGuide state="ready" questions={0} answers={0} onRetry={()=>{}} />
        <p className="websites-signin-note">Already have saved websites? <Link href="/login">Sign in to your workspace <ArrowRight size={13}/></Link></p>
      </>}
      {session && <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Your audit history</h2>
            <p>Saved results from real page captures.</p>
          </div>
          <span className="count-badge">{scans.length} audits</span>
        </div>
        {scans.length ? (
          <div className="audit-history">
            {scans.map((s) => (
              <div className="audit-history-row" key={s.id}>
              <button onClick={() => onOpen(s)}>
                <Globe2 size={19} />
                <span>
                  <strong>{safeHostname(s.url, "This website")}</strong>
                  <small>{new Date(s.createdAt).toLocaleString()}</small>
                </span>
                <span className="history-score">
                  {s.seoScore}
                  <small>/100</small>
                </span>
                <ArrowRight size={16} />
              </button>
              <Link className="text-link" href={evaluationHref({ targetUrl: s.url })} aria-label={`Evaluate ${new URL(s.url).hostname}`}>Evaluate <ArrowUpRight size={14} /></Link>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            icon={<BookOpen size={26} />}
            title="No page audits saved yet."
            text={
              session
                ? "Page audits check technical readiness. Choose Audit website under More website tools when you want a fresh check."
                : "Sign in to save website audits and come back to your results."
            }
            action={
              session ? (
                <Button onClick={() => onScan()}>
                  Run an audit <ArrowRight size={14} />
                </Button>
              ) : (
                <Link className="button secondary" href="/login">
                  Sign in to begin <ArrowRight size={14} />
                </Link>
              )
            }
          />
        )}
      </section>
      {scans.length>0 && <PublicationControls onNotify={onNotify} />}
      </>}
    </>
  );
}

function PatchStudio({
  patches,
  sample,
  onNotify,
}: {
  patches: Patch[];
  sample: boolean;
  onNotify: (s: string) => void;
}) {
  const [selected, setSelected] = useState(patches[0]?.id ?? "");
  const [approved, setApproved] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const patch = patches.find((p) => p.id === selected) ?? patches[0];
  async function downloadPatches() {
    trackProductEvent("repair_download_requested", {kind:"repair_bundle",surface:sample?"repair_demo":"product"});
    setDownloading(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      patches
        .filter((p) => approved.includes(p.id))
        .forEach((p) => {
          const safe = p.target.replace(/^\/+/, "").replace(/\.\./g, "_");
          zip.file(`${p.id}/${safe || "patch.txt"}`, p.after);
        });
      zip.file(
        "README.txt",
        `Folio reviewed repair artifacts\n${sample ? "ILLUSTRATIVE DEMO CONTENT — adapt and verify before publishing." : "Generated from your captured page. Review before publishing."}\nFiles have not been applied to your website. Copy the reviewed changes into your source, then run a new audit.\n`,
      );
      download(
        await zip.generateAsync({ type: "blob" }),
        "folio-reviewed-patches.zip",
      );
      trackProductEvent("repair_download_result", {kind:"repair_bundle",result:"success",surface:sample?"repair_demo":"product"});
      onNotify("Your reviewed patch bundle is ready.");
    } catch {
      trackProductEvent("repair_download_result", {kind:"repair_bundle",result:"failed",surface:sample?"repair_demo":"product"});
      onNotify("The download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  }
  if (!patch)
    return (
      <EmptyState
        icon={<CheckCheck size={30} />}
        title="Nothing to repair right now."
        text="No downloadable suggestions were produced for this audit."
      />
    );
  return (
    <>
      <div className="patch-summary">
        <span>
          <ShieldCheck size={19} /> You’re in control. Every change starts with
          your review.
        </span>
        {sample && <SampleLabel />}
        <Button
          kind="secondary"
          disabled={!approved.length || downloading}
          onClick={downloadPatches}
        >
          {downloading ? (
            <Loader2 className="spin" size={16} />
          ) : (
            <ArrowDownToLine size={16} />
          )}
          Download {approved.length || ""} approved
        </Button>
      </div>
      <div className="patch-layout">
        <section className="panel patch-list">
          <div className="panel-heading">
            <h2>Your improvement queue</h2>
            <span className="count-badge">{patches.length}</span>
          </div>
          {patches.map((p, i) => (
            <button
              key={p.id}
              className={`patch-list-item ${patch.id === p.id ? "selected" : ""}`}
              onClick={() => setSelected(p.id)}
            >
              <span className="patch-number">
                {approved.includes(p.id) ? (
                  <Check size={15} />
                ) : (
                  String(i + 1).padStart(2, "0")
                )}
              </span>
              <div>
                <strong>{p.title}</strong>
                <small>{p.target}</small>
                <span
                  className={`status-pill ${approved.includes(p.id) ? "pass" : ""}`}
                >
                  {approved.includes(p.id) ? "Approved" : "Ready to review"}
                </span>
              </div>
              <ChevronRight size={15} />
            </button>
          ))}
        </section>
        <section className="panel patch-editor">
          <div className="panel-heading">
            <div>
              <span className="eyebrow tiny">A CONSIDERED IMPROVEMENT</span>
              <h2>{patch.title}</h2>
            </div>
            <FileCode2 size={21} />
          </div>
          <p className="patch-reason">{patch.reason}</p>
          <div className="diff-grid">
            <div>
              <div className="diff-label">
                <span className="diff-dot before" />
                Current version
              </div>
              <pre>{patch.before}</pre>
            </div>
            <div>
              <div className="diff-label">
                <span className="diff-dot after" />
                Suggested version
              </div>
              <pre className="after-code">{patch.after}</pre>
            </div>
          </div>
          <div className="patch-editor-footer">
            <button
              className="text-link"
              onClick={() =>
                navigator.clipboard
                  .writeText(patch.after)
                  .then(() => onNotify("Suggested content copied."))
                  .catch(() =>
                    onNotify(
                      "Unable to access the clipboard. Download the patch instead.",
                    ),
                  )
              }
            >
              <Clipboard size={14} />
              Copy suggestion
            </button>
            <Button
              kind={approved.includes(patch.id) ? "secondary" : "primary"}
              onClick={() =>
                setApproved((a) =>
                  a.includes(patch.id)
                    ? a.filter((id) => id !== patch.id)
                    : [...a, patch.id],
                )
              }
            >
              <Check size={16} />
              {approved.includes(patch.id)
                ? "Approved · undo"
                : "Approve this change"}
            </Button>
          </div>
        </section>
      </div>
      <div className="evidence-note">
        <Info size={17} />
        <p>
          Approval adds the artifact to your download bundle. It does not change
          your website. After publishing the reviewed content yourself, run
          another audit to compare the result.
        </p>
      </div>
    </>
  );
}

function Settings({
  session,
  pending,
  agentStatus,
  onNotify,
}: {
  session: ReturnType<typeof authClient.useSession>["data"];
  pending: boolean;
  agentStatus: boolean;
  onNotify: (s: string) => void;
}) {
  const settingsQuery = useSearchParams();
  return (
    <div className="settings-layout">
      <section className="panel">
        <div className="panel-heading">
          <h2>Your account</h2>
          <ShieldCheck size={19} />
        </div>
        <div className="settings-body">
          {pending ? (
            <Loader2 className="spin" />
          ) : session ? (
            <>
              <div className="account-details">
                <span className="avatar">{session.user.name[0]}</span>
                <div>
                  <strong>{session.user.name}</strong>
                  <p>{session.user.email}</p>
                </div>
              </div>
              <Button
                kind="secondary"
                onClick={async () => {
                  await authClient.signOut();
                  onNotify("You have been signed out.");
                }}
              >
                <LogOut size={14} />
                Sign out
              </Button>
            </>
          ) : (
            <>
              <p>
                Sign in to save your sites, keep an audit history, and return to
                your findings.
              </p>
              <Link href="/login" className="button primary">
                Sign in with Better Auth <ArrowRight size={15} />
              </Link>
            </>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Your connections</h2>
          <Code2 size={19} />
        </div>
        {!pending && <GithubConnection key={session?.user.id ?? "signed-out"} ownerId={session?.user.id ?? null} />}
        {session && settingsQuery.get("connection") === "github-error" && <p className="form-error" role="alert">GitHub could not be linked. Try again with a GitHub account that has the same verified email as your Folio account.</p>}
        {[
          {
            name: "Website scanner",
            text: "Technical checks from captured website evidence.",
            state: "Available",
            icon: Globe2,
          },
          {
            name: "Website evaluations",
            text: "Evaluate your website and inspect the saved evidence.",
            state: "Open evaluations",
            href: "/evaluations",
            icon: Bot,
          },
          {
            name: "Google Search Console",
            text: "Connect your Google account and import private search reports.",
            state: "Open Search Console",
            href: "/search-console",
            icon: Search,
          },
          {
            name: "GitHub publishing",
            text: "Reviewed changes, delivered as a pull request.",
            state: "Coming next",
            icon: FileCode2,
          },
        ].map((c) => (
          <div className="connection-row" key={c.name}>
            <c.icon size={23} />
            <div>
              <h3>{c.name}</h3>
              <p>{c.text}</p>
            </div>
            {c.href ? <Link href={c.href} className="button secondary">{c.state}</Link> : <span
              className={`status-pill ${c.state === "Available" ? "pass" : ""}`}
            >
              {c.state}
            </span>}
          </div>
        ))}
      </section>
    </div>
  );
}

function ScanForm({
  initialUrl,
  signedIn,
  onComplete,
}: {
  initialUrl: string;
  signedIn: boolean;
  onComplete: (s: Scan) => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="scan-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const began=performance.now();
        trackProductEvent("website_check_requested");
        try {
          const r = await fetch("/api/scans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
          const d = await r.json();
          if (!r.ok)
            throw new Error(d.error ?? "This audit could not be completed.");
          trackProductEvent("website_check_result",{result:"success",duration_ms:performance.now()-began});
          onComplete(d);
        } catch (e) {
          trackProductEvent("website_check_result",{result:"failed",duration_ms:performance.now()-began,error_code:"request_failed"});
          setError(e instanceof Error ? e.message : "Please try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Get a source-backed technical audit, practical suggestions, and a saved
        report for your website.
      </p>
      <label htmlFor="scan-url">Website URL</label>
      <div className="url-input">
        <Globe2 size={18} />
        <input
          id="scan-url"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          disabled={busy}
        />
      </div>
      <p className="form-hint">
        Enter the public page you want to check. The audit saves its HTML findings to your account.
      </p>
      <div className="scan-includes">
        <span>
          <Check size={14} /> Page structure & metadata
        </span>
        <span>
          <Check size={14} /> Source-backed scoring
        </span>
        <span>
          <Check size={14} /> Downloadable suggestions
        </span>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {signedIn ? (
        <Button type="submit" disabled={busy}>
          {busy ? (
            <>
              <Loader2 size={16} className="spin" />
              Capturing and checking your page…
            </>
          ) : (
            <>
              Run website audit <ArrowRight size={15} />
            </>
          )}
        </Button>
      ) : (
        <Link href="/login" className="button primary">
          Sign in to save your audit <ArrowRight size={15} />
        </Link>
      )}
      <p className="form-footnote">
        Technical checks run without an AI API key.
      </p>
    </form>
  );
}

function Login({ onNotify }: { onNotify: (s: string) => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextValues = searchParams.getAll("next");
  let returnTo = "/websites";
  if (nextValues.length === 1 && nextValues[0].length <= 4096) {
    try {
      const next = new URL(nextValues[0], "https://folio.invalid");
      if (next.origin === "https://folio.invalid" && next.pathname === "/benchmarks") {
        const params = new URLSearchParams();
        for (const key of ["suite", "run", "website"]) {
          const values = next.searchParams.getAll(key);
          if (values.length === 1 && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(values[0])) params.set(key, values[0]);
        }
        returnTo = `/benchmarks${params.size ? `?${params}` : ""}`;
      }
      if (next.origin === "https://folio.invalid" && next.pathname === "/search-console") returnTo = "/search-console";
      if (next.origin === "https://folio.invalid" && next.pathname === "/overview") {
        const views = next.searchParams.getAll("view");
        const view = views.length === 1 ? views[0] : null;
        returnTo = view === "demo" ? "/overview?view=demo" : view === "workspace" || next.searchParams.has("website") || next.searchParams.has("scope") ? workspaceOverviewHref(next.searchParams) : "/overview";
      }
      if (next.origin === "https://folio.invalid" && next.pathname === "/folio-internal/analytics") returnTo = "/folio-internal/analytics";
      if (next.origin === "https://folio.invalid" && next.pathname === "/docs/api") returnTo = "/docs/api";
      if (next.origin === "https://folio.invalid" && ["/evaluations", "/agents"].includes(next.pathname)) {
        const views = next.searchParams.getAll("view");
        const view = views.length === 1 && ["search", "page"].includes(views[0]) ? views[0] : null;
        if (next.pathname === "/evaluations" && view === "search") {
          const params = new URLSearchParams({ view: "search" });
          for (const key of ["suite", "run", "website"]) {
            const values = next.searchParams.getAll(key);
            if (values.length === 1 && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(values[0])) params.set(key, values[0]);
          }
          const target = readEvaluationIntent(next.searchParams).targetUrl;
          if (target) params.set("target", target);
          returnTo = `/evaluations?${params}`;
        } else {
          const intent = evaluationHref(readEvaluationIntent(next.searchParams));
          const params = new URLSearchParams(intent.split("?")[1]);
          if (next.pathname === "/evaluations" && view === "page") params.set("view", "page");
          returnTo = `${next.pathname}${params.size ? `?${params}` : ""}`;
        }
      }
    } catch { /* Invalid return hints fall back to the private website list. */ }
  }
  const [emailMode, setEmailMode] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const emailChoice = useRef<HTMLButtonElement>(null);
  const pendingMethodFocus = useRef<"email" | "choice" | null>(null);
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [githubConfigured, setGithubConfigured] = useState(false);
  useLayoutEffect(() => {
    const target = pendingMethodFocus.current;
    pendingMethodFocus.current = null;
    if (target) (target === "email" ? emailInput.current : emailChoice.current)?.focus({ preventScroll: true });
  }, [emailMode, signup]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/search-console", { signal: controller.signal, cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted) setGoogleConfigured(data?.configured === true); })
      .catch(() => {});
    fetch("/api/github", { signal: controller.signal, cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted) setGithubConfigured(data?.configured === true); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  function chooseEmail(createAccount = false) {
    pendingMethodFocus.current = "email";
    setSignup(createAccount); setEmailMode(true); setError("");
  }
  function chooseMethod() {
    pendingMethodFocus.current = "choice";
    setEmailMode(false); setSignup(false); setError(""); setPassword(""); setShowPassword(false);
  }
  return (
    <div className="login-screen" data-login-method={emailMode ? "email" : "choose"}>
      <header className="login-header">
        <Link href="/" className="wordmark" aria-label="Folio home"><FolioMark /><span>folio.</span></Link>
        <div><Link href="/overview?view=demo">Explore the demo <ArrowUpRight size={15} aria-hidden="true" /></Link><DashboardAppearance /></div>
      </header>
      <main className="login-layout">
      <section className="login-form-panel" aria-busy={busy} aria-labelledby="login-title">
          <span className="login-kicker">Your Folio workspace</span>
          <h1 id="login-title">{signup ? "Create your account." : "Welcome back."}</h1>
          <p>
            {signup
              ? "Keep your websites, questions, and reports together."
              : emailMode ? "Sign in with your email." : "Choose how you’d like to continue."}
          </p>
          <div className="login-providers" hidden={emailMode}>
          {googleConfigured && <button className="login-choice login-choice-google" type="button" disabled={busy} onClick={async () => {
            setBusy(true); setError("");
            try {
              trackProductEvent("sign_in_requested", {method:"google"});
              const result = await authClient.signIn.social({ provider: "google", callbackURL: returnTo, errorCallbackURL: "/login?error=google" });
              if (result.error) setError(result.error.message ?? "Google sign-in could not be completed.");
            } catch { setError("Google sign-in could not be completed. Please try again."); }
            finally { setBusy(false); }
          }}><Image src="/images/favicons/google.com.png" alt="" loading="eager" width={20} height={20} unoptimized /><span>Sign in with Google</span><ArrowUpRight size={17} aria-hidden="true" /></button>}
          {searchParams.get("error") === "google" && <p className="form-error" role="alert">Google sign-in could not be completed. If you already use email and password, sign in that way before linking Google in Search Console.</p>}
          {searchParams.get("error") === "github" && <p className="form-error" role="alert">GitHub sign-in could not be completed. If you already have a Folio account, sign in with your existing method and connect GitHub in Settings.</p>}
          <button ref={emailChoice} type="button" className="login-choice login-choice-email" disabled={busy} onClick={() => chooseEmail()}><Mail size={20} aria-hidden="true" /><span>Continue with email</span><ArrowRight size={17} aria-hidden="true" /></button>
          {githubConfigured && <details className="login-other-method"><summary>More sign-in options</summary>          {githubConfigured && <button className="login-github" type="button" disabled={busy} onClick={async () => {
            setBusy(true); setError("");
            try {
              trackProductEvent("sign_in_requested", {method:"github"});
              const result = await authClient.signIn.social({ provider: "github", callbackURL: returnTo, errorCallbackURL: "/login?error=github" });
              if (result.error) setError("GitHub sign-in could not be completed. If you already have a Folio account, sign in with your existing method and connect GitHub in Settings.");
            } catch { setError("GitHub sign-in could not be completed. Please try again."); }
            finally { setBusy(false); }
          }}>Sign in with GitHub</button>}
</details>}
          <p className="login-account-switch">New to Folio? <button type="button" disabled={busy} onClick={() => chooseEmail(true)}>Create an account</button></p>
          </div>
        <div className="login-email-panel t-panel-slide" data-open={emailMode} hidden={!emailMode}>
        <button type="button" className="login-back" disabled={busy} onClick={chooseMethod}><ArrowLeft size={15} aria-hidden="true" /> Other sign-in methods</button>
        <form className="login-form" aria-busy={busy} aria-label={signup ? "Create your Folio account" : "Sign in to Folio"}
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              trackProductEvent("sign_in_requested", {method:"email"});
              const result = signup
                ? await authClient.signUp.email({ email, password, name })
                : await authClient.signIn.email({ email, password });
              if (result.error) {
                setError(
                  result.error.message ??
                    "Unable to sign in. Please try again.",
                );
              } else {
                trackProductEvent("sign_in_return_observed", {method:"email",result:"success"});
                onNotify("Welcome to Folio.");
                router.push(returnTo);
                router.refresh();
              }
            } catch {
              setError("Unable to reach authentication. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {signup && (
            <label>
              Your name
              <input
                autoComplete="name"
                required
                disabled={busy}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Morgan"
              />
            </label>
          )}
          <label>
            Email address
            <input
              ref={emailInput}
              type="email"
              autoComplete="email"
              required
              disabled={busy}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </label>
          <label>
            Password
            <span className="login-password"><input
              type={showPassword ? "text" : "password"}
              minLength={10}
              autoComplete={signup ? "new-password" : "current-password"}
              required
              disabled={busy}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={signup ? "At least 10 characters" : "Your password"}
            /><button type="button" className="login-password-toggle" disabled={busy} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></span>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? (
              <><Loader2 className="spin" size={16} aria-hidden="true" />{signup ? "Creating account…" : "Signing in…"}</>
            ) : (
              <>
                {signup ? "Create your account" : "Sign in"}
                <ArrowRight size={16} />
              </>
            )}
          </Button>
          <p className="login-account-switch">
            {signup ? "Already have an account?" : "New to Folio?"}{" "}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setSignup(!signup);
                setShowPassword(false);
                setError("");
              }}
            >
              {signup ? "Sign in" : "Create an account"}
            </button>
          </p>
        </form>
        </div>
        {!emailMode && error && <p className="form-error" role="alert">{error}</p>}
        {busy && !emailMode && <p role="status" className="login-social-status">Opening sign-in…</p>}
        <p className="login-privacy"><ShieldCheck size={14} aria-hidden="true" /> Your reports are private by default.</p>
      </section>
      <aside className="login-art" aria-label="Folio artwork">
        <Image className="theme-art-light" src="/images/folio-login-arch.webp" alt="" width={1024} height={1280} sizes="(max-width: 800px) 100vw, 40vw" loading="eager" />
        <Image className="theme-art-dark" src="/images/folio-login-arch-dark.webp" alt="" width={1024} height={1280} sizes="(max-width: 800px) 100vw, 40vw" loading="eager" />
        <div><span>A little perspective.</span><span>Folio / 02</span></div>
      </aside>
      </main>
      <footer className="login-footer"><Link href="/privacy">Privacy</Link><span>A little clarity goes a long way.</span></footer>
    </div>
  );
}

function Methodology() {
  return (
    <div className="methodology">
      <span className="edition">BENCHMARK DESIGN · VERSION 0.1</span>
      <p>
        The public index is currently a clearly labeled sample dataset. Real
        technical audits are measured separately and never inserted into the
        sample leaderboard.
      </p>
      <div className="method-rule">
        <strong>01</strong>
        <div>
          <h3>Technical health</h3>
          <p>
            Fixed checks inspect page metadata, headings, indexing controls,
            structured data, and readable content. The result is a readiness
            score, not a search ranking.
          </p>
        </div>
      </div>
      <div className="method-rule">
        <strong>02</strong>
        <div>
          <h3>Independent reader evaluations</h3>
          <p>
            Use a frozen set of buyer questions, owner-confirmed answers, fresh
            model sessions, and the same budgets. Score correctness and cited
            evidence separately from cost and time.
          </p>
        </div>
      </div>
      <div className="method-rule">
        <strong>03</strong>
        <div>
          <h3>Comparable, inspectable rankings</h3>
          <p>
            Publish the task suite, model version, capture date, sample size,
            missing data, and scoring version. Rank only sites evaluated under
            the same conditions. Repeated trials establish uncertainty.
          </p>
        </div>
      </div>
      <div className="method-rule">
        <strong>04</strong>
        <div>
          <h3>A review before every repair</h3>
          <p>
            Suggestions are grounded in captured inputs. Downloads never change
            a website. A new capture verifies the result after the owner
            publishes it.
          </p>
        </div>
      </div>
      <p className="form-footnote">
        Optional llms.txt files do not prove visibility in an answer engine.
        Live citations require observed provider evidence.
      </p>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  text,
  action,
  compact = false,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state ${compact ? "compact" : ""}`}>
      <span className="empty-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-header">
        <div>
          <FolioMark small />
          <h2>{title}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
function download(
  content: string | Blob,
  filename: string,
  type = "application/octet-stream",
) {
  const blob =
    typeof content === "string" ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

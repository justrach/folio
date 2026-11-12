import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { adminOverview, type AdminOverview } from "@/lib/admin-data";
import { revenueSummary, type RevenueSummary } from "@/lib/stripe-revenue";
import { RevenueGlobe } from "@/components/revenue-globe";
import "./admin.css";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "Admin · Folio" };

function bytes(value: number | null): string {
  if (!value) return "—";
  if (value > 1_073_741_824) return `${(value / 1_073_741_824).toFixed(2)} GB`;
  if (value > 1_048_576) return `${(value / 1_048_576).toFixed(1)} MB`;
  return `${Math.round(value / 1024)} KB`;
}

function when(value: string | null): string {
  if (!value) return "never";
  const date = new Date(value);
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 90) return `${minutes} min ago`;
  if (minutes < 60 * 36) return `${Math.round(minutes / 60)} h ago`;
  return date.toLocaleDateString();
}

const UNREAD = "couldn’t be read";
const unreadable = (columns: number) => <tr><td colSpan={columns} className="admin-unavailable">{UNREAD}</td></tr>;

/** Reads that fail become a note on the page, never a 500: an admin should still see what could be read. */
async function readOverview(): Promise<AdminOverview | null> {
  try { return await adminOverview(); } catch (error) {
    console.error("admin page: overview couldn't be read", error instanceof Error ? error.message : error);
    return null;
  }
}
async function readRevenue(): Promise<RevenueSummary | null> {
  try { return await revenueSummary(30); } catch (error) {
    console.error("admin page: revenue couldn't be read", error instanceof Error ? error.message : error);
    return null;
  }
}

export default async function AdminPage() {
  const session = await getSession(await headers());
  // A non-admin gets the same 404 as a signed-out visitor: the page does not
  // advertise that it exists.
  if (!session || !isAdmin(session.user.email)) notFound();

  const [data, revenue] = await Promise.all([readOverview(), readRevenue()]);
  const missing = data && ([data.index, data.queue, data.priorities, data.storage.databaseBytes, data.storage.tableBytes, data.crawl].some(part => part === null) || data.vectors.state === "unavailable");

  return (
    <main className="admin">
      <header>
        <span className="admin-kicker">Internal</span>
        <h1>Index operations</h1>
        <Link href="/folio-internal/analytics">Open product analytics →</Link>
        <p>Signed in as {session.user.email}. This page is limited to the owner accounts and is not indexed.</p>
      </header>

      {revenue ? <RevenueGlobe summary={revenue} /> : <p className="admin-alert" role="alert">Revenue couldn’t be read just now. Reload to try again.</p>}

      {!data ? <p className="admin-alert" role="alert">Index and crawl figures couldn’t be read just now. Reload to try again.</p> : <>
      {missing && <p className="admin-alert" role="status">Some figures couldn’t be read just now and are marked below. Reload to try again.</p>}
      <section className="admin-grid">
        <div className="admin-card">
          <span>Pages indexed</span>
          <strong>{data.index ? data.index.pages.toLocaleString() : "—"}</strong>
          <small>{data.index ? `${data.index.domains.toLocaleString()} organisations · newest ${when(data.index.updatedAt)}` : UNREAD}</small>
        </div>
        <div className="admin-card">
          <span>Vectors (turbopuffer)</span>
          <strong>{data.vectors.rows === null ? "—" : data.vectors.rows.toLocaleString()}</strong>
          <small>
            {data.vectors.state === "unavailable" ? UNREAD : `${data.vectors.namespace} · ${bytes(data.vectors.bytes)} · index ${data.vectors.indexStatus ?? "unknown"}`}
          </small>
        </div>
        <div className="admin-card">
          <span>Queue</span>
          <strong>{data.queue ? data.queue.unread.toLocaleString() : "—"}</strong>
          <small>
            {data.queue ? `${data.queue.extracted.toLocaleString()} extracted · ${data.queue.failed.toLocaleString()} failed · ${data.queue.total.toLocaleString()} known` : UNREAD}
          </small>
        </div>
        <div className="admin-card">
          <span>Database</span>
          <strong>{bytes(data.storage.databaseBytes)}</strong>
          <small>{data.storage.databaseBytes === null ? UNREAD : "Postgres, all schemas"}</small>
        </div>
      </section>

      <section className="admin-panel">
        <h2>Vector store</h2>
        <table>
          <tbody>
            <tr><td>Namespace</td><td>{data.vectors.namespace}</td></tr>
            <tr><td>Region</td><td>{data.vectors.region}</td></tr>
            <tr><td>Rows</td><td>{data.vectors.state === "no_key" ? "unavailable (no key)" : data.vectors.state === "unavailable" ? UNREAD : data.vectors.rows === null ? "unknown" : data.vectors.rows.toLocaleString()}</td></tr>
            <tr><td>Logical bytes</td><td>{bytes(data.vectors.bytes)}</td></tr>
            <tr><td>Index status</td><td>{data.vectors.indexStatus ?? "unknown"}</td></tr>
            <tr><td>Embeddings recorded</td><td>{data.index ? data.index.embedded.toLocaleString() : UNREAD}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="admin-panel">
        <h2>Crawl queue</h2>
        <table>
          <thead><tr><th>State</th><th className="num">URLs</th></tr></thead>
          <tbody>
            {data.queue ? <>
              <tr><td>Never fetched</td><td className="num">{data.queue.unread.toLocaleString()}</td></tr>
              <tr><td>Extracted</td><td className="num">{data.queue.extracted.toLocaleString()}</td></tr>
              <tr><td>Failed</td><td className="num">{data.queue.failed.toLocaleString()}</td></tr>
            </> : <tr><td>Queue states</td><td className="num admin-unavailable">{UNREAD}</td></tr>}
            <tr><td>Fetched in the last 24h</td><td className={data.crawl ? "num" : "num admin-unavailable"}>{data.crawl ? data.crawl.last24h.toLocaleString() : UNREAD}</td></tr>
            <tr><td>Newest page</td><td className={data.crawl ? "num" : "num admin-unavailable"}>{data.crawl ? when(data.crawl.latestFetchedAt) : UNREAD}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="admin-panel">
        <h2>Rated domains</h2>
        <p className="admin-note">From <code>research.crawl_priorities</code>. Re-rate with <code>rate-crawl-queue.mjs --write</code> after each pass.</p>
        <table>
          <thead><tr><th>Verdict</th><th className="num">Domains</th><th className="num">Pending URLs</th></tr></thead>
          <tbody>
            {data.priorities === null ? unreadable(3) : data.priorities.length === 0 ? <tr><td colSpan={3}>No domains rated yet.</td></tr> : data.priorities.map(row => (
              <tr key={row.verdict}>
                <td>{row.verdict}</td>
                <td className="num">{row.domains.toLocaleString()}</td>
                <td className="num">{(row.pending ?? 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="admin-panel">
        <h2>Largest research tables</h2>
        <table>
          <thead><tr><th>Table</th><th className="num">Size</th></tr></thead>
          <tbody>
            {data.storage.tableBytes === null ? unreadable(2) : data.storage.tableBytes.length === 0 ? <tr><td colSpan={2}>No tables in the research schema.</td></tr> : data.storage.tableBytes.map(row => (
              <tr key={row.name}><td><code>{row.name}</code></td><td className="num">{bytes(row.bytes)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
      </>}

      <footer>
        <span>Allowlist: rachxpradhan@gmail.com · yuxilim22@gmail.com (plus <code>ADMIN_EMAILS</code> when set).</span>
      </footer>
    </main>
  );
}

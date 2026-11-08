import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { adminOverview } from "@/lib/admin-data";
import { revenueSummary } from "@/lib/stripe-revenue";
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

export default async function AdminPage() {
  const session = await getSession(await headers());
  // A non-admin gets the same 404 as a signed-out visitor: the page does not
  // advertise that it exists.
  if (!session || !isAdmin(session.user.email)) notFound();

  const [data, revenue] = await Promise.all([adminOverview(), revenueSummary(30)]);

  return (
    <main className="admin">
      <header>
        <span className="admin-kicker">Internal</span>
        <h1>Index operations</h1>
        <p>Signed in as {session.user.email}. This page is limited to the owner accounts and is not indexed.</p>
      </header>

      <RevenueGlobe summary={revenue} />

      <section className="admin-grid">
        <div className="admin-card">
          <span>Pages indexed</span>
          <strong>{data.index.pages.toLocaleString()}</strong>
          <small>{data.index.domains} organisations · newest {when(data.index.updatedAt)}</small>
        </div>
        <div className="admin-card">
          <span>Vectors (turbopuffer)</span>
          <strong>{data.vectors.rows === null ? "—" : data.vectors.rows.toLocaleString()}</strong>
          <small>
            {data.vectors.namespace} · {bytes(data.vectors.bytes)} · index {data.vectors.indexStatus ?? "unknown"}
          </small>
        </div>
        <div className="admin-card">
          <span>Queue</span>
          <strong>{data.queue.unread.toLocaleString()}</strong>
          <small>
            {data.queue.extracted.toLocaleString()} extracted · {data.queue.failed.toLocaleString()} failed · {data.queue.total.toLocaleString()} known
          </small>
        </div>
        <div className="admin-card">
          <span>Database</span>
          <strong>{bytes(data.storage.databaseBytes)}</strong>
          <small>Postgres, all schemas</small>
        </div>
      </section>

      <section className="admin-panel">
        <h2>Vector store</h2>
        <table>
          <tbody>
            <tr><td>Namespace</td><td>{data.vectors.namespace}</td></tr>
            <tr><td>Region</td><td>{data.vectors.region}</td></tr>
            <tr><td>Rows</td><td>{data.vectors.rows === null ? "unavailable (no key or timeout)" : data.vectors.rows.toLocaleString()}</td></tr>
            <tr><td>Logical bytes</td><td>{bytes(data.vectors.bytes)}</td></tr>
            <tr><td>Index status</td><td>{data.vectors.indexStatus ?? "unknown"}</td></tr>
            <tr><td>Embeddings recorded</td><td>{data.index.embedded.toLocaleString()}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="admin-panel">
        <h2>Crawl queue</h2>
        <table>
          <thead><tr><th>State</th><th className="num">URLs</th></tr></thead>
          <tbody>
            <tr><td>Never fetched</td><td className="num">{data.queue.unread.toLocaleString()}</td></tr>
            <tr><td>Extracted</td><td className="num">{data.queue.extracted.toLocaleString()}</td></tr>
            <tr><td>Failed</td><td className="num">{data.queue.failed.toLocaleString()}</td></tr>
            <tr><td>Fetched in the last 24h</td><td className="num">{(data.crawl.last24h ?? 0).toLocaleString()}</td></tr>
            <tr><td>Newest page</td><td className="num">{when(data.crawl.latestFetchedAt)}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="admin-panel">
        <h2>Rated domains</h2>
        <p className="admin-note">From <code>research.crawl_priorities</code>. Re-rate with <code>rate-crawl-queue.mjs --write</code> after each pass.</p>
        <table>
          <thead><tr><th>Verdict</th><th className="num">Domains</th><th className="num">Pending URLs</th></tr></thead>
          <tbody>
            {data.priorities.map(row => (
              <tr key={row.verdict}>
                <td>{row.verdict}</td>
                <td className="num">{(row.domains ?? 0).toLocaleString()}</td>
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
            {data.storage.tableBytes.map(row => (
              <tr key={row.name}><td><code>{row.name}</code></td><td className="num">{bytes(row.bytes)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer>
        <span>Allowlist: rachxpradhan@gmail.com · yuxilim22@gmail.com (plus <code>ADMIN_EMAILS</code> when set).</span>
      </footer>
    </main>
  );
}

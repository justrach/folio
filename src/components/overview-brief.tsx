import Link from "next/link";
import { ArrowDown, CheckCheck, ScanSearch } from "@/components/icons";
import "./overview-brief.css";

type Fact = {label: string; value: string};
type Props = {
  title: string;
  checked: string;
  found: string;
  checks?: Fact[];
  findings?: Fact[];
  next: string;
  action: string;
  href?: string;
  onAction?: () => void;
  busy?: boolean;
  note?: string;
};

/** Reopening saved evidence never starts a new check or paid run. */
export function OverviewBrief({ title, checked, found, checks, findings, next, action, href, onAction, busy, note }: Props) {
  return <section className="overview-brief" aria-label="Website check summary" aria-busy={busy}>
    <h2>{title}</h2>
    <div className="overview-brief-facts">
      <div><h3><ScanSearch size={18} aria-hidden="true"/>What we checked</h3>
        {checks && <dl>{checks.map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}
        <p>{checked}</p>
      </div>
      <div><h3><CheckCheck size={18} aria-hidden="true"/>What we found</h3>
        {findings && <dl>{findings.map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}
        <p>{found}</p>
      </div>
    </div>
    <footer><div><h3>What to do next</h3><p>{next}</p>{note && <small>{note}</small>}</div>
      {href ? <Link className="button primary squishy-control" href={href}>{action}<ArrowDown size={17} aria-hidden="true"/></Link> : <button className="button primary squishy-control" disabled={busy} onClick={onAction}>{action}<ArrowDown size={17} aria-hidden="true"/></button>}
    </footer>
  </section>;
}

import Link from "next/link";
import { ArrowRight, CheckCheck, ScanSearch } from "lucide-react";
import "./overview-brief.css";

type Props = {
  title: string;
  checked: string;
  found: string;
  next: string;
  action: string;
  href?: string;
  onAction?: () => void;
  busy?: boolean;
  note?: string;
};

/** One decision, backed by loaded evidence. Opening the action never starts a paid run. */
export function OverviewBrief({ title, checked, found, next, action, href, onAction, busy, note }: Props) {
  return <section className="overview-brief" aria-label="Your website brief" aria-busy={busy}>
    <header><span><ScanSearch size={17} aria-hidden="true"/>WEBSITE BRIEF</span><h2>{title}</h2></header>
    <div className="overview-brief-facts"><div><span>What we checked</span><p>{checked}</p></div><div><span><CheckCheck size={14} aria-hidden="true"/>What we found</span><p>{found}</p></div></div>
    <footer><div><span>YOUR NEXT MOVE</span><p>{next}</p>{note && <small>{note}</small>}</div>{href ? <Link className="button primary squishy-control" href={href}>{action}<ArrowRight size={16} aria-hidden="true"/></Link> : <button className="button primary squishy-control" disabled={busy} onClick={onAction}>{action}<ArrowRight size={16} aria-hidden="true"/></button>}</footer>
  </section>;
}

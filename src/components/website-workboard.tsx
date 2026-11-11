import Link from "next/link";
import { useId } from "react";
import { ArrowRight, MessageCircle, ScanLine, Search } from "@/components/icons";

/** Real website handoffs: a team chooses a job, then reviews the destination. */
export function WebsiteWorkboard({ websiteId, onAudit }: { websiteId: string; onAudit?: () => void }) {
  const id = useId();
  return <section className="website-workboard" aria-label="Choose a job for your team">
    <header><span>ONE USEFUL JOB AT A TIME</span><h4>What’s on our team’s mind?</h4></header>
    <div className="website-workboard-jobs">
      <Link href={`/overview?view=workspace&website=${encodeURIComponent(websiteId)}`} className="website-job squishy-control" aria-label="View results" aria-describedby={`${id}-results`}><span className="website-job-icon"><Search size={20} aria-hidden="true"/></span><strong>Are buyers hearing about us?</strong><p id={`${id}-results`}>Open our saved answers. See where we’re named, then inspect the sources.</p><span className="website-job-action">View results<ArrowRight size={15} aria-hidden="true"/></span></Link>
      <Link href={`/benchmarks?website=${encodeURIComponent(websiteId)}`} className="website-job squishy-control" aria-label="Choose questions" aria-describedby={`${id}-questions`}><span className="website-job-icon"><MessageCircle size={20} aria-hidden="true"/></span><strong>What would our next customer ask?</strong><p id={`${id}-questions`}>Choose a question about their job, budget, or alternatives. We review it before running.</p><span className="website-job-action">Choose questions<ArrowRight size={15} aria-hidden="true"/></span></Link>
      {onAudit && <button type="button" className="website-job squishy-control" onClick={onAudit} aria-label="Audit website" aria-describedby={`${id}-audit`}><span className="website-job-icon"><ScanLine size={20} aria-hidden="true"/></span><strong>Can tools read our page?</strong><p id={`${id}-audit`}>Open a page audit to inspect technical readiness and captured page evidence.</p><span className="website-job-action">Audit website<ArrowRight size={15} aria-hidden="true"/></span></button>}
    </div>
    <footer>Not sure where to start? <Link href="/overview?view=demo">Play through one team’s first question<ArrowRight size={13} aria-hidden="true"/></Link></footer>
  </section>;
}

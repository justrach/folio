"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CreditCard,
  LockKeyhole,
  Loader2,
} from "@/components/icons";
import { authClient } from "@/lib/auth-client";
import "./pricing.css";
import { UiBadge, UiButton, UiSurface } from "./ui/primitives";

const plans = [
  {
    id: "index",
    name: "Index",
    price: 1000,
    description: "Start with the shared index.",
    features: [
      "Full index access: questions, recorded answers, cited sources",
      "Private evaluations and saved evidence",
    ],
    footnote: "Everyone reads the same index.",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 2000,
    description: "The index with an organization around it.",
    features: [
      "Everything in Index",
      "Up to 5 seats",
      "Organization, roles, and audit activity",
    ],
    footnote: "More than five seats moves to Enterprise Plus.",
  },
  {
    id: "enterprise_plus",
    name: "Enterprise Plus",
    price: 5000,
    description: "For more than five seats.",
    features: [
      "Everything in Enterprise",
      "More than 5 seats",
    ],
    footnote: "Priced from $5,000 for teams past five seats.",
  },
];
function Mark() {
  return (
    <span className="folio-mark" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}


export function Pricing() {
  const { data: session, isPending } = authClient.useSession();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setSelected(null);
    setMessage("");
    setError("");
    if (!session) return;
    const controller = new AbortController();
    fetch("/api/plans", { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d.interest?.plan) setSelected(d.interest.plan);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [session?.user.id]);
  async function choose(plan: string) {
    setBusy(plan);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Unable to save.");
      setSelected(d.interest.plan);
      setMessage(
        "Your preference is saved. No subscription or charge has been created.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="pricing-page">
      <header className="pricing-nav">
        <Link href="/" className="wordmark">
          <Mark />
          <span>folio.</span>
        </Link>
        <div>
          <Link href="/evaluations">
            Explore evaluations <ArrowUpRight size={13} />
          </Link>
          <UiButton asChild variant="secondary" className="button secondary"><Link href={session ? "/overview" : "/login"}>
            {session ? "Your workspace" : "Sign in"} <ArrowUpRight size={13} />
          </Link></UiButton>
        </div>
      </header>
      <main>
        <div className="pricing-heading">
          <span className="eyebrow">FOLIO PLANS</span>
          <h1>
            One index. Priced by seats.
          </h1>
          <p>
            Everyone reads the same recorded answers and cited sources. Index starts at
            $1,000, Enterprise from $2,000 for up to five seats, and more than five
            seats from $5,000. Proposed pricing; billing is not active.
          </p>
          <UiBadge tone="accent" className="pricing-proposal">
            <CreditCard size={13} /> Proposed pricing · billing is not active
          </UiBadge>
        </div>
        <div className="pricing-grid">
          {plans.map((plan, i) => (
            <UiSurface as="article"
              className={`pricing-card ${i === 1 ? "featured" : ""}`}
              key={plan.id}
            >
              <div className="pricing-card-top">
                <span>0{i + 1}</span>
                {i === 1 && <span>FOR INDEPENDENT BUILDERS</span>}
              </div>
              <h2>{plan.name}</h2>
              <p>{plan.description}</p>
              <div className="plan-price">
                <span>$</span>
                {plan.price}
                <small>{plan.price ? "/ month" : "/ forever"}</small>
              </div>
              <span className="plan-currency">
                USD {plan.price ? "· PROPOSED SUBSCRIPTION" : "· FREE PREVIEW"}
              </span>
              <ul>
                {plan.features.map((f) => (
                  <li key={f}>
                    <Check size={14} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="plan-action">
                {session ? (
                  <UiButton variant="secondary"
                    className={`button ${i === 1 ? "cream" : "secondary"}`}
                    disabled={Boolean(busy)}
                    onClick={() => choose(plan.id)}
                  >
                    {busy === plan.id ? (
                      <Loader2 size={14} className="spin" />
                    ) : selected === plan.id ? (
                      <Check size={14} />
                    ) : null}
                    {selected === plan.id
                      ? "Preference saved"
                      : "Register interest"}
                    {selected !== plan.id && <ArrowUpRight size={14} />}
                  </UiButton>
                ) : (
                  <UiButton asChild variant="secondary" className={`button ${i === 1 ? "cream" : "secondary"}`}><Link href="/login">
                    {isPending
                      ? "Loading account…"
                      : "Sign in to register interest"}{" "}
                    <ArrowUpRight size={13} />
                  </Link></UiButton>
                )}
                <small>{plan.footnote}</small>
              </div>
            </UiSurface>
          ))}
        </div>
        {message && (
          <p className="pricing-confirmation" role="status">
            <Check size={17} />
            {message}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="pricing-note">
          <LockKeyhole size={17} />
          <p>
            Registering interest saves a private preference in your account. It
            does not start a subscription, reserve an allowance, charge your
            card, or send a message. Team features and seat limits are proposed.
          </p>
        </div>
        <section className="pricing-details">
          <div>
            <span className="eyebrow">THE SMALL PRINT, IN PLAIN ENGLISH</span>
            <h2>
              Pay for the work.
              <br />
              Keep the evidence honest.
            </h2>
            <p>
              Payment buys access to the index and the workspace around it. It
              never changes a score, buys a higher rank, or makes a failed test
              disappear.
            </p>
          </div>
          <div className="pricing-questions">
            <details>
              <summary>
                Are private results included in the public index?
                <ChevronDown size={15} />
              </summary>
              <p>
                No. Evaluation prompts, captured evidence, agent outputs, and
                your account remain private. The existing technical page index
                includes only site audits that you explicitly publish.
                Subscription status would not affect ranking.
              </p>
            </details>
            <details>
              <summary>
                When can I subscribe?
                <ChevronDown size={15} />
              </summary>
              <p>
                Checkout is not enabled. These plans are a pricing proposal
                while we validate provider costs and the evaluation workflow.
                Registering interest records your preference so you can return
                to it later.
              </p>
            </details>
          </div>
        </section>
        <div className="pricing-final">
          <span>Understand what a good evaluation should prove.</span>
          <Link href="/evaluations">
            Explore the evaluation suite <ArrowUpRight size={14} />
          </Link>
        </div>
      </main>
      <footer className="pricing-footer">
        <Link href="/">folio.</Link>
        <span>A little clarity goes a long way.</span>
        <Link href="/overview">
          Back to your workspace <ArrowUpRight size={12} />
        </Link>
      </footer>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parseBusinessSetupDraft } from "@/lib/business-setup-draft";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth-client";
import "./real-onboarding.css";
import "./saved-business-profile.css";

type Profile = {
  id: string;
  websiteId: string;
  suiteId: string;
  websiteUrl: string;
  businessName: string;
  description: string;
  audience: string;
  capabilities: string;
  competitors: string[];
  questions: string[];
  savedAt: string;
};
type Draft = {
  websiteUrl: string;
  businessName: string;
  description: string;
  audience: string;
  capabilities: string;
  competitors: string;
  questions: string;
};
const blank: Draft = {
  websiteUrl: "",
  businessName: "",
  description: "",
  audience: "",
  capabilities: "",
  competitors: "",
  questions: "",
};
const key = "folio:business-setup:v1";
const lines = (value: string) =>
  value
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
function fromProfile(p: Profile): Draft {
  return {
    websiteUrl: p.websiteUrl,
    businessName: p.businessName,
    description: p.description,
    audience: p.audience,
    capabilities: p.capabilities,
    competitors: p.competitors.join("\n"),
    questions: p.questions.join("\n"),
  };
}

export default function RealOnboarding() {
  const { data: session, isPending } = useSession();
  const owner = session?.user.id ?? null;
  const previousOwner = useRef<string | null>(null);
  useEffect(() => {
    if (isPending) return;
    const previous = previousOwner.current;
    if (previous && previous !== owner) {
      try {
        for (const draftKey of Object.keys(sessionStorage)) {
          if (draftKey.startsWith(`${key}:${previous}`))
            sessionStorage.removeItem(draftKey);
        }
        sessionStorage.removeItem(key);
      } catch {}
    }
    previousOwner.current = owner;
  }, [owner, isPending]);
  return (
    <div className="business-setup">
      <header>
        <Link href="/">
          folio<span>®</span>
        </Link>
        <Link href="/overview?view=workspace">Your workspace ↗</Link>
      </header>
      <RealSetup key={owner ?? "anonymous"} owner={owner} pending={isPending} />
    </div>
  );
}
function RealSetup({
  owner,
  pending,
}: {
  owner: string | null;
  pending: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(blank);
  const [step, setStep] = useState(1);
  const [ready, setReady] = useState(false);
  const selectedWebsite = useSearchParams().get("website");
  const storageKey = owner
    ? `${key}:${owner}${selectedWebsite ? `:${selectedWebsite}` : ""}`
    : key;
  const [saved, setSaved] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const request = useRef<{ body: string; key: string } | null>(null);
  const generation = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (ready) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "nearest" });
    }
  }, [step, ready]);
  useEffect(() => {
    const controller = new AbortController();
    const version = ++generation.current;
    setReady(false);
    const restore = (transfer = false) => {
      const raw = sessionStorage.getItem(transfer ? key : storageKey);
      if (transfer) sessionStorage.removeItem(key);
      const data = parseBusinessSetupDraft(raw, transfer);
      if (data) {
        setDraft(data.draft);
        setStep(data.step);
        request.current = data.request;
        return true;
      }
      return false;
    };
    const load = async () => {
      try {
        if (owner) {
          const response = await fetch(
            `/api/onboarding${selectedWebsite ? `?website=${encodeURIComponent(selectedWebsite)}` : ""}`,
            {
              signal: controller.signal,
              cache: "no-store",
            },
          );
          if (!response.ok)
            throw new Error(
              "Your saved setup could not be opened. Refresh to retry.",
            );
          const data = await response.json();
          if (restore(true) || restore()) {
          } else if (data.profile && version === generation.current) {
            setDraft(fromProfile(data.profile));
            setSaved(data.profile);
            setStep(4);
            sessionStorage.removeItem(key);
          }
        } else restore();
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Setup could not be opened.",
          );
      } finally {
        if (!controller.signal.aborted) setReady(true);
      }
    };
    if (!pending) void load();
    return () => {
      generation.current++;
      controller.abort();
    };
  }, [owner, pending, storageKey, selectedWebsite]);
  useEffect(() => {
    if (!ready || saved) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          savedAt: Date.now(),
          draft,
          step,
          request: request.current,
        }),
      );
    } catch {}
  }, [ready, draft, step, saved, storageKey]);
  const update = (field: keyof Draft, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setSaved(null);
    setError("");
  };
  const persist = () => {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          savedAt: Date.now(),
          draft,
          step,
          transfer: true,
          request: request.current,
        }),
      );
    } catch {
      setError(
        "Browser storage is unavailable. Keep this tab open while signing in.",
      );
    }
  };
  const validate = () => {
    const url = new URL(
      draft.websiteUrl.includes("://")
        ? draft.websiteUrl
        : `https://${draft.websiteUrl}`,
    );
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !url.hostname.includes(".")
    )
      throw new Error("Enter a public website URL.");
    return url.href;
  };
  const next = () => {
    try {
      if (step === 1) {
        validate();
        if (!draft.businessName.trim())
          throw new Error("Add your business name.");
      }
      if (step === 2 && (!draft.description.trim() || !draft.audience.trim()))
        throw new Error("Describe your business and its customers.");
      if (step === 3) {
        const questions = lines(draft.questions);
        if (
          !questions.length ||
          questions.length > 10 ||
          questions.some((q) => q.length > 300)
        )
          throw new Error(
            "Add 1–10 customer questions, up to 300 characters each.",
          );
      }
      setError("");
      setStep(step + 1);
    } catch (cause) {
      setError((cause as Error).message);
    }
  };
  const save = async () => {
    setSaving(true);
    setError("");
    const version = generation.current;
    try {
      const body = JSON.stringify({
        ...draft,
        websiteUrl: validate(),
        competitors: lines(draft.competitors),
        questions: lines(draft.questions),
      });
      if (request.current?.body !== body)
        request.current = { body, key: crypto.randomUUID() };
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          savedAt: Date.now(),
          draft,
          step,
          request: request.current,
        }),
      );
      const response = await fetch(
        `/api/onboarding${selectedWebsite ? `?website=${encodeURIComponent(selectedWebsite)}` : ""}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...JSON.parse(body),
            requestKey: request.current.key,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Setup could not be saved. Try again.");
      if (version === generation.current) {
        setSaved(data.profile);
        sessionStorage.removeItem(key);
        sessionStorage.removeItem(storageKey);
      }
    } catch (cause) {
      if (version === generation.current) setError((cause as Error).message);
    } finally {
      if (version === generation.current) setSaving(false);
    }
  };
  if (pending || !ready)
    return (
      <main>
        <p role="status">Opening your setup…</p>
      </main>
    );
  return (
    <main>
      <p className="setup-eyebrow">YOUR BUSINESS · PRIVATE WORKSPACE</p>
      <h1>
        {saved
          ? "Your business is ready to follow."
          : "Start with your business."}
      </h1>
      <p className="setup-intro">
        Tell Folio what you do and which customer questions matter. Save your
        reviewed profile and questions to your account.
      </p>
      <p className="setup-honesty">
        Setup is free of research calls. Your wording stays as supplied;
        you choose when to collect evidence later.
      </p>
      <ol className="setup-steps" aria-label="Setup progress">
        {["Website", "Business", "Questions", "Review & save"].map(
          (label, i) => (
            <li key={label} aria-current={step === i + 1 ? "step" : undefined}>
              <span>{i + 1}</span>
              {label}
            </li>
          ),
        )}
      </ol>
      <section className="setup-card">
        <h2 ref={heading} tabIndex={-1}>
          {
            [
              "Your website",
              "Your business, in your words",
              "Questions customers ask",
              "Review your workspace setup",
            ][step - 1]
          }
        </h2>
        {step === 1 && (
          <>
            <label>
              Website URL
              <input
                autoComplete="url"
                placeholder="https://your-business.com"
                value={draft.websiteUrl}
                maxLength={2048}
                onChange={(e) => update("websiteUrl", e.target.value)}
              />
            </label>
            <label>
              Business name
              <input
                autoComplete="organization"
                value={draft.businessName}
                maxLength={100}
                onChange={(e) => update("businessName", e.target.value)}
              />
            </label>
          </>
        )}
        {step === 2 && (
          <>
            {(
              [
                ["description", "What does your business do?"],
                ["audience", "Who is it for?"],
                ["capabilities", "What makes it useful? (optional)"],
              ] as const
            ).map(([field, label]) => (
              <label key={field}>
                {label}
                <textarea
                  value={draft[field]}
                  maxLength={1000}
                  rows={3}
                  onChange={(e) => update(field, e.target.value)}
                />
              </label>
            ))}
          </>
        )}
        {step === 3 && (
          <>
            <label>
              Customer questions, one per line
              <textarea
                rows={6}
                value={draft.questions}
                onChange={(e) => update("questions", e.target.value)}
                placeholder="What would a customer ask when looking for a business like yours?"
              />
            </label>
            <p>
              Select up to 10 questions by including them here. You can edit the
              saved question suite later.
            </p>
            <label>
              Competitors you want to keep in mind (optional, one per line)
              <textarea
                rows={3}
                value={draft.competitors}
                onChange={(e) => update("competitors", e.target.value)}
              />
            </label>
          </>
        )}
        {step === 4 && (
          <>
            <dl className="setup-review">
              <dt>Business</dt>
              <dd>
                {draft.businessName} · {draft.websiteUrl}
              </dd>
              <dt>What you do</dt>
              <dd>{draft.description}</dd>
              <dt>Your customers</dt>
              <dd>{draft.audience}</dd>
              {draft.capabilities && (
                <>
                  <dt>Capabilities</dt>
                  <dd>{draft.capabilities}</dd>
                </>
              )}
              {lines(draft.competitors).length > 0 && (
                <>
                  <dt>Competitors</dt>
                  <dd>{lines(draft.competitors).join(", ")}</dd>
                </>
              )}
            </dl>
            <h3>Your selected questions</h3>
            <ol>
              {lines(draft.questions).map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
            <p className="setup-honesty">
              Owner supplied and reviewed. No results have been collected from
              this setup.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="setup-error">
            {error}
          </p>
        )}
        {step === 4 && !owner && !saved && (
          <p className="setup-sign-in-note">
            Sign in to keep this setup private and return to it later. After
            signing in, you’ll come back here to review and save.
          </p>
        )}
        {saved ? (
          <div role="status">
            <p>
              <strong>Saved privately to your workspace.</strong> Your website
              and question suite are ready. Research requires a separate
              explicit action.
            </p>
            <div className="setup-actions">
              <Link
                className="button primary"
                href={`/overview?view=workspace&website=${encodeURIComponent(saved.websiteId)}`}
              >
                Open your workspace →
              </Link>
              <Link
                className="button"
                href={`/evaluations?view=search&suite=${encodeURIComponent(saved.suiteId)}&website=${encodeURIComponent(saved.websiteId)}`}
              >
                Review saved questions
              </Link>
              <button
                className="button"
                onClick={() => {
                  setSaved(null);
                  setStep(1);
                }}
              >
                Edit profile
              </button>
            </div>
          </div>
        ) : (
          <div className="setup-actions">
            {step > 1 && (
              <button
                className="button"
                disabled={saving}
                onClick={() => setStep(step - 1)}
              >
                ← Back
              </button>
            )}
            {step < 4 ? (
              <button className="button primary" onClick={next}>
                Continue →
              </button>
            ) : owner ? (
              <button
                className="button primary"
                disabled={saving}
                onClick={save}
              >
                {saving ? "Saving…" : "Save to my workspace"}
              </button>
            ) : (
              <Link
                className="button primary"
                href="/login?next=%2Fonboarding"
                onClick={persist}
              >
                Sign in to save privately →
              </Link>
            )}
          </div>
        )}
      </section>
      <p className="setup-example">
        Want to explore first?{" "}
        <Link href="/onboarding?example=1">
          Open the illustrative Codegraff example
        </Link>
      </p>
    </main>
  );
}

export function SavedBusinessProfile({ ownerId, hideWhenEmpty = false }: { ownerId: string; hideWhenEmpty?: boolean }) {
  const selectedWebsite = useSearchParams().get("website");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setProfile(null);
    setLoading(true);
    setError("");
    fetch(
      `/api/onboarding${selectedWebsite ? `?website=${encodeURIComponent(selectedWebsite)}` : ""}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then((r) => {
        if (!r.ok) throw new Error("Your business profile could not be loaded.");
        return r.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) setProfile(data?.profile ?? null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Your business profile could not be loaded.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [ownerId, selectedWebsite, refresh]);
  if (hideWhenEmpty && !loading && !error && !profile) return null;
  return (
    <section className="panel saved-business-profile" aria-busy={loading}>
      <p className="setup-eyebrow">Your reviewed business profile</p>
      {loading ? <p role="status">Loading your business profile…</p> : error ? (
        <><p role="alert">{error}</p><button className="button" onClick={() => setRefresh(value => value + 1)}>Try again</button></>
      ) : profile ? (
        <>
          <header className="saved-profile-heading">
            <h2>{profile.businessName}</h2>
            <span className="saved-profile-private">Private workspace</span>
          </header>
          <p className="saved-profile-description">{profile.description}</p>
          <p className="saved-profile-question-count">{profile.questions.length} saved customer {profile.questions.length === 1 ? "question" : "questions"}</p>
          <details className="saved-profile-details">
            <summary>Business details &amp; saved questions</summary>
            <p className="saved-profile-full-description">{profile.description}</p>
            <dl className="saved-profile-facts">
              <div><dt>Customers</dt><dd>{profile.audience}</dd></div>
              <div><dt>Customer questions</dt><dd>{profile.questions.length} saved customer {profile.questions.length === 1 ? "question" : "questions"}</dd></div>
              <div><dt>Profile source</dt><dd>Owner supplied</dd></div>
            </dl>
            <footer className="saved-profile-footer">
              <p className="saved-profile-note">No visibility measurement implied</p>
              <div className="saved-profile-actions">
                <Link href={`/onboarding?website=${encodeURIComponent(profile.websiteId)}`} className="button">Reopen business setup</Link>
                <Link className="button" href={`/evaluations?view=search&suite=${encodeURIComponent(profile.suiteId)}&website=${encodeURIComponent(profile.websiteId)}`}>Review saved questions →</Link>
              </div>
            </footer>
          </details>
        </>
      ) : (
        <>
          <h2>Set up your business</h2>
          <p>Save your business profile and the customer questions you want to follow.</p>
          <Link className="button" href="/onboarding">Set up your business →</Link>
        </>
      )}
    </section>
  );
}

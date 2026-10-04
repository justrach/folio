"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  ExternalLink,
  EyeOff,
  FileCheck2,
  Globe,
  Info,
  ListChecks,
  PenLine,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { readEvaluationIntent } from "@/lib/evaluation-navigation";
import {
  CLAIM_ORDER,
  PREVIEW_DISCLAIMER,
  SAMPLE_AGENT_ACTION,
  SAMPLE_BUSINESS_NAME,
  SAMPLE_CLAIMS,
  SAMPLE_COMPETITORS,
  SAMPLE_TECHNICAL_SUMMARY,
  SAMPLE_WEBSITE_URL,
  allClaimsDecided,
  assertedClaims,
  buildOnboardingExport,
  comparisonPrompt,
  competitorPosition,
  initialClaimDecisions,
  isSampleWebsite,
  parseLineList,
  reconcileTopics,
  rewriteError,
  sampleObservation,
  sampleTopicsAllowed,
  type ClaimDecisions,
  type ClaimId,
  type ClaimStatus,
  type DraftTopic,
  type QuestionMode,
} from "@/lib/onboarding-mock";
import "./onboarding-mock.css";

const STEPS = [
  { id: 1, label: "Website" },
  { id: 2, label: "Understanding" },
  { id: 3, label: "Goals & competitors" },
  { id: 4, label: "Report plan" },
] as const;

const STATUS_LABEL: Record<ClaimStatus, string> = {
  pending: "Not reviewed",
  accepted: "Looks right",
  rewritten: "Your wording",
  rejected: "Removed",
  uncertain: "Not sure",
};

function normalizeSiteInput(input: string): string | undefined {
  const params = new URLSearchParams({ target: input });
  return readEvaluationIntent(params).targetUrl;
}

export default function OnboardingMock() {
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(1);
  const [siteInput, setSiteInput] = useState("codegraff.com");
  const [confirmedUrl, setConfirmedUrl] = useState<string | undefined>(SAMPLE_WEBSITE_URL);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState(SAMPLE_BUSINESS_NAME);
  const [nameEdit, setNameEdit] = useState<{ normalized: string | undefined; value: string } | null>(null);
  const [decisions, setDecisions] = useState<ClaimDecisions>(initialClaimDecisions);
  const [editDrafts, setEditDrafts] = useState<Record<ClaimId, string | null>>({
    description: null,
    audience: null,
    capabilities: null,
  });
  const [editErrors, setEditErrors] = useState<Partial<Record<ClaimId, string>>>({});
  const [sourceOpen, setSourceOpen] = useState<Partial<Record<ClaimId, boolean>>>({});
  const [knowsCompetitors, setKnowsCompetitors] = useState<"yes" | "unknown" | null>(null);
  const [competitorMode, setCompetitorMode] = useState<"track" | "compare">("track");
  const [competitorsRaw, setCompetitorsRaw] = useState("");
  const [customTopicInput, setCustomTopicInput] = useState("");
  const [customTopics, setCustomTopics] = useState<string[]>([]);
  const [topicError, setTopicError] = useState<string | null>(null);
  const [keywordsRaw, setKeywordsRaw] = useState("");
  const [listErrors, setListErrors] = useState<string[]>([]);
  const [topics, setTopics] = useState<DraftTopic[]>([]);
  const [topicsSignature, setTopicsSignature] = useState("");
  const parkedTopics = useRef(new Map<string, DraftTopic>());
  const [questionGateError, setQuestionGateError] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [needsScroll, setNeedsScroll] = useState(false);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const skipFocusRef = useRef(true);

  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (skipFocusRef.current) {
      skipFocusRef.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: "start" });
  }, [step]);

  const siteIsSample = isSampleWebsite(confirmedUrl);
  const competitorList = useMemo(() => parseLineList(competitorsRaw), [competitorsRaw]);
  const keywordList = useMemo(() => parseLineList(keywordsRaw), [keywordsRaw]);
  const namedCompetitors = knowsCompetitors === "yes" ? competitorList.entries : [];
  const questionMode: QuestionMode =
    competitorMode === "compare" && namedCompetitors.length > 0 ? "named-comparison" : "open";
  const editPending = CLAIM_ORDER.some((id) => editDrafts[id] !== null);
  const includeSampleTopics = sampleTopicsAllowed(decisions, siteIsSample);

  useEffect(() => {
    if (step !== 5) return;
    const el = tableWrapRef.current;
    if (el) setNeedsScroll(el.scrollWidth > el.clientWidth + 1);
  }, [step, topics, namedCompetitors.length]);

  const resetDependentState = (url: string | undefined) => {
    const sample = isSampleWebsite(url);
    setBusinessName(sample ? SAMPLE_BUSINESS_NAME : "");
    setDecisions(initialClaimDecisions());
    setEditDrafts({ description: null, audience: null, capabilities: null });
    setEditErrors({});
    setSourceOpen({});
    setKnowsCompetitors(null);
    setCompetitorMode("track");
    setCompetitorsRaw("");
    setCustomTopicInput("");
    setCustomTopics([]);
    setTopicError(null);
    setKeywordsRaw("");
    setListErrors([]);
    setTopics([]);
    setTopicsSignature("");
    parkedTopics.current = new Map();
    setQuestionGateError(false);
    setBriefOpen(false);
    setNameEdit(null);
  };

  const previewSite = () => {
    const normalized = normalizeSiteInput(siteInput);
    if (!normalized) {
      setUrlError(
        "Enter a public website address such as codegraff.com or https://example.org. Spaces, IP addresses, and local names are not supported.",
      );
      return;
    }
    setUrlError(null);
    if (normalized !== confirmedUrl) {
      resetDependentState(normalized);
      if (nameEdit && nameEdit.normalized === normalized) {
        setBusinessName(nameEdit.value);
      }
    }
    setConfirmedUrl(normalized);
    setStep(2);
  };

  const setClaimStatus = (id: ClaimId, status: ClaimStatus) => {
    setDecisions((prev) => {
      const revision = prev[id].revision?.trim() ? prev[id].revision : undefined;
      if (status === "accepted" && revision) {
        return { ...prev, [id]: { status: "rewritten", revision } };
      }
      return { ...prev, [id]: { status, ...(revision ? { revision } : {}) } };
    });
    setEditDrafts((prev) => ({ ...prev, [id]: null }));
  };

  const useOriginalSuggestion = (id: ClaimId) => {
    setDecisions((prev) => ({ ...prev, [id]: { status: "accepted" } }));
    setEditDrafts((prev) => ({ ...prev, [id]: null }));
    setEditErrors((prev) => ({ ...prev, [id]: undefined }));
  };

  const applyEdit = (id: ClaimId) => {
    const draft = editDrafts[id] ?? "";
    const error = rewriteError(draft);
    if (error) {
      setEditErrors((prev) => ({ ...prev, [id]: error }));
      return;
    }
    setEditErrors((prev) => ({ ...prev, [id]: undefined }));
    setDecisions((prev) => ({ ...prev, [id]: { status: "rewritten", revision: draft.trim() } }));
    setEditDrafts((prev) => ({ ...prev, [id]: null }));
  };

  const reconcileNow = (custom: string[], keywords: string[]) => {
    const signature = JSON.stringify([includeSampleTopics, custom, keywords]);
    const { topics: next, parked } = reconcileTopics(topics, parkedTopics.current, {
      includeSample: includeSampleTopics,
      customLabels: custom,
      keywordGoals: keywords,
    });
    parkedTopics.current = parked;
    setTopics(next);
    setTopicsSignature(signature);
  };

  const refreshTopics = () => {
    const signature = JSON.stringify([includeSampleTopics, customTopics, keywordList.entries]);
    if (signature === topicsSignature) return;
    reconcileNow(customTopics, keywordList.entries);
  };

  const addCustomTopic = () => {
    const parsed = parseLineList(customTopicInput, { maxEntries: 1 });
    if (parsed.errors.length > 0 || parsed.entries.length === 0) {
      setTopicError(parsed.errors[0] ?? "Enter a topic before adding it.");
      return;
    }
    const label = parsed.entries[0];
    const existing = [...customTopics, ...keywordList.entries].map((t) => t.toLowerCase());
    if (existing.includes(label.toLowerCase())) {
      setTopicError("That topic is already listed.");
      return;
    }
    if (customTopics.length >= 10) {
      setTopicError("Topics are limited to 10 custom entries.");
      return;
    }
    setTopicError(null);
    const nextCustom = [...customTopics, label];
    setCustomTopics(nextCustom);
    setCustomTopicInput("");
    reconcileNow(nextCustom, keywordList.entries);
  };

  const continueFromGoals = () => {
    const errors = [
      ...(knowsCompetitors === "yes" ? competitorList.errors : []),
      ...keywordList.errors,
    ];
    setListErrors(errors);
    if (errors.length > 0) return;
    refreshTopics();
    setStep(4);
  };

  const selectedTopics = topics.filter((t) => t.selected && t.question.trim().length > 0);
  const canPreviewReport = selectedTopics.length > 0;

  const downloadBrief = () => {
    const payload = buildOnboardingExport({
      websiteUrl: confirmedUrl,
      businessName,
      decisions,
      topics,
      competitors: namedCompetitors,
      keywordGoals: keywordList.entries,
      mode: questionMode,
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "onboarding-preview-brief.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const startOver = () => {
    setSiteInput("codegraff.com");
    setConfirmedUrl(SAMPLE_WEBSITE_URL);
    setUrlError(null);
    resetDependentState(SAMPLE_WEBSITE_URL);
    setStep(1);
  };

  const claimsReviewed = CLAIM_ORDER.filter((id) => decisions[id].status !== "pending").length;

  const renderStep1 = () => (
    <>
      <p className="ob-kicker">Step 1 · Website</p>
      <h1 className="ob-title" ref={headingRef} tabIndex={-1}>Which website should we look at?</h1>
      <p className="ob-lede">
        Type a public website address. This preview is prefilled with a sample site and never fetches
        the real page — the address only decides which sample (if any) is shown.
      </p>
      <section className="ob-card" aria-label="Website details">
        <div className="ob-field">
          <label htmlFor="ob-site-url">Website address</label>
          <input
            id="ob-site-url"
            className="ob-input"
            value={siteInput}
            onChange={(event) => setSiteInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") previewSite();
            }}
            placeholder="example.com"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="ob-hint">No DNS setup needed. Nothing is fetched for this preview.</p>
        </div>
        {urlError ? (
          <p className="ob-alert" role="alert">
            <AlertCircle size={16} aria-hidden />
            <span>{urlError}</span>
          </p>
        ) : null}
        <div className="ob-field">
          <label htmlFor="ob-business-name">Business name</label>
          <input
            id="ob-business-name"
            className="ob-input"
            value={businessName}
            onChange={(event) => {
              setBusinessName(event.target.value);
              setNameEdit({ normalized: normalizeSiteInput(siteInput), value: event.target.value });
            }}
            placeholder={siteIsSample ? SAMPLE_BUSINESS_NAME : "Your business name"}
          />
          <p className="ob-hint">
            {siteIsSample
              ? "Suggested from the sample site. Edit it if we got it wrong."
              : "No sample identity is available for this site — type the business name yourself."}
          </p>
        </div>
        {siteIsSample ? (
          <p className="ob-plan">
            <Globe size={16} aria-hidden />
            <span>
              Business identity preview: <strong>{businessName || SAMPLE_BUSINESS_NAME}</strong> —
              sample claims about this business are reviewed on the next step.
            </span>
          </p>
        ) : (
          <p className="ob-plan">
            <EyeOff size={16} aria-hidden />
            <span>
              There is no supplied evidence or sample analysis for this site. You can still walk
              through the flow with your own wording, or{" "}
              <button
                type="button"
                className="ob-link"
                onClick={() => {
                  setSiteInput("codegraff.com");
                  setUrlError(null);
                }}
              >
                reset to the Codegraff example
              </button>
              .
            </span>
          </p>
        )}
        <div className="ob-actions">
          <button type="button" className="ob-button ob-button-primary" onClick={previewSite}>
            Preview website understanding
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      </section>
    </>
  );

  const renderClaimCard = (id: ClaimId) => {
    const claim = SAMPLE_CLAIMS[id];
    const decision = decisions[id];
    const editing = editDrafts[id] !== null;
    const excluded = decision.status === "rejected" || decision.status === "uncertain";
    const shownText = decision.revision ? decision.revision : claim.text;
    return (
      <article className="ob-claim" key={id} data-claim={id}>
        <div className="ob-claim-head">
          <span className="ob-claim-label">{claim.label}</span>
          <span
            className="ob-status"
            data-tone={decision.status === "accepted" || decision.status === "rewritten" ? "confirmed" : "excluded"}
          >
            {STATUS_LABEL[decision.status]}
          </span>
        </div>
        <p className="ob-claim-text" data-struck={excluded}>
          {shownText}
        </p>
        {decision.revision ? (
          <details className="ob-details">
            <summary>Original suggestion</summary>
            <p>{claim.text}</p>
            <div className="ob-actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="ob-button ob-button-quiet"
                onClick={() => useOriginalSuggestion(id)}
              >
                Use original suggestion
              </button>
            </div>
          </details>
        ) : null}
        <div className="ob-claim-actions" role="group" aria-label={`Review ${claim.label}`}>
          <button
            type="button"
            className="ob-choice"
            data-selected={decision.status === "accepted"}
            aria-pressed={decision.status === "accepted"}
            onClick={() => setClaimStatus(id, "accepted")}
          >
            <CheckCircle2 size={14} aria-hidden /> Looks right
          </button>
          <button
            type="button"
            className="ob-choice"
            data-selected={decision.status === "rewritten" || editing}
            aria-pressed={decision.status === "rewritten" || editing}
            onClick={() =>
              setEditDrafts((prev) => ({ ...prev, [id]: prev[id] ?? decisions[id].revision ?? claim.text }))
            }
          >
            <PenLine size={14} aria-hidden /> Edit
          </button>
          <details className="ob-other">
            <summary className="ob-choice" aria-label={`Other options for ${claim.label}`}>
              Other options
            </summary>
            <div className="ob-other-menu">
              <button
                type="button"
                className="ob-choice"
                data-selected={decision.status === "rejected"}
                aria-pressed={decision.status === "rejected"}
                onClick={() => setClaimStatus(id, "rejected")}
              >
                Remove
              </button>
              <button
                type="button"
                className="ob-choice"
                data-selected={decision.status === "uncertain"}
                aria-pressed={decision.status === "uncertain"}
                onClick={() => setClaimStatus(id, "uncertain")}
              >
                Not sure
              </button>
            </div>
          </details>
        </div>
        {editing ? (
          <div className="ob-field">
            <label htmlFor={`ob-edit-${id}`}>Your wording for {claim.label.toLowerCase()}</label>
            <textarea
              id={`ob-edit-${id}`}
              className="ob-textarea"
              value={editDrafts[id] ?? ""}
              onChange={(event) => setEditDrafts((prev) => ({ ...prev, [id]: event.target.value }))}
            />
            {editErrors[id] ? (
              <p className="ob-alert" role="alert">
                <AlertCircle size={16} aria-hidden />
                <span>{editErrors[id]}</span>
              </p>
            ) : null}
            <div className="ob-actions">
              <button type="button" className="ob-button ob-button-primary" onClick={() => applyEdit(id)}>
                Use my wording
              </button>
              <button
                type="button"
                className="ob-button ob-button-quiet"
                onClick={() => {
                  setEditDrafts((prev) => ({ ...prev, [id]: null }));
                  setEditErrors((prev) => ({ ...prev, [id]: undefined }));
                }}
              >
                Cancel edit
              </button>
            </div>
          </div>
        ) : null}
        <button
          type="button"
          className="ob-link"
          aria-expanded={!!sourceOpen[id]}
          onClick={() => setSourceOpen((prev) => ({ ...prev, [id]: !prev[id] }))}
        >
          Source details
        </button>
        {sourceOpen[id] ? (
          <div className="ob-claim-source" data-source-details={id}>
            <span>{claim.sourceLabel}</span>
            <blockquote className="ob-excerpt">“{claim.sourceExcerpt}”</blockquote>
            <span>
              Suggested business statement — not independently verified. From{" "}
              <a href={claim.sourceUrl} target="_blank" rel="noreferrer">
                {claim.sourceUrl} <ExternalLink size={11} aria-hidden />
              </a>
            </span>
          </div>
        ) : null}
      </article>
    );
  };

  const renderStep2 = () => (
    <>
      <p className="ob-kicker">Step 2 · Understanding</p>
      <h1 className="ob-title" ref={headingRef} tabIndex={-1}>Does this sound like your business?</h1>
      <p className="ob-lede">
        {siteIsSample
          ? "Here is one business identity assembled from the sample capture. Review each statement — nothing is treated as confirmed until you say so."
          : "No sample analysis exists for this site. Describe the business in your own words below — anything you write here stays in this preview only."}
      </p>
      {siteIsSample ? (
        <>
          {CLAIM_ORDER.map(renderClaimCard)}
          <details className="ob-details">
            <summary>What about names like Harness or Graff?</summary>
            <p>
              Related offering names can be parts of the same business. This preview treats Codegraff
              as the single business identity — you do not need to split products into separate
              brands or pick one feature to focus on. Correct the statements above if the wording is
              wrong.
            </p>
          </details>
          <details className="ob-details">
            <summary>Illustrative technical summary</summary>
            <ul className="ob-tech-list">
              {SAMPLE_TECHNICAL_SUMMARY.map((item) => (
                <li key={item.label}>
                  <FileCheck2 size={16} aria-hidden />
                  <span>
                    <strong>{item.label}:</strong> {item.detail}
                  </span>
                </li>
              ))}
            </ul>
            <p>Fixture details only — no live audit ran and no score is produced.</p>
          </details>
          {!allClaimsDecided(decisions) ? (
            <p className="ob-plan" role="status">
              <Info size={16} aria-hidden />
              <span>Review all three statements to continue. Marking one “Remove” or “Not sure” is fine.</span>
            </p>
          ) : null}
        </>
      ) : (
        <section className="ob-card" aria-label="Describe the business">
          <p className="ob-hint">
            These fields are optional. Any wording you add is used as your own context — it is not
            sample analysis.
          </p>
          {CLAIM_ORDER.map((id) => (
            <div className="ob-field" key={id}>
              <label htmlFor={`ob-manual-${id}`}>{SAMPLE_CLAIMS[id].label}</label>
              <textarea
                id={`ob-manual-${id}`}
                className="ob-textarea"
                value={decisions[id].revision ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setDecisions((prev) => ({
                    ...prev,
                    [id]: value.trim()
                      ? { status: "rewritten", revision: value }
                      : { status: "pending" },
                  }));
                }}
              />
            </div>
          ))}
        </section>
      )}
      <div className="ob-actions">
        <button type="button" className="ob-button ob-button-quiet" onClick={() => setStep(1)}>
          <ChevronLeft size={16} aria-hidden /> Back
        </button>
        <button
          type="button"
          className="ob-button ob-button-primary"
          disabled={editPending || (siteIsSample && !allClaimsDecided(decisions))}
          onClick={() => {
            refreshTopics();
            setStep(3);
          }}
        >
          Continue
          <ChevronRight size={16} aria-hidden />
        </button>
        {editPending ? (
          <span className="ob-hint">Finish or cancel the open edit before continuing.</span>
        ) : null}
      </div>
    </>
  );

  const removeCustomTopic = (label: string) => {
    const next = customTopics.filter((t) => t !== label);
    setCustomTopics(next);
    reconcileNow(next, keywordList.entries);
  };

  const renderTopicChip = (topic: DraftTopic, index: number) => (
    <div className="ob-topic-chip" key={`${topic.origin}-${topic.id}`}>
      <label className="ob-topic-chip-label">
        <input
          type="checkbox"
          id={`ob-topic-${index}`}
          aria-label={`Include topic ${topic.label}`}
          checked={topic.selected}
          onChange={(event) =>
            setTopics((prev) =>
              prev.map((t, i) => (i === index ? { ...t, selected: event.target.checked } : t)),
            )
          }
        />
        <span>{topic.label}</span>
      </label>
      {topic.origin === "custom" ? (
        <button
          type="button"
          className="ob-topic-remove"
          aria-label={`Remove topic ${topic.label}`}
          onClick={() => removeCustomTopic(topic.label)}
        >
          Remove topic
        </button>
      ) : null}
    </div>
  );

  const renderTopicRow = (topic: DraftTopic, index: number, editable: boolean) => (
    <article className="ob-question" key={`${topic.origin}-${topic.id}`} data-selected={topic.selected}>
      <div className="ob-question-head">
        <input
          type="checkbox"
          id={`ob-topic-${index}`}
          aria-label={editable ? `Include candidate question ${index + 1}` : `Include topic ${topic.label}`}
          checked={topic.selected}
          onChange={(event) =>
            setTopics((prev) =>
              prev.map((t, i) => (i === index ? { ...t, selected: event.target.checked } : t)),
            )
          }
        />
        <div className="ob-field" style={{ flex: 1 }}>
          <span className="ob-label">Based on your topic: {topic.label}</span>
          {editable ? (
            <textarea
              id={`ob-q-${index}`}
              aria-label={`Candidate question ${index + 1}`}
              className="ob-textarea"
              value={topic.question}
              onChange={(event) =>
                setTopics((prev) =>
                  prev.map((t, i) => (i === index ? { ...t, question: event.target.value } : t)),
                )
              }
            />
          ) : (
            <p className="ob-claim-text" style={{ fontSize: 15 }}>{topic.question}</p>
          )}
        </div>
      </div>
      <div className="ob-question-meta">
        <span className="ob-tag" data-tone={topic.origin === "sample" ? "sample" : undefined}>
          {topic.origin === "sample"
            ? "Rule-based demo suggestion"
            : topic.origin === "keyword"
              ? "From your keyword goal"
              : "Your topic"}
        </span>
        {topic.question !== topic.originalQuestion ? <span className="ob-tag">Edited</span> : null}
      </div>
    </article>
  );

  const renderStep3 = () => {
    const descriptionClaim = assertedClaims(decisions, siteIsSample).find((c) => c.id === "description");
    return (
      <>
        <p className="ob-kicker">Step 3 · Goals & competitors</p>
        <h1 className="ob-title" ref={headingRef} tabIndex={-1}>What would you like people to discover you for?</h1>
        <p className="ob-lede">
          Topics become the questions in your report plan. Everything here is optional — a report can
          also start from the suggested topics alone.
        </p>
        <section className="ob-card" aria-label="Reviewed description">
          <span className="ob-label">Your reviewed description</span>
          {descriptionClaim ? (
            <p className="ob-claim-text" style={{ fontSize: 15 }}>{descriptionClaim.text}</p>
          ) : (
            <p className="ob-hint">No description is confirmed yet — topics still work without one.</p>
          )}
        </section>
        <section className="ob-card" aria-label="Discovery topics">
          <span className="ob-label">Topics</span>
          {includeSampleTopics ? (
            <p className="ob-hint">Rule-based demo suggestions, not AI-generated research.</p>
          ) : siteIsSample ? (
            <p className="ob-hint">
              Your offering description changed. Choose your own topics instead of carrying over our
              earlier assumptions.
            </p>
          ) : (
            <p className="ob-hint">Add a topic to prepare your report.</p>
          )}
          {topics.length > 0 ? (
            <div className="ob-topic-list">
              {topics.map((topic, index) => renderTopicChip(topic, index))}
            </div>
          ) : null}
          <div className="ob-field">
            <label htmlFor="ob-new-topic">Add another topic</label>
            <div className="ob-inline">
              <input
                id="ob-new-topic"
                className="ob-input"
                value={customTopicInput}
                onChange={(event) => setCustomTopicInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomTopic();
                  }
                }}
                placeholder="e.g. reviewing agent output"
              />
              <button type="button" className="ob-button ob-button-secondary" onClick={addCustomTopic}>
                <Plus size={14} aria-hidden /> Add topic
              </button>
            </div>
            {topicError ? (
              <p className="ob-alert" role="alert">
                <AlertCircle size={16} aria-hidden />
                <span>{topicError}</span>
              </p>
            ) : null}
            <p className="ob-hint">Up to 10 custom topics, 200 characters each.</p>
          </div>
          <details className="ob-details">
            <summary>Keyword goals (optional)</summary>
            <div className="ob-field">
              <label htmlFor="ob-keywords">Keyword goals (one per line, up to 10)</label>
              <textarea
                id="ob-keywords"
                className="ob-textarea"
                value={keywordsRaw}
                onChange={(event) => setKeywordsRaw(event.target.value)}
                placeholder={"topics you want to be recommended for"}
              />
              <p className="ob-hint">
                Leave this blank to use the sample website’s suggested questions. No demand is measured.
              </p>
            </div>
          </details>
        </section>
        <section className="ob-card" aria-label="Competitor tracking">
          <span className="ob-label">Do you know your competitors?</span>
          <div className="ob-radio-row" role="group" aria-label="Do you know your competitors?">
            <button
              type="button"
              className="ob-choice"
              data-selected={knowsCompetitors === "yes"}
              aria-pressed={knowsCompetitors === "yes"}
              onClick={() => setKnowsCompetitors("yes")}
            >
              Yes
            </button>
            <button
              type="button"
              className="ob-choice"
              data-selected={knowsCompetitors === "unknown"}
              aria-pressed={knowsCompetitors === "unknown"}
              onClick={() => setKnowsCompetitors("unknown")}
            >
              I don’t know yet
            </button>
          </div>
          {siteIsSample ? (
            <div className="ob-actions">
              <button
                type="button"
                className="ob-button ob-button-secondary"
                onClick={() => {
                  setCompetitorsRaw(SAMPLE_COMPETITORS.join("\n"));
                  setKnowsCompetitors("yes");
                }}
              >
                <Sparkles size={14} aria-hidden /> Use sample competitors
              </button>
            </div>
          ) : null}
          {knowsCompetitors === "yes" ? (
            <>
              <div className="ob-field">
                <label htmlFor="ob-competitors">Competitors (one per line, up to 10)</label>
                <textarea
                  id="ob-competitors"
                  className="ob-textarea"
                  value={competitorsRaw}
                  onChange={(event) => setCompetitorsRaw(event.target.value)}
                  placeholder={"Competitor one\nCompetitor two"}
                />
              </div>
              <div className="ob-radio-row" role="group" aria-label="How to use competitors">
                <button
                  type="button"
                  className="ob-choice"
                  data-selected={competitorMode === "track"}
                  aria-pressed={competitorMode === "track"}
                  onClick={() => setCompetitorMode("track")}
                >
                  Track competitors
                </button>
                <button
                  type="button"
                  className="ob-choice"
                  data-selected={competitorMode === "compare"}
                  aria-pressed={competitorMode === "compare"}
                  onClick={() => setCompetitorMode("compare")}
                >
                  Compare specific businesses
                </button>
              </div>
              <p className="ob-plan">
                <ListChecks size={16} aria-hidden />
                {questionMode === "named-comparison" ? (
                  <span>
                    Plan: <strong>named comparison</strong> — questions will name{" "}
                    {namedCompetitors.join(", ")} explicitly. This is a comparison against names you
                    supplied, not a neutral market ranking.
                  </span>
                ) : (
                  <span>
                    Plan: <strong>open discovery</strong> — track their appearances without adding
                    their names to the question.
                  </span>
                )}
              </p>
            </>
          ) : (
            <p className="ob-plan">
              <ListChecks size={16} aria-hidden />
              <span>
                Plan: <strong>open discovery</strong> — no competitor names are added to the questions.
                {competitorsRaw.trim() ? " Your competitor draft is kept if you switch back to Yes." : ""}
              </span>
            </p>
          )}
          {listErrors.length > 0 ? (
            <p className="ob-alert" role="alert">
              <AlertCircle size={16} aria-hidden />
              <span>{listErrors.join(" ")}</span>
            </p>
          ) : null}
        </section>
        <div className="ob-actions">
          <button type="button" className="ob-button ob-button-quiet" onClick={() => setStep(2)}>
            <ChevronLeft size={16} aria-hidden /> Back
          </button>
          <button type="button" className="ob-button ob-button-primary" onClick={continueFromGoals}>
            Continue
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      </>
    );
  };

  const renderStep4 = () => {
    const profile = assertedClaims(decisions, siteIsSample);
    return (
      <>
        <p className="ob-kicker">Step 4 · Report plan</p>
        <h1 className="ob-title" ref={headingRef} tabIndex={-1}>Review your report plan</h1>
        <p className="ob-lede">
          These are the candidate questions for your first report — hypotheses to explore, not
          measured search demand. Edit the wording freely; edited questions have no sample answer.
        </p>
        <section className="ob-card" aria-label="Reviewed context">
          <dl className="ob-summary-grid">
            <div className="ob-summary-item">
              <dt>Website</dt>
              <dd>{confirmedUrl ?? "—"}</dd>
            </div>
            <div className="ob-summary-item">
              <dt>Business name</dt>
              <dd>{businessName.trim() || "—"}</dd>
            </div>
            <div className="ob-summary-item">
              <dt>Competitors</dt>
              <dd>
                {namedCompetitors.length
                  ? `${namedCompetitors.join(", ")} (${questionMode === "named-comparison" ? "named comparison" : "tracked, not named in questions"})`
                  : "Open discovery — none named"}
              </dd>
            </div>
            <div className="ob-summary-item">
              <dt>Keyword goals</dt>
              <dd>{keywordList.entries.length ? keywordList.entries.join(", ") : "—"}</dd>
            </div>
          </dl>
          {profile.length > 0 ? (
            <ul className="ob-tech-list" aria-label="Confirmed business profile">
              {profile.map((claim) => (
                <li key={claim.id}>
                  <CheckCircle2 size={16} aria-hidden />
                  <span>
                    <strong>{claim.label}:</strong> {claim.text}
                    {claim.revised ? " (your wording)" : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ob-hint">No business statements are confirmed in this plan.</p>
          )}
        </section>
        {topics.map((topic, index) => (
          <div key={`${topic.origin}-${topic.id}`}>
            {renderTopicRow(topic, index, true)}
            {questionMode === "named-comparison" && topic.selected ? (
              <p className="ob-hint" style={{ marginTop: -4 }}>
                Comparison prompt shown: “{comparisonPrompt(topic.question, namedCompetitors)}”
              </p>
            ) : null}
          </div>
        ))}
        {topics.length === 0 ? (
          <p className="ob-plan">
            <Info size={16} aria-hidden />
            <span>No topics yet — go back and add one, or select a suggested topic.</span>
          </p>
        ) : null}
        {questionGateError ? (
          <p className="ob-alert" role="alert">
            <AlertCircle size={16} aria-hidden />
            <span>Select at least one question with text before previewing.</span>
          </p>
        ) : null}
        <p className="ob-hint">
          Demo only: no collection starts, no charge, nothing is saved. A production report allowance
          is not implemented in this preview.
        </p>
        <div className="ob-actions">
          <button type="button" className="ob-button ob-button-quiet" onClick={() => setStep(3)}>
            <ChevronLeft size={16} aria-hidden /> Back
          </button>
          <button
            type="button"
            className="ob-button ob-button-primary"
            onClick={() => {
              if (!canPreviewReport) {
                setQuestionGateError(true);
                return;
              }
              setQuestionGateError(false);
              setStep(5);
            }}
          >
            Preview first report
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      </>
    );
  };

  const renderReport = () => {
    const businessLabel = businessName.trim() || "Your business";
    const profile = assertedClaims(decisions, siteIsSample);
    const anyObservation = selectedTopics.some(
      (topic) => sampleObservation(topic, { siteIsSample, mode: questionMode }) !== null,
    );
    return (
      <>
        <p className="ob-kicker">Report preview</p>
        <h1 className="ob-title" ref={headingRef} tabIndex={-1}>Your first report preview</h1>
        <p className="ob-lede">
          Everything below is illustrative sample output. Refreshing the page resets it — nothing was
          fetched, measured, or saved.
        </p>
        {anyObservation ? (
          <p className="ob-caption" id="ob-report-caption">
            <Info size={14} aria-hidden /> Illustrative AI-answer order, not Google rankings
          </p>
        ) : null}
        {needsScroll ? (
          <p className="ob-hint" id="ob-table-scroll-hint">Scroll to see all tracked competitors.</p>
        ) : null}
        <div
          className="ob-table-wrap"
          ref={tableWrapRef}
          {...(needsScroll
            ? {
                role: "region",
                tabIndex: 0,
                "aria-label": "Comparison table — scrollable horizontally",
                "aria-describedby": "ob-table-scroll-hint",
              }
            : {})}
        >
          <table
            className="ob-table"
            role="table"
            aria-describedby={anyObservation ? "ob-report-caption" : undefined}
          >
            <caption className="ob-vh">Report preview comparison</caption>
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">Question</th>
                <th scope="col" role="columnheader">{businessLabel}</th>
                {namedCompetitors.map((name) => (
                  <th scope="col" role="columnheader" key={name}>{name}</th>
                ))}
              </tr>
            </thead>
            <tbody role="rowgroup">
              {selectedTopics.map((topic) => {
                const observation = sampleObservation(topic, { siteIsSample, mode: questionMode });
                const cell = (name: string, label: string) => (
                  <>
                    <span className="ob-cell-label" aria-hidden="true">{label}</span>
                    {!observation ? (
                      <span className="ob-none">No sample observation</span>
                    ) : competitorPosition(name, observation.positions) === null ? (
                      <span className="ob-none">Not included in sample</span>
                    ) : (
                      <span>Sample position {competitorPosition(name, observation.positions)}</span>
                    )}
                  </>
                );
                const businessKey = siteIsSample ? SAMPLE_BUSINESS_NAME : businessLabel;
                return (
                  <tr role="row" key={`${topic.origin}-${topic.id}`}>
                    <th scope="row" role="rowheader">
                      {questionMode === "named-comparison"
                        ? comparisonPrompt(topic.question, namedCompetitors)
                        : topic.question}
                      {observation ? (
                        <span className="ob-table-details">
                          <details className="ob-details">
                            <summary>Data provenance</summary>
                            <p>
                              This answer order is static demo fixture data bundled with the preview.
                              It is not based on earlier live retrieval, is not a score, and only
                              exists for this exact unedited question on the sample site.
                            </p>
                          </details>
                          <details className="ob-details">
                            <summary>Related evidence</summary>
                            <p>
                              Similar questions were asked in other sample explorations, but a
                              similar question is not the same measurement — no numbers from those
                              explorations are shown here.
                            </p>
                          </details>
                        </span>
                      ) : null}
                    </th>
                    <td role="cell" data-you={siteIsSample && observation?.positions.includes(SAMPLE_BUSINESS_NAME)}>
                      {cell(businessKey, businessLabel)}
                    </td>
                    {namedCompetitors.map((name) => (
                      <td role="cell" key={name}>{cell(name, name)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {profile.length > 0 ? (
          <ul className="ob-tech-list" aria-label="Confirmed business profile">
            {profile.map((claim) => (
              <li key={claim.id}>
                <CheckCircle2 size={16} aria-hidden />
                <span>
                  <strong>{claim.label}:</strong> {claim.text}
                  {claim.revised ? " (your wording)" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {siteIsSample ? (
          <section className="ob-agent-card" aria-label="Sample agent action">
            <div className="ob-agent-head">
              <Sparkles size={16} aria-hidden /> Sample agent action — advisory fixture
            </div>
            <dl className="ob-agent-body">
              <div className="ob-agent-field">
                <dt>Action</dt>
                <dd>{SAMPLE_AGENT_ACTION.title}</dd>
              </div>
              <div className="ob-agent-field">
                <dt>Observation</dt>
                <dd>{SAMPLE_AGENT_ACTION.observation}</dd>
              </div>
              <div className="ob-agent-field">
                <dt>Recommendation</dt>
                <dd>{SAMPLE_AGENT_ACTION.recommendation}</dd>
              </div>
              <div className="ob-agent-field">
                <dt>How to verify</dt>
                <dd>{SAMPLE_AGENT_ACTION.verification}</dd>
              </div>
            </dl>
          </section>
        ) : null}
        {briefOpen ? (
          <section className="ob-card" aria-label="Agent brief" data-brief>
            <h2 className="ob-brief-title">
              <ClipboardList size={18} aria-hidden /> Agent brief — preview only
            </h2>
            <p className="ob-hint">No agent is connected; nothing is sent or executed.</p>
            <dl className="ob-agent-body" style={{ padding: 0 }}>
              <div className="ob-agent-field">
                <dt>Reviewed description</dt>
                <dd>{profile.map((c) => c.text).join(" ") || "No confirmed description."}</dd>
              </div>
              <div className="ob-agent-field">
                <dt>Mode</dt>
                <dd>
                  {questionMode === "named-comparison"
                    ? `Named comparison against: ${namedCompetitors.join(", ")}`
                    : "Open discovery"}
                </dd>
              </div>
              {namedCompetitors.length > 0 ? (
                <div className="ob-agent-field">
                  <dt>Tracked competitors</dt>
                  <dd>
                    {namedCompetitors.join(", ")}
                    {questionMode === "open" ? " (tracked, not named in questions)" : ""}
                  </dd>
                </div>
              ) : null}
              <div className="ob-agent-field">
                <dt>Selected questions</dt>
                <dd>
                  <ul className="ob-tech-list">
                    {selectedTopics.map((t) => (
                      <li key={`${t.origin}-${t.id}`}>
                        {questionMode === "named-comparison"
                          ? comparisonPrompt(t.question, namedCompetitors)
                          : t.question}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
              <div className="ob-agent-field">
                <dt>Advisory recommendation</dt>
                <dd>{SAMPLE_AGENT_ACTION.recommendation}</dd>
              </div>
              <div className="ob-agent-field">
                <dt>Retest</dt>
                <dd>{SAMPLE_AGENT_ACTION.verification}</dd>
              </div>
            </dl>
          </section>
        ) : null}
        <div className="ob-actions">
          {siteIsSample ? (
            <button
              type="button"
              className="ob-button ob-button-primary"
              aria-expanded={briefOpen}
              onClick={() => setBriefOpen((prev) => !prev)}
            >
              <ClipboardList size={16} aria-hidden /> Review agent brief
            </button>
          ) : null}
          <button type="button" className="ob-button ob-button-secondary" onClick={downloadBrief}>
            <Download size={16} aria-hidden /> Download agent brief
          </button>
          <button type="button" className="ob-button ob-button-quiet" onClick={() => setStep(2)}>
            Edit understanding
          </button>
          <button type="button" className="ob-button ob-button-quiet" onClick={() => setStep(3)}>
            Edit goals
          </button>
          <button type="button" className="ob-button ob-button-quiet" onClick={startOver}>
            <RotateCcw size={16} aria-hidden /> Start over
          </button>
        </div>
      </>
    );
  };

  const stepContent =
    step === 5 ? renderReport : ([renderStep1, renderStep2, renderStep3, renderStep4][step - 1] ?? renderStep1);

  return (
    <div className="onboarding-mock" data-ready={ready}>
      <header className="ob-banner">
        <span className="ob-banner-tag">
          <EyeOff size={12} aria-hidden /> Onboarding preview · Sample data
        </span>
        <p>{PREVIEW_DISCLAIMER}</p>
      </header>
      <div className="ob-shell" data-report={step === 5}>
        <nav aria-label="Onboarding steps">
          <ol className="ob-rail">
            {STEPS.map((item) => (
              <li
                key={item.id}
                className="ob-rail-step"
                data-active={step === item.id}
                data-complete={step > item.id}
                aria-current={step === item.id ? "step" : undefined}
              >
                <span className="ob-rail-index">{item.id}</span>
                <span>{item.label}</span>
              </li>
            ))}
          </ol>
        </nav>
        <main className="ob-main">
          <fieldset className="ob-step-body" disabled={!ready}>
            {stepContent()}
          </fieldset>
        </main>
        <aside className="ob-aside" aria-label="Preview context">
          <div className="ob-aside-card">
            <h2>
              <ClipboardList size={14} aria-hidden style={{ verticalAlign: "-2px" }} /> Context so far
            </h2>
            <div className="ob-aside-row">
              <span className="ob-aside-key">Website</span>
              <span className="ob-aside-val">{confirmedUrl ?? "Not confirmed yet"}</span>
            </div>
            <div className="ob-aside-row">
              <span className="ob-aside-key">Business</span>
              <span className="ob-aside-val">{businessName.trim() || "—"}</span>
            </div>
            <div className="ob-aside-row">
              <span className="ob-aside-key">Statements reviewed</span>
              <span className="ob-aside-val">{siteIsSample ? `${claimsReviewed} of 3` : "Manual entry"}</span>
            </div>
            <div className="ob-aside-row">
              <span className="ob-aside-key">Plan</span>
              <span className="ob-aside-val">
                {questionMode === "named-comparison" ? "Named comparison" : "Open discovery"}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

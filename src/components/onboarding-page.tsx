import { Suspense } from "react";
import { publicCompetitorSuggestions } from "@/lib/onboarding-competitors";
import { EXPANDED_PROMPT_STARTERS } from "@/lib/prompt-starters";
import { Onboarding, type OnboardingProof, type StarterPack } from "./onboarding";

const PROOF_SITE = "https://better-auth.com/";

/** Server entry for /start: real public rankings for the first screen, plus starter packs. */
export function OnboardingPage() {
  const proofData = publicCompetitorSuggestions(PROOF_SITE);
  const proof: OnboardingProof | null = proofData.category ? {
    category: proofData.category, totalAnswers: proofData.totalAnswers, firstObservedAt: proofData.firstObservedAt, lastObservedAt: proofData.lastObservedAt,
    rows: proofData.rows.slice(0, 4).map(row => ({ name: row.name, answers: row.answers, totalAnswers: row.totalAnswers, averagePosition: row.averagePosition })),
  } : null;
  const starterPacks: StarterPack[] = EXPANDED_PROMPT_STARTERS.map(pack => ({ id: pack.id, name: pack.name, questions: [...pack.questions], companies: pack.companies.map(company => ({ name: company.name, aliases: [...company.aliases] })) }));
  return <Suspense fallback={null}><Onboarding proof={proof} starterPacks={starterPacks} /></Suspense>;
}

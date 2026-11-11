import { Suspense } from "react";
import { EXPANDED_PROMPT_STARTERS } from "@/lib/prompt-starters";
import { Onboarding, type StarterPack } from "./onboarding";

/** Server entry for /start: customer-question starter packs. */
export function OnboardingPage() {
  const starterPacks: StarterPack[] = EXPANDED_PROMPT_STARTERS.map(pack => ({ id: pack.id, name: pack.name, questions: [...pack.questions], companies: pack.companies.map(company => ({ name: company.name, aliases: [...company.aliases] })) }));
  return <Suspense fallback={null}><Onboarding starterPacks={starterPacks} /></Suspense>;
}

import {
  SAMPLE_BUSINESS_NAME,
  competitorPosition,
  type OnboardingExport,
} from "./onboarding-mock";

export interface OnboardingReportBrand {
  label: string;
  identity: string;
  isTarget: boolean;
  appearances: number | null;
  positions: Array<number | null>;
}

export interface OnboardingReport {
  snapshot: OnboardingExport;
  selectedQuestionCount: number;
  availableQuestionCount: number;
  missingQuestionCount: number;
  brands: OnboardingReportBrand[];
}

// Count only exact-question fixture answers already captured in this packet.
// Missing answers are not negative observations or zero-valued measurements.
export function buildOnboardingReport(snapshot: OnboardingExport): OnboardingReport {
  const available = snapshot.questions.filter((question) => question.illustrativeFindings !== null);
  const targetLabel = snapshot.businessName.trim() || "Your business";
  const targetIdentity = snapshot.sampleWebsite ? SAMPLE_BUSINESS_NAME : targetLabel;
  const identities = new Set([targetIdentity.toLowerCase()]);
  const tracked = [{ label: targetLabel, identity: targetIdentity, isTarget: true }];
  for (const name of snapshot.competitors) {
    const label = name.trim();
    const key = label.toLowerCase();
    if (!key || identities.has(key)) continue;
    identities.add(key);
    tracked.push({ label, identity: label, isTarget: false });
  }
  return {
    snapshot,
    selectedQuestionCount: snapshot.questions.length,
    availableQuestionCount: available.length,
    missingQuestionCount: snapshot.questions.length - available.length,
    brands: tracked.map((brand) => ({
      ...brand,
      appearances: available.length === 0
        ? null
        : available.filter((question) =>
          competitorPosition(brand.identity, question.illustrativeFindings!) !== null,
        ).length,
      positions: snapshot.questions.map((question) =>
        question.illustrativeFindings === null
          ? null
          : competitorPosition(brand.identity, question.illustrativeFindings),
      ),
    })),
  };
}

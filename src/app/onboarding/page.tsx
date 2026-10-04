import type { Metadata } from "next";
import OnboardingMock from "@/components/onboarding-mock";

export const metadata: Metadata = {
  title: "Onboarding preview — Folio",
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return <OnboardingMock />;
}

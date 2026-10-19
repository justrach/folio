import { Suspense } from "react";
import type { Metadata } from "next";
import RealOnboarding from "@/components/real-onboarding";
import OnboardingMock from "@/components/onboarding-mock";

export const metadata: Metadata = {
  title: "Set up your business — Folio",
  robots: { index: false, follow: false },
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ example?: string }>;
}) {
  const params = await searchParams;
  return params.example === "1" ? (
    <OnboardingMock />
  ) : (
    <Suspense fallback={<p>Opening your setup…</p>}>
      <RealOnboarding />
    </Suspense>
  );
}

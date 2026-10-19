import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Remove control characters.");
export const onboardingInputSchema = z.object({
  requestKey: z.string().uuid(),
  websiteUrl: text(2048).min(1),
  businessName: text(100).min(1),
  description: text(1000).min(1),
  audience: text(1000).min(1),
  capabilities: text(1000).default(""),
  competitors: z.array(text(200).min(1)).max(10),
  questions: z.array(text(300).min(1)).min(1).max(10).refine(values => new Set(values.map(value => value.toLowerCase())).size === values.length, "Remove duplicate questions."),
}).strict();
export type OnboardingInput = z.infer<typeof onboardingInputSchema>;
export type SavedOnboarding = Omit<OnboardingInput, "requestKey"> & {
  id: string; websiteId: string; suiteId: string; savedAt: string;
};

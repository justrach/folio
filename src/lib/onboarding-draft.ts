import { z } from "zod";
import { readEvaluationIntent } from "./evaluation-navigation";

// Anonymous preview context only: no authenticated records, account IDs or provider data.
export const ONBOARDING_DRAFT_KEY = "folio:onboarding-preview:v1";
const text = z.string().max(10000);
const decision = z.object({
  status: z.enum(["pending", "accepted", "rewritten", "rejected", "uncertain"]),
  revision: text.optional(),
});
const topic = z.object({
  id: text, label: text, question: text, originalQuestion: text,
  selected: z.boolean(), origin: z.enum(["sample", "custom", "keyword"]),
});
const draftSchema = z.object({
  version: z.literal(1), savedAt: z.number().finite(), step: z.number().int().min(1).max(5),
  siteInput: text, confirmedUrl: z.string().max(2048).optional(), businessName: text,
  nameEdit: z.object({ normalized: z.string().max(2048).optional(), value: text }).nullable().optional(),
  decisions: z.object({ description: decision, audience: decision, capabilities: decision }),
  editDrafts: z.object({ description: text.nullable(), audience: text.nullable(), capabilities: text.nullable() }),
  knowsCompetitors: z.enum(["yes", "unknown"]).nullable(), competitorMode: z.enum(["track", "compare"]),
  competitorsRaw: text, customTopicInput: text, customTopics: z.array(z.string().max(200)).max(10),
  keywordsRaw: text, topics: z.array(topic).max(40), topicsSignature: text,
  parkedTopics: z.array(topic).max(100),
});

export function parseOnboardingDraft(raw: string | null, now = Date.now()) {
  if (!raw || raw.length > 250000) return null;
  try {
    const result = draftSchema.safeParse(JSON.parse(raw));
    if (!result.success) return null;
    const draft = result.data;
    if (draft.savedAt > now || now - draft.savedAt > 24 * 60 * 60 * 1000) return null;
    if (draft.confirmedUrl && readEvaluationIntent(new URLSearchParams({ target: draft.confirmedUrl })).targetUrl !== draft.confirmedUrl) return null;
    if (draft.step > 1 && !draft.confirmedUrl) return null;
    if (draft.step > 3 && !draft.topics.some(topic => topic.selected && topic.question.trim())) return null;
    return draft;
  } catch { return null; }
}

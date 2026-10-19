export type BusinessSetupDraft = {
  websiteUrl: string;
  businessName: string;
  description: string;
  audience: string;
  capabilities: string;
  competitors: string;
  questions: string;
};
const limits: Record<keyof BusinessSetupDraft, number> = {
  websiteUrl: 2048,
  businessName: 100,
  description: 1000,
  audience: 1000,
  capabilities: 1000,
  competitors: 2000,
  questions: 4000,
};
/** A same-tab editing draft is never authority to save or launch research. */
export function parseBusinessSetupDraft(
  raw: string | null,
  transfer = false,
  now = Date.now(),
) {
  if (!raw || raw.length > 25000) return null;
  try {
    const value = JSON.parse(raw);
    if (
      !value ||
      typeof value.savedAt !== "number" ||
      value.savedAt > now ||
      now - value.savedAt > 86400000 ||
      !value.draft ||
      (transfer && value.transfer !== true)
    )
      return null;
    const draft = {} as BusinessSetupDraft;
    for (const field of Object.keys(limits) as (keyof BusinessSetupDraft)[]) {
      const text = value.draft[field];
      if (typeof text !== "string" || text.length > limits[field]) return null;
      draft[field] = text;
    }
    const request = value.request;
    if (
      request != null &&
      (typeof request.body !== "string" ||
        request.body.length > 12000 ||
        typeof request.key !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(request.key))
    )
      return null;
    return {
      draft,
      step:
        Number.isInteger(value.step) && value.step >= 1 && value.step <= 4
          ? value.step
          : 1,
      request: request ?? null,
    };
  } catch {
    return null;
  }
}

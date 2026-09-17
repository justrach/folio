/** Explicit choices for this hosted open-web harness, not a general provider catalog. */
export const KEYWORD_OPEN_WEB_MODELS = [
  { id: "gpt-6-astra", label: "Astra", validation: "validated" },
  { id: "gpt-5.6-luna", label: "Luna", validation: "experimental" },
  { id: "gpt-5.6-sol", label: "Sol", validation: "experimental" },
  { id: "gpt-5.6-terra", label: "Terra", validation: "experimental" },
] as const;
export const KEYWORD_OPEN_WEB_MODEL = KEYWORD_OPEN_WEB_MODELS[0].id;
export function isKeywordOpenWebModel(value: unknown): value is typeof KEYWORD_OPEN_WEB_MODELS[number]["id"] {
  return KEYWORD_OPEN_WEB_MODELS.some(model => model.id === value);
}

/** Explicit choices for this hosted open-web harness, not a general provider catalog. */
export const KEYWORD_OPEN_WEB_MODELS = [
  { id: "gpt-6-astra", label: "Astra", validation: "validated" },
  { id: "gpt-6-luna", label: "Luna 6", validation: "experimental" },
  { id: "gpt-6-sol", label: "Sol 6", validation: "experimental" },
] as const;
export const KEYWORD_OPEN_WEB_MODEL = "gpt-6-luna";
export function isKeywordOpenWebModel(value: unknown): value is typeof KEYWORD_OPEN_WEB_MODELS[number]["id"] {
  return KEYWORD_OPEN_WEB_MODELS.some(model => model.id === value);
}
/** Historical completed runs remain exportable under their frozen model identity. */
export function isRecordedKeywordOpenWebModel(value: unknown): value is string {
  return isKeywordOpenWebModel(value) || value === "gpt-5.6-luna" || value === "gpt-5.6-sol" || value === "gpt-5.6-terra";
}

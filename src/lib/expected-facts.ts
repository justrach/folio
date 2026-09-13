import type { ExpectedFacts, PricingFact } from "./evals";

export const REFERENCE_PRICE_INTERVALS = ["month", "year", "week", "day", "one-time"] as const;
export const MAX_REFERENCE_PRICE = 1_000_000_000;

export class ExpectedFactsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpectedFactsValidationError";
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

/** Account confirmation supplies a reference answer, not independent proof of truth. */
export function parseOwnerConfirmedExpectedFacts(value: unknown, confirmed: unknown): ExpectedFacts | undefined {
  if (value === undefined) {
    if (confirmed !== undefined && confirmed !== false)
      throw new ExpectedFactsValidationError("Supply reference answers before confirming them.");
    return undefined;
  }
  if (!record(value) || Object.keys(value).some((key) => !["productName", "pricing"].includes(key)))
    throw new ExpectedFactsValidationError("Reference answers may contain only productName and pricing.");
  if (confirmed !== true)
    throw new ExpectedFactsValidationError("Confirm that you reviewed these reference answers for this website.");

  const result: ExpectedFacts = { source: "owner-confirmed" };
  if (has(value, "productName")) {
    if (typeof value.productName !== "string" || value.productName.length > 200 ||
        !value.productName.trim() || /[\u0000-\u001f\u007f]/.test(value.productName))
      throw new ExpectedFactsValidationError("Use a product reference name of 1–200 characters without control characters.");
    result.productName = value.productName.trim();
  }
  if (has(value, "pricing")) {
    if (value.pricing === null) result.pricing = null;
    else {
      const price = value.pricing;
      if (!record(price) || Object.keys(price).some((key) => !["amount", "currency", "interval"].includes(key)) ||
          typeof price.amount !== "number" || !Number.isFinite(price.amount) || price.amount < 0 || price.amount > MAX_REFERENCE_PRICE ||
          typeof price.currency !== "string" || !/^[A-Z]{3}$/.test(price.currency) ||
          typeof price.interval !== "string" || !REFERENCE_PRICE_INTERVALS.includes(price.interval as typeof REFERENCE_PRICE_INTERVALS[number]))
        throw new ExpectedFactsValidationError("Use a price from 0 to 1,000,000,000, a three-letter uppercase currency code, and a supported billing interval.");
      result.pricing = { amount: price.amount, currency: price.currency, interval: price.interval } satisfies PricingFact;
    }
  }
  if (result.productName === undefined && !has(result, "pricing"))
    throw new ExpectedFactsValidationError("Supply a product name or a pricing reference, or omit reference answers.");
  return result;
}

/** Reruns replay the stored answer key; a client cannot silently replace it. */
export function expectedFactsFromRequest(body: Record<string, unknown>): ExpectedFacts | undefined {
  if (body.rerunOf !== undefined && (has(body, "expectedFacts") || has(body, "confirmExpectedFacts")))
    throw new ExpectedFactsValidationError("Reruns keep their original reference answers. Start a new evaluation to change them.");
  if (body.mode !== "managed" && (has(body, "expectedFacts") || has(body, "confirmExpectedFacts")))
    throw new ExpectedFactsValidationError("The reproducible demo uses its frozen fixture reference answers.");
  return parseOwnerConfirmedExpectedFacts(body.expectedFacts, body.confirmExpectedFacts);
}

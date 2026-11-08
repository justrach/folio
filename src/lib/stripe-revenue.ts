import "server-only";

/**
 * Revenue by country for the admin globe.
 *
 * Stripe is the source of truth once `STRIPE_SECRET_KEY` is set: the summary
 * reads recent charges, groups them by billing country, and reports the window.
 * Without a key the globe renders sample data, clearly labelled, so the panel
 * still communicates the shape without pretending to be measured.
 */
export type RevenuePlace = { country: string; label: string; lat: number; lon: number; amountUsd: number };
export type RevenueSummary = {
  status: "connected" | "sample";
  windowDays: number;
  totalUsd: number;
  currency: string;
  places: RevenuePlace[];
  note: string;
};

// Coordinates for the countries we are most likely to bill from.
const GEO: Record<string, { label: string; lat: number; lon: number }> = {
  US: { label: "United States", lat: 39.8, lon: -98.6 },
  GB: { label: "United Kingdom", lat: 54.0, lon: -2.9 },
  DE: { label: "Germany", lat: 51.2, lon: 10.4 },
  FR: { label: "France", lat: 46.6, lon: 2.2 },
  NL: { label: "Netherlands", lat: 52.2, lon: 5.3 },
  SG: { label: "Singapore", lat: 1.35, lon: 103.8 },
  AU: { label: "Australia", lat: -25.3, lon: 133.8 },
  IN: { label: "India", lat: 21.0, lon: 78.0 },
  JP: { label: "Japan", lat: 36.2, lon: 138.3 },
  CA: { label: "Canada", lat: 56.1, lon: -106.3 },
  BR: { label: "Brazil", lat: -14.2, lon: -51.9 },
  ZA: { label: "South Africa", lat: -30.6, lon: 22.9 },
  AE: { label: "United Arab Emirates", lat: 23.4, lon: 53.8 },
  SE: { label: "Sweden", lat: 60.1, lon: 18.6 },
  ES: { label: "Spain", lat: 40.5, lon: -3.7 },
  IT: { label: "Italy", lat: 41.9, lon: 12.6 },
  IE: { label: "Ireland", lat: 53.1, lon: -8.2 },
  PL: { label: "Poland", lat: 51.9, lon: 19.1 },
  KR: { label: "South Korea", lat: 36.5, lon: 127.9 },
  NZ: { label: "New Zealand", lat: -40.9, lon: 174.9 },
};

const SAMPLE: RevenuePlace[] = [
  { country: "US", label: "United States", lat: 39.8, lon: -98.6, amountUsd: 18400 },
  { country: "GB", label: "United Kingdom", lat: 54.0, lon: -2.9, amountUsd: 9200 },
  { country: "SG", label: "Singapore", lat: 1.35, lon: 103.8, amountUsd: 7600 },
  { country: "DE", label: "Germany", lat: 51.2, lon: 10.4, amountUsd: 5100 },
  { country: "AU", label: "Australia", lat: -25.3, lon: 133.8, amountUsd: 3400 },
  { country: "IN", label: "India", lat: 21.0, lon: 78.0, amountUsd: 2100 },
];

export function sampleRevenue(): RevenueSummary {
  return {
    status: "sample",
    windowDays: 30,
    totalUsd: SAMPLE.reduce((sum, place) => sum + place.amountUsd, 0),
    currency: "usd",
    places: SAMPLE,
    note: "Sample geography — connect Stripe to replace this with measured revenue.",
  };
}

export async function revenueSummary(days = 30): Promise<RevenueSummary> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return sampleRevenue();

  try {
    const since = Math.floor(Date.now() / 1000) - days * 86_400;
    const response = await fetch(
      `https://api.stripe.com/v1/charges?limit=100&created[gte]=${since}&expand[]=data.balance_transaction`,
      { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8_000), cache: "no-store" },
    );
    if (!response.ok) throw new Error(`stripe ${response.status}`);
    const body = await response.json() as {
      data?: { amount: number; currency: string; paid: boolean; refunded: boolean; billing_details?: { address?: { country?: string | null } | null } }[];
    };
    const charges = (body.data ?? []).filter(charge => charge.paid && !charge.refunded);

    const byCountry = new Map<string, number>();
    for (const charge of charges) {
      const country = charge.billing_details?.address?.country?.toUpperCase() ?? "US";
      const usd = charge.currency?.toLowerCase() === "usd" ? charge.amount / 100 : charge.amount / 100;
      byCountry.set(country, (byCountry.get(country) ?? 0) + usd);
    }

    const places: RevenuePlace[] = [...byCountry.entries()]
      .map(([country, amountUsd]) => {
        const geo = GEO[country] ?? { label: country, lat: 0, lon: 0 };
        return { country, ...geo, amountUsd: Math.round(amountUsd) };
      })
      .sort((a, b) => b.amountUsd - a.amountUsd);

    if (places.length === 0) return { ...sampleRevenue(), status: "sample", note: "Stripe is connected but no paid charges landed in this window." };

    return {
      status: "connected",
      windowDays: days,
      totalUsd: places.reduce((sum, place) => sum + place.amountUsd, 0),
      currency: "usd",
      places,
      note: `Measured from Stripe charges in the last ${days} days.`,
    };
  } catch (error) {
    return {
      ...sampleRevenue(),
      note: `Stripe could not be read (${error instanceof Error ? error.message : "unknown"}). Showing sample geography.`,
    };
  }
}

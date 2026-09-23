export const CRAWL_WORKFLOW = "website-crawl-v1";
export const CRAWL_MODEL = "gpt-6-luna";
export type CrawlPage = { id: string; url: string; title: string; text: string; sha256: string; capturedAt: string; truncated: boolean; links: string[] };
export type CrawlReview = { model: string; results: { evidenceId: string; field: string; claim: string; relation: "supports" | "contradicts" | "insufficient"; confidence: number }[]; usage: { input_tokens: number; output_tokens: number }; costUsd: null };
export type CrawlResult = { pages: CrawlPage[]; attemptedPages: number; reviewStatus: string; review: CrawlReview | null };

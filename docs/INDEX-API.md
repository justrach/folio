# Folio index API (`index-v1`)

The frontend and any external agent read the index through this HTTP contract. The implementation lives in the private `folio-index` service; this document, and `src/lib/index-client.ts`, are the public half.

This is the crawled-page index service. Agents with a Folio key search the same pages over MCP with `folio_index_pages`. The app embeds the question and queries the same turbopuffer namespace itself, and calls this service's `/search` only when it lacks those keys; it reads the `research` tables for a word-match fallback and per-website crawl coverage (no keyword rows). Two things observed when calling this service on 11 November 2026: `/search` with `entityId` returned no items for every entity tried, and about a third of requests (9 of 24) failed with `500` after 15 seconds; the published-answers index is a different dataset that needs no key. See [Ask the published index](MCP.md#ask-the-published-index).

Base URL: **`https://backend.usefolio.site`** (Cloudflare Worker, private index). Base path: `/api/index/v1`.

Authentication: every request needs `Authorization: Bearer <index key>`. Missing or invalid keys return `401` before the database is touched. The index is private: there is no anonymous mode, and keys are issued per consumer and revoked by rotating the Worker secret.

Responses are JSON; unknown fields must be ignored by clients.

## Records

| Record | Fields |
| --- | --- |
| `entity` | `id`, `type: "entity"`, `name`, `domain`, `category`, `description`, `links{home,docs}`, `coverage{inventory,rankings,content}`, `counts{inventoryPages,sections,sampledPages,rankedKeywords,landingPages}`, `freshness`, `ranking{rows,perThousandInventoryPages,status}` |
| `section` | `id`, `type: "section"`, `entity`, `path`, `pages`, `share` |
| `page` | `id`, `type: "page"`, `entity`, `url`, `title`, `section`, `excerpt`, `topics[]`, `embedding{model,dimensions}` |
| `keyword` | `id`, `type: "keyword"`, `entity`, `keyword`, `position`, `searchVolume`, `estimatedTraffic`, `landingPage`, `landingPageId` |
| `search hit` | a `page` plus `score` (cosine similarity, 0–1) |

## Endpoints

| Method | Path | Parameters | Returns |
| --- | --- | --- | --- |
| GET | `/entity` | `domain` or `id` (one required) | `entity` |
| GET | `/entities/:id/sections` | `limit` (1–100), `cursor` | list of `section` |
| GET | `/entities/:id/pages` | `section`, `limit`, `cursor` | list of `page` |
| GET | `/entities/:id/keywords` | `limit`, `cursor` | list of `keyword` |
| GET | `/search` | `q` (1–300 chars), `entityId`, `limit` | list of `search hit` — ANN over turbopuffer (`folio-pages`), `gemini-embedding-2`, 768 dims, `score = 1 - cosine distance` |
| GET | `/health` | — | freshness and queue depth |

### List envelope

```json
{ "items": [], "nextCursor": "sec_vercel.com:-docs", "truncated": true, "version": "index-v1" }
```

- `nextCursor` is an opaque keyset cursor (ordered by `id`). Pass it back unchanged.
- `nextCursor: null` means the list is complete.
- `truncated` is true only when a `nextCursor` exists.

### Errors

```json
{ "error": { "code": "not_found", "message": "That entity is not in the index." } }
```

| Status | `code` | Client action |
| --- | --- | --- |
| 400 | `invalid_input` | fix the request |
| 401/403 | `unauthorized` | obtain a key with `read` scope |
| 404 | `not_found` | the domain is not in the index; do not retry |
| 429 | `rate_limited` | wait, then repeat the same request |
| 503 | `index_unavailable` | inspect state before retrying |

## Health and freshness

`GET /health` answers "how current is this?" from the data itself, not from a status field someone sets:

```json
{
  "generated_at": "2026-11-07T05:11:07.982Z",
  "subjects": 186, "subjects_profiled": 34, "subjects_pending": 150,
  "urls_total": 5958, "urls_unread": 5871, "urls_extracted": 87, "urls_failed": 0,
  "pages_total": 1096, "pages_with_content": 6, "pages_embedded": 1066,
  "newest_content_at": "2026-11-07T05:10:23.554Z",
  "oldest_content_at": "2026-11-07T05:07:06.482Z",
  "content_older_than_30d": 0, "content_last_7d": 6,
  "content_coverage_pct": 0.5,
  "domains": [{ "domain": "docs.stripe.com", "urls": 5139, "extracted": 75, "unread": 5064, "newest_at": null, "oldest_at": null }]
}
```

Two different questions, two different fields:

- **Coverage** — `pages_with_content / pages_total` and `urls_unread`. Low coverage means the index knows a URL exists but has not read it. A page can be listed and still be unread.
- **Freshness** — `newest_content_at`, `content_last_7d`, `content_older_than_30d`. These say how old the *readings* are, regardless of how much is covered.

An index can be fresh and thin (everything read yesterday, only 1% read) or thick and stale (90% covered, last read in March). Report both; a single "updated at" hides the difference.

## Client

```ts
import { createIndexClient } from "@/lib/index-client";

const index = createIndexClient({
  baseUrl: process.env.NEXT_PUBLIC_FOLIO_INDEX_URL ?? "https://backend.usefolio.site",
  apiKey: process.env.FOLIO_INDEX_KEY,
});

const entity = await index.entity({ domain: "manus.im" });
const sections = await index.sections(entity.id, { limit: 5 });
const pages = await index.pages(entity.id, { section: "/tools", limit: 10 });
const keywords = await index.keywords(entity.id, { limit: 10 });
const hits = await index.search({ query: "how do I deploy a cron job", entityId: entity.id });
```

Rules the client enforces so the UI cannot depend on server internals:

1. No imports from `src/lib/*` server modules — only this client.
2. Every list is paged; a component never asks for "everything".
3. Errors surface as `IndexClientError` with a `retryDisposition`, so a component can decide between "fix input" and "retry later".
4. `coverage` flags are part of the contract: `content: false` means pages were not sampled, not that the site has no pages.

## Versioning

`index-v1` is frozen once published. Additive optional fields are allowed; renaming, removing or changing the meaning of a field requires `index-v2`, served alongside v1 for at least one release. The private service must not ship a shape this file does not describe — the contract test in `tests/index-client.test.ts` and the record types in `src/lib/index-client.ts` are the reference.

## What the API deliberately does not expose

- Raw captures, provider payloads or credentials.
- Any record belonging to another account.
- Unsampled content presented as complete: `coverage` and the 50-row keyword sample are stated, not hidden.
- Ranking guarantees: positions and volumes are provider estimates with a retrieval date.

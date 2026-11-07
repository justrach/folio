# Folio index API (`index-v1`)

The frontend and any external agent read the index through this HTTP contract. The implementation lives in the private `folio-index` service; this document, and `src/lib/index-client.ts`, are the public half.

Base path: `/api/index/v1`. Authentication: `Authorization: Bearer <key>` when the deployment requires it. Responses are JSON; unknown fields must be ignored by clients.

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
| GET | `/search` | `q` (1–300 chars), `entityId`, `limit` | list of `search hit` |

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

## Client

```ts
import { createIndexClient } from "@/lib/index-client";

const index = createIndexClient({ baseUrl: process.env.NEXT_PUBLIC_FOLIO_API ?? "", apiKey: key });

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

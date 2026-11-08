# Embeddings and vector search

Page vectors live in **turbopuffer**, not Postgres. Postgres keeps the page rows,
the crawl queue, and one marker row per embedded page.

| | |
| --- | --- |
| Store | turbopuffer, region `gcp-us-central1` |
| Namespace | `folio-pages` |
| Vector | 768 dimensions, `cosine_distance` (`gemini-embedding-2`) |
| Attributes | `id` (`v2:<page id>`), `url`, `title`, `domain`, `excerpt` |
| Secret | `TURBOPUFFER_API_KEY` — `.dev.vars` locally, `wrangler secret put` for both Workers |

## Why it moved

At ~3 KB of RAM per 768-dim vector, a Postgres HNSW index becomes memory-bound
around a million pages, and the vectors were 576 MB of a 1.7 GB database. Moving
them out keeps the database small and the ANN index on a store built for it.

Measured: 100,254 vectors moved in **106 seconds** (~944 rows/s), **364 MB**
logical in turbopuffer.

## Reading

`searchPages()` in the index worker (`folio-index` repo) embeds the query with
`gemini-embedding-2`, asks turbopuffer for the nearest rows, then enriches each
hit from `research.pages` by URL so callers receive the same shape as before
(`id`, `entity`, `url`, `title`, `section`, `excerpt`, `topics`, `score`).

```sh
curl "https://backend.usefolio.site/api/index/v1/search?q=email+deliverability&limit=3" \
  -H "Authorization: Bearer $INDEX_API_KEY"
```

`score` is `1 - cosine distance`.

## Writing

`scripts/embed-pages.mjs` (index repo) embeds pages that have content and no
marker, upserts to turbopuffer, then inserts into `research.page_embedding_ids`.
Re-runs are idempotent: the marker is the only thing that decides what is new.

```sh
node scripts/embed-pages.mjs --batch 64 --concurrency 4 --limit 0
```

The first full export used `scripts/export-embeddings-turbopuffer.mjs`, which
reads `research.page_embeddings_v2`. **That table no longer exists** — the script
is kept as the record of how the migration was done, not as a routine tool.

## Conventions that bit us

- **Truncate by code point, not by `.slice()`.** Cutting text at 300 characters
  can split a UTF-16 surrogate pair, and the API rejects the malformed JSON
  (`unexpected end of hex escape`). Both the exporter and `embed-pages.mjs` strip
  unpaired surrogates and truncate with `Array.from(text)`.
- **Ids are stable strings** (`v2:<page id>`), so a re-embed upserts the same row
  instead of creating a duplicate.
- **Attributes are filterable by default**; `excerpt` is explicitly
  `filterable: false` because it is only ever returned, and non-indexed
  attributes bill at the discounted rate.

## Database objects

| Object | Purpose |
| --- | --- |
| `research.page_embedding_ids` | one marker row per embedded page, with model and dimensions |
| `research.index_freshness` | view; `pages_embedded` counts the marker table |
| ~~`research.page_embeddings_v2`~~ | dropped after the export; backup at `.local/page_embeddings_v2_backup.csv.gz` |

## Secrets

```sh
# index worker (search + ingestion)
wrangler secret put TURBOPUFFER_API_KEY --config wrangler.jsonc

# app worker (same key, for any server-side vector work)
wrangler secret put TURBOPUFFER_API_KEY --config wrangler.production.jsonc
```

Locally, the root `.dev.vars` carries the key; `scripts/dev.mjs` loads it, so
`bun run dev` has it without extra setup.

# Verify an exported evaluation offline

Folio's evidence bundle contains the captured text, its SHA-256 hashes, the recorded structured agent return, reference answers when supplied, and saved deterministic verification checks. The verifier recomputes the checks from that data without contacting a website or an AI provider.

Download **Evidence** from a completed evaluation, then run this command from the Folio repository:

```sh
bun install --frozen-lockfile
bun run eval:verify /path/to/folio-evaluation.json
```

The equivalent command is `node --import tsx scripts/verify-evaluation.ts /path/to/folio-evaluation.json`. Use Node.js 22.13 or later, as required by the repository toolchain. Once dependencies are installed, verification requires no network access, login, application server, database, or API key. Bundle content is treated as inert JSON; embedded HTML, instructions, and URLs are never executed or fetched.

Keep exports outside Git. The repository's ignored `.local/` directory is suitable for local private reports. Bundles may contain private website captures, owner reference answers, agent returns and session identifiers. The verifier prints only counts and consistency status, not source text.

## Supported exports

- `folio-private-evaluation-bundle-v1`: the authenticated export endpoint's format. Requires private publication, export time, exact suite metadata, and SHA-256 UTF-8 hashing metadata.
- `folio-local-demo-evaluation-bundle-v1`: the explicitly fictional browser demo export. The run must declare demo mode, fixture captures and no provider session or model.
- `folio-evidence-bundle`: the earlier browser demo format, accepted only with the same local fixture restrictions. It cannot represent a live run.

Accepted capture kinds are `page`, `technical-check`, and `seo-report`. Saved SEO snapshots are checked against their hashes and any returned citations; verifying them never starts a provider lookup. Unknown capture kinds are rejected.

The suite must exactly match the verifier's `website-evidence-v1` definition. Preserve the source-code commit used to create a report; check out that version if a later verifier changes its suite. The implementation validates file size (maximum 5 MiB), basic run and source shape, completed status, hash encoding and declared provenance before recomputing. It rejects duplicate capture IDs, unsupported versions, incomplete runs, malformed agent output, demo/live provenance mismatches, changed captured text and saved results that differ from recomputation.

## Reading the exit status

Exit status **0** means the source hashes and saved verification outcomes were reproduced. It does not mean every evaluation check passed. A consistently saved result with failed accuracy or citation checks is a valid, reproducible report; those failures remain in the printed counts. Changes to explanatory check labels, details or limitations are reported separately; they do not turn unchanged outcomes into a failure.

Exit status **1** means input validation, source integrity or result reproduction failed. The command does not silently rewrite or repair the supplied file. Check that the file and verifier version match, or export the original saved report again.

## What this verifies

Hashes establish the identity of the captured UTF-8 text. The verifier checks exact source quotations, field-specific citation coverage, finding links, product/pricing comparisons against declared reference answers, and readable HTML text. It compares check IDs, statuses, expected/actual observations, evidence IDs, counts, scores, the returned summary, findings and citations with recomputation. Object property order does not affect equality; source text is hashed without normalization. Explanatory labels, details and limitation prose are not part of the outcome comparison; a difference produces a visible note to inspect the source-code version.

This establishes internal consistency. The bundle is not signed: someone able to rewrite the captures, hashes, agent output and results together can produce a different internally consistent report. Unused bundle metadata is not authenticated. Neither a timestamp nor `transport: "http"` proves a fetch happened; a session identifier does not authenticate an OpenAI response. Owner-confirmed reference answers remain owner assertions. Literal quotation presence does not prove truth or semantic support. The command does not claim website authenticity, recommendation frequency, search rank or a repeatable model response.

## Compare saved runs in the application

On **Evaluations**, choose a baseline and a second completed run under **Compare completed runs**. Only the signed-in account's saved records are fetched. Local fixtures and live agent evaluations cannot be combined.

The table shows each check's before/after status, expected and observed values, and transitions. A change between measured and unmeasured is a coverage change, not an improvement. Source hashes and reference answers are inspectable together. Aggregate percentage deltas are withheld when suite versions, measured check sets, expected facts, targets or recorded models differ. Even comparable verification percentages do not establish the cause of a change or a change in website rank.

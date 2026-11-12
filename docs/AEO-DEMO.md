# Improve AEO with your own agent: the end-to-end walkthrough

This is the loop a company runs with its own coding agent (Claude Code, Codex, Cursor) connected to Folio over MCP. Folio supplies evidence and keeps the record. The agent edits the company's repository. The owner approves, publishes, and pays for new answers.

```mermaid
flowchart LR
    A[Saved answers to buyer questions] --> B[Agent reads evidence over MCP]
    B --> C[Agent proposes edits · owner approves]
    C --> D[Agent records the change · baseline saved]
    D --> E[Owner publishes and confirms it is live]
    E --> F[Same questions answered again · paid, explicit]
    F --> G[Before and after, per question]
```

## What you need

- A saved website in `/websites` and at least one question in `/benchmarks` that targets it.
- **A completed answer for each question you want to improve.** This is the baseline. Without it the change is still recorded, but that question stays "No answer saved before the change".
- A Folio key from `/docs/api#api-keys` with **read** and **record website changes**. Add **start evaluations** only if the agent should request the retest itself.

## 1. Connect the agent

Claude Code, in the website's repository:

```sh
export FOLIO_API_KEY=folio_v1_…        # shown once when the key is created
claude mcp add --transport http folio http://localhost:3001/api/mcp --header "Authorization: Bearer ${FOLIO_API_KEY}"
```

Codex and the JSON configuration are in [MCP](MCP.md). Use `https://usefolio.site/api/mcp` against the deployed app. Run these in a terminal: a command with the key in it never belongs in a chat with an agent. The **Connect your agent** panel (`/agents#connect`) does the same step by step, and its **Fix the top gap in this repository** prompt is a short form of the loop below with the same guardrails.

## 2. Run the guided prompt

In Claude Code: `/mcp__folio__improve_aeo` (optionally with the website name). Other clients list it as the `improve_aeo` MCP prompt. The text adapts to the key: a read-only key is told to hand recording and retesting back to the owner. The same text covers a website shared with you through an organization: the agent finds it with `folio_organizations`, reads `folio_website_gaps` and the published index, and hands a title, summary and files back for the website's owner to record, because `folio_visibility`, `folio_page_evidence`, `folio_changes` and change recording work only on your own websites.

The agent then:

1. Finds the website (`folio_targets`, or `folio_organizations` for a shared one), reads what it is missing (`folio_website_gaps`) and its saved answers (`folio_visibility`): for each question, whether the website was named, cited, and at which position, plus the pages competitors were cited for.
   If no question has a completed answer, it says there is nothing to compare before and after yet and that running questions is a paid step started in Folio, then carries on with the Google searches, links and unchecked items in `folio_website_gaps`, without presenting them as findings about AI answers.
2. Picks at most three questions where the website is missing (or, for a shared website or without a baseline, three gaps its own content can fix), reads the captured page (`folio_page_evidence`, own websites only) and the matching files in the repository.
3. Proposes truthful edits and waits for approval. It makes them with its own tools.
4. Calls `folio_change_record` with a title, a summary, the question IDs and the files changed. Folio saves each question's latest completed answer as the baseline.

## 3. Publish and confirm

Deploying is the owner's step. Open `/agents`: the change appears under **Changes from your agent** with its questions and their "Before" answers. Select **Confirm it's live**. The agent can report it instead (`folio_change_update`), and is instructed to do so only after the owner says the change is live.

## 4. Retest and read the difference

Run the same questions again, from `/benchmarks` or by letting the agent call `folio_evaluate` with `maxAgeSeconds: 0` (so an answer saved before publication is not reused). Each new answer is a paid provider run and needs explicit approval.

`/agents` and `folio_changes` then show, per question, the answer before and after and one result: now named, now cited, listed earlier, no change, or the reverse.

## What the record does and does not say

- A pair is reported only when the question, model, harness, environment and research corpus match, and the retest was saved after the reported publication time. Anything else is listed as unmeasured with its reason.
- Publication is the caller's statement. Folio does not deploy, crawl or verify the website for this record.
- "Named" means a recommendation's URL host matches the website's host. A mention with no URL counts as unknown, not as absent.
- Answers vary from run to run. A difference between two saved answers is an observation, not evidence that the edit caused it, and not a search ranking.
- Recording, reading and confirming a change never starts an evaluation or a provider request.

## Validation status

Covered by fixtures: the pure outcome rules, a real MCP SDK client (prompts, scopes, schemas), and real Miniflare D1 (concurrent recording, owner isolation, publication, matched and mismatched retests). See [MCP](MCP.md) for the tool contracts. A full live run of this loop needs completed paid answers before and after a real published change; it is tracked in [TODO](../TODO.md) and is not established by the fixtures.

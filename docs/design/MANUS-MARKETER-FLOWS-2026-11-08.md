> Superseded by SOCIAL-WORKSPACE-AND-GLOBE-2026-11-08.md. The brief-centric marketer demo was removed in favor of a post studio.

# Manus marketer workflow review

Local implementation and simulated usability walkthrough, 8 Nov 2026.
These are hypotheses about a social media marketer’s work, not Manus interviews,
account access, collected AI-tool recommendations or customer research findings.

## Evidence available

The public repository contains a completed Manus homepage HTML capture dated
7 Nov 2026, 12:32 UTC. `readiness-v1`: 85/100; 126 readable words after bounded
markup removal; no JSON-LD blocks. Client-rendered text is not included in that
count. This establishes neither a current defect nor recommendation performance.
The AI-tool question catalog contains 100 assistant questions and 100 builder
questions. These are authored inputs, not collected AI answers.

The mock includes a small attributed subset in `manus-workflow-demo.json`, derived
from `developer-tool-evaluations.json` and `public-ai-tool-questions.json`.
It uses the existing local Manus favicon. No revenue, engagement, conversion or
AI-visibility number is invented.

## End-to-end jobs

| Hypothetical job | Interaction | Completion | Need exposed |
| --- | --- | --- | --- |
| Plan next week’s post | Open Plan a post → choose a catalog buyer question → prepare and edit brief → download | A labelled local content brief includes the exact unrun question and verification reminders | Marketers need a specific audience/question and verified product evidence, not an abstract visibility score |
| Check campaign claim | Open Check a claim → compare what the captured score establishes with unmeasured claims → edit/download review | A bounded review explains why 85/100 cannot justify “AI recommends us” | Claim provenance and measurement limits must be visible before sharing |
| Brief the website team | Open Brief the web team → inspect readable-content/JSON-LD findings → edit/download handoff | The handoff includes URL, date, observations, limits and a concrete investigation | Findings need a recipient-ready artifact rather than a score alone |

Downloads are not publication or team delivery. Nothing is sent to Manus or any
teammate. Unsaved drafts reset when changing tasks. This mock does not implement
social publishing, scheduling, assignments, real campaign analytics, verified team
roles or persistent shared briefs.

## Changes to the actual workspace

A shared website brief now leads with checked records, findings, and one action.
It derives counts and links from authenticated records already loaded by the
actual overview. Missing reads never become zero results. An unsuccessful latest
attempt opens for review while retaining prior completed answers. Active attempts
open existing progress; opening a link never launches inference. The action uses
the currently selected website and scope/model; the date-window controls below
remain explicitly scoped to their own lists/charts/exports. Charts and optional
recommendations are collapsed by default. Question evidence stays available.

## Model request

Requested `humansand/ampersand-v0.1` through Vercel AI Gateway. The catalog lists
the model. Gateway returned HTTP400 `no_zdr_providers_available`: the configured
zero-data-retention policy excludes this model. No provider completion returned;
no Ampersand advice is claimed. Gateway settings were not changed. Credentials
and raw diagnostic files remain outside tracked source.

## Review criteria

Desktop/mobile browser checks cover all three task paths, editable download
contents, evidence labels, actual favicon, task reset, narrow layout, and absence
of private reads or provider writes from the demo. Existing overview checks cover
owner/scope isolation, partial reads/history, failed/active states, saved-answer
navigation, filters, charts, date windows and exports. A 1.5× walkthrough is a
local demonstration, not provider validation or production deployment.

## Local verification

The isolated Linux run passed typecheck, all 358 unit tests, and 62 browser tests
across desktop and mobile, including all three downloads. Cloudflare/OpenNext
production build, frontend dry run and frontend runtime smoke passed. After a
small CSS-only adjustment to retain 46px brief actions inside the compact shell,
desktop/mobile inspection found no horizontal overflow and charts stayed collapsed.
The final CSS build is recorded separately in local CI logs.

Native browser runs initially exposed missing accessible region labels and an
ambiguous status selector; both were corrected. Two subsequent native cases hit
`ERR_ADDRESS_INVALID` while fetching local app assets and passed on recheck.
The isolated final browser run passed without retries. These checks use fixtures;
none establish real Manus account data or actual provider execution.

Recorded walkthrough: 43.47 seconds, 1920×1080, at 1.5× playback speed. The
browser recording is transcoded to a 60fps output; this is not a native 60fps
capture. Media and private logs remain ignored under `.local/manus-flow-review`.
No production deployment is part of this review.

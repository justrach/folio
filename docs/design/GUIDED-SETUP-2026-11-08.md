# Guided website setup — 8 November 2026

The private overview and My websites now begin with the same three-stage flow:
add a website, choose customer questions, and collect/review answers. The main
action uses the selected website's owned saved state. Running searches open
progress, attention/failed attempts open for review, and completed answers reopen
directly. Loading or failed reads never imply that results are absent or that
another search should be started.

My websites separates View results and Choose questions from optional page
audits, page-evidence evaluations and Search Console tools. Signed-out visitors
see setup and sign-in links, without fictional owned results, personal history,
a fake Acme identity or sample notifications. Demo charts have an explicit sample
data notice, separate actual-results navigation and a labelled sample export.
Demo navigation never substitutes private audit scores into sample charts.

Real company tiles use locally stored official favicons; the fictional Acme
sample keeps a placeholder. Asset provenance is recorded in LANDING-ART.md.

Validation on `f1512c0`: typecheck, 358 unit tests, 86 focused desktop/mobile
browser cases, five additional dialog/export/real-auth cases (one existing mobile
auth duplicate skipped), Cloudflare build, frontend dry build and actual built
Worker runtime smoke all pass. The real-auth case uses an isolated Better Auth
and D1 test account; scanner/provider operations are simulated. No provider
search or paid SEO lookup was performed. Twelve additional visual checks cover
signed-out, empty and populated My websites on desktop/mobile in light/dark mode,
with no overflow, browser errors or non-GET API requests observed.

The workstation dev server returned AUTH_UNAVAILABLE during its real sign-up
smoke. The passing isolated auth test does not validate that workstation's auth
configuration or live Google sign-in. The local fixture previews use a labelled
sample account, prohibit writes and run no searches. These changes are saved on
`codex/dashboard-guided-setup`; this record does not claim production deployment.

# Route styling audit and login refresh

Audited on 8 November 2026 with fixture data. This is local browser verification, not live account/provider validation or production deployment.

## Route coverage

`tests/page-style-audit.spec.ts` visits 24 route/view combinations in both signed-out and empty signed-in workspace fixtures, in desktop (1440 × 1000) and mobile (393 × 727) Chrome projects. The mobile runs also check overflow at 320 × 780. The expanded light/dark matrix is configured for 192 page visits and 96 additional narrow-width checks. The complete expanded run has not passed; see `LOCAL-CI-2026-11-08.md` for the interrupted CI result. The earlier light-only audit passed at revision `43bac97`.

| Surface | Paths / views |
| --- | --- |
| Public entry | `/`, `/start`, `/hackathon` |
| Overview | `/overview`, `?view=workspace`, `?view=demo` |
| Index | `/leaderboard`, `?indexView=html`, `?indexView=published` |
| Workspace | `/websites`, `/visibility`, `/seo`, `/patches`, `/search-data`, `/search-console`, `/agents`, `/benchmarks` |
| Evaluations | `/evaluations`, `?view=page` |
| Standalone | `/pricing`, `/settings`, `/privacy`, `/docs/api` |
| Login | `/login?next=%2Foverview%3Fview%3Dworkspace` |

The audit checks visible native selects, page-level horizontal overflow, enabled dropdown menus and their viewport/text bounds, Escape/focus restoration, runtime errors and unintended API writes. Opening and control screenshots are retained in ignored Playwright results; screenshot contact sheets were visually reviewed. No visible native dropdown or page-level horizontal overflow was found in the final runs. Public artifact data, a named published-site fixture, and explicit empty private fixtures keep customer records out of screenshots. Populated private selections have separate workflow fixtures; the route audit does not stand in for every account/data configuration.

The initial private fixture omitted the cost summary's `groups` and `recent` arrays. Correcting that fixture removed its pricing-page exception; no production cost-summary behavior was changed.

## Login changes

The login uses a compact header, a rounded method-choice card and newly generated paired light/dark arch artwork. Google is shown only when configured; Continue with email reveals the existing form and focuses the address field. Configured GitHub is available under More sign-in options. The mobile chooser has a cropped artwork banner, which gives way to the email form. Controls compress on press and spring back, with reduced-motion support. The form retains 16px inputs, password visibility, named pending state, disabled submission controls and concise privacy copy. Asset prompts and motion provenance are recorded in `LOGIN-DARK-POLISH.md`.

Existing email/signup requests, configured-only Google/GitHub methods and validated local return hints remain in the original Login function. UI fixtures verify error recovery and the exact `/overview?view=workspace` destination. No new identity scope, provider collector or paid action was added.

## Verification

The combined CI result is recorded in `LOCAL-CI-2026-11-08.md`; it is failing and the full browser suite did not finish. The route-audit cases each contain all 24 route/view visits, rather than counting each visit as a separate test. Screenshots and generated reports remain ignored local artifacts.

The published technical Index uses a schema-complete named site fixture, and the audit asserts that its link is rendered. This covers the successful published-index state rather than mistaking a malformed fixture’s error panel for loaded content.

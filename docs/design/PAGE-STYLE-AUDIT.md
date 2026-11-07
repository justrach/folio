# Route styling audit and login refresh

Audited on 8 November 2026 with fixture data. This is local browser verification, not live account/provider validation or production deployment.

## Route coverage

`tests/page-style-audit.spec.ts` visits 24 route/view combinations in both signed-out and empty signed-in workspace fixtures, in desktop (1440 × 1000) and mobile (393 × 727) Chrome projects. The mobile runs also check overflow at 320 × 780. This covers 96 page visits and 48 additional narrow-width checks.

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

The old green split panel, decorative rising bars, oversized italic headline and tiny form styles were removed, including 224 lines of unused login CSS. The new dedicated `login.css` uses the shared cream/forest palette, a visible Folio header, readable fields and the existing generated dune poster. The artwork is decorative and hidden on mobile. The form has a real main landmark and primary heading, 16px input text, password visibility control, named pending state, disabled fields/mode switch during submission, concise privacy copy and a privacy link.

Existing email/signup requests, configured-only Google/GitHub methods and validated local return hints remain in the original Login function. UI fixtures verify error recovery and the exact `/overview?view=workspace` destination. No new identity scope, provider collector or paid action was added.

## Verification

All 38 cases in the route-audit, login-polish, GitHub-auth, frontend-workspace and shared-appearance browser scopes passed. The route-audit cases each contain all 24 route/view visits, rather than counting each visit as a separate test. TypeScript and all 313 unit tests passed. Screenshots and generated reports remain ignored local artifacts.

The published technical Index also uses a schema-complete named site fixture, and the audit asserts that its link is rendered. This covers the successful published-index state rather than mistaking a malformed fixture’s error panel for loaded content. The production build passed with the existing Next.js version override.

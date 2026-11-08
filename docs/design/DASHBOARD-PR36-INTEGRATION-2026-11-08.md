# Dashboard PR #36 integration — 8 November 2026

The private workspace incorporates PR #36's question search/outcome filters,
List/Cards preference, UTC date windows, saved-audit scrubber and CSV exports.
The activity inspector starts collapsed to keep the summary compact. Shared
press motion covers the new controls and respects reduced motion. Mobile date
and export popovers use the top layer, visible-viewport bounds and space above
the theme picker; their controls have touch-sized targets.

Historical date windows select the latest completed answer and attempt within
that window for question rows and their CSV. The answer summary cards continue
to describe all loaded history, as stated in the window scope. Additional owned
historical answer details are read with GET; filtering and exports never start
or reconcile a run. Exports distinguish the shown question list from all saved
attempts/audits in the date window. Download state is tied to actual CSV contents.
CSV cells protect formula prefixes, including leading whitespace/control cases.
The saved-data refresh also updates the current day used by presets and filenames.

Only loaded, owner-scoped records are used. An owner change still remounts the
private overview, clearing selections and export state; anonymous/public pages
do not mount these private readers. Test-only fixtures and the local preview
proxy remain separate from the application and production deployment. The proxy
binds to loopback and labels its data illustrative.

The horizontally scrolling outcome buttons establish the containing block for
their hidden accessible labels. Those labels no longer expand the mobile layout
viewport or displace model-menu pointer coordinates. Open date/export panels
observe their own size so later wrapping/style changes preserve the theme-picker
clearance. Email-method focus settles in the layout effect rather than a deferred
animation frame, preventing a late focus change while entering a password.

The hosted CI failure reported on PR #36 was a test-loader interop issue:
`copy.requestResource is not a function`. The replacement regression transpiles
the actual request-scope source into two independent native ESM modules, checks
that their functions differ, and verifies that both copies plus the application
share only the request coordinator. It retains cleanup/isolation assertions and
does not change the working production pool implementation.

Validation and publication:

- All 13 local CI stages pass on application commit `d10a573`: typecheck,
  358 unit tests, 37 actual D1 integration tests, 396 desktop/mobile browser
  tests with two existing skips and no retries, Cloudflare build, backend
  build/runtime smoke, frontend build/runtime smoke and scheduler dry build.
- The native Cloudflare production build passes. Twenty repeated desktop/mobile
  cases pass for panel resizing and login focus. Earlier failures and traces are
  retained privately; no assertions were removed to obtain these results.
- [Hosted run 42453786376](https://github.com/justrach/folio/actions/runs/42453786376)
  passed browser coverage (393 direct passes, three passes on retry, two skips),
  then reached the 20-minute job deadline during the build. Commit `2cbae07`
  changes only that deadline to 30 minutes; all validation steps remain enabled.
  The replacement hosted run was pending at publication. Local build/runtime
  checks completed on the identical application source.
- PR #36 merged as `d82bd83`. The frontend-only production deployment is
  `68f0d53a-db6f-4d86-9764-21a06fca7446`, with `FOLIO_UI_COMMIT` identifying
  the tested application artifact `d10a573`. The merge and timeout-only change
  do not alter that application source.
- Production browser checks pass on desktop/mobile across six routes and
  system/light/dark themes. Six public benchmark reads returned 200 with
  `live-published-data` and no snapshot notice. Anonymous private reads remain
  401; legacy Index and question-index requests succeed. No browser errors or
  non-GET API requests were observed. The declared frontend routes are active;
  the existing public-index route is preserved.
- The backend remains version `bc6b7c06-4fc7-4a8a-b558-be966b7ff8c8` with its
  existing bindings and targeted `aws:ap-southeast-1` placement. The UI release
  did not publish the backend or scheduler.

Private dashboard behavior was exercised with isolated illustrative fixtures.
Production checks covered public/anonymous behavior, not a real owner's private
records or a new provider evaluation. Live retrieval does not imply that the
underlying saved observations were freshly collected.

This is frontend workspace integration. The PostgreSQL backend entry point,
Google auth configuration, Singapore placement and provider spending safeguards
are preserved. Publishing the frontend must not overwrite the backend Worker.

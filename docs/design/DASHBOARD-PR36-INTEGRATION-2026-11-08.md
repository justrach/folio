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

The hosted CI failure reported on PR #36 was a test-loader interop issue:
`copy.requestResource is not a function`. The replacement regression transpiles
the actual request-scope source into two independent native ESM modules, checks
that their functions differ, and verifies that both copies plus the application
share only the request coordinator. It retains cleanup/isolation assertions and
does not change the working production pool implementation.

Validation in progress. Focused browser checks passed 22 cases on desktop/mobile.
Earlier focused failures remain preserved privately; selected-pill accessible
names, future-dated fixture records and mobile viewport expansion were corrected.
The full validation and deployment outcome will be recorded after completion.

This is frontend workspace integration. The PostgreSQL backend entry point,
Google auth configuration, Singapore placement and provider spending safeguards
are preserved. Publishing the frontend must not overwrite the backend Worker.

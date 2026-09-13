# Folio UX review

Reviewed 13 September 2026 using Mobbin MCP and the current Folio source. The Mobbin screenshots were inspected inline; observations below describe visible screens, not inferred behavior from search metadata. These are focused design recommendations, not usability-study findings or claims that a reference product improves conversion.

All searches used the same task intent: “Improve Folio’s sign-in, data connection, and developer-tool discovery flows.” Queries contained general product journeys only. No private account, property, report, token, or source-code data was submitted to Mobbin. No reference images were copied into the repository.

This review covers Google identity, Search Console connection and property selection, saved report handoffs, and developer-tool discovery. It does not repeat the completed live provider validation. See [Search Console](SEARCH-CONSOLE.md) for the exact live scope and remaining checks.

## 1. Explain the next step before Google sign-in

**Current behavior.** The signed-out Search Console screen offers “Sign in with Google”; after identity sign-in, the user still needs to choose “Connect Google Search Console” and grant read-only access. The split is correct, but the first screen does not clearly explain that sequence. The general login screen also gives no reason why a person returning for Search Console will encounter a second Google action. Source: [`connect` and the connection panel](../src/components/search-console-panel.tsx), [`Login`](../src/components/dashboard.tsx).

**Observed reference.** [Gemini’s Google Workspace connection flow](https://mobbin.com/flows/7689b658-0dcd-4582-b0f7-19c443c73602) shows a disconnected integration, a dialog explaining the requested data access with separate Cancel/Connect actions, and then a connected state. This supports explaining the permission change at its point of use; Folio does not need to copy the modal.

**Recommendation.** Use state-specific guidance near the existing buttons: “Sign in to Folio first. Then connect Search Console with read-only access.” After identity sign-in, explain “Allow Folio to read search performance for properties you can access.” Keep identity sign-in and data access as distinct explicit actions.

**Acceptance.** Signed-out and signed-in screens explain their respective next step. Google identity still requests no Search Console scope; linking still requests only `webmasters.readonly`. No property fetch or import starts from sign-in navigation.

## 2. Require a deliberate property choice before import

**Current behavior.** Loading properties immediately selects `data.properties[0]`. The select displays raw property identifiers, and the helper explains URL prefixes without identifying whether the selected entry is a domain property. An account with several properties can import the first entry without noticing which one was chosen. Source: [`OwnerSearchConsole`](../src/components/search-console-panel.tsx).

**Observed reference.** [Gemini’s Drive selection flow](https://mobbin.com/flows/c7a2bf2e-aa95-478d-a181-d4b0923e2dea) visibly separates a file picker from the composer; the selected file then appears in the destination as a named object. This is an object-selection pattern, not a Search Console implementation reference.

**Recommendation.** Start with “Choose a property…” and keep Import disabled until a property is explicitly selected. Preserve an already selected valid property when refreshing the list. Describe the selected entry as “Domain property” or “URL-prefix property” beside its exact identifier so the owner can recognize the scope before importing.

**Acceptance.** Loading multiple properties causes no import and selects no new default. A keyboard user can select a property and enable Import. Refresh retains a still-valid choice; a removed choice returns to the placeholder.

## 3. Bring the selected report into view

**Current behavior.** Importing or opening a report updates the `report` query parameter, but the selected report renders after the connection panel and the entire saved-report list. There is no focus or scroll handoff. With many saved reports, especially on a phone, the successful action can leave its result below the viewport. Source: [`selectReport`, history, and `ReportView`](../src/components/search-console-panel.tsx).

**Observed reference.** The final inspected screen in [Squarespace’s account connection flow](https://mobbin.com/flows/7250b9c1-f318-47d9-8aa7-53a07536072b) places the user in the Search Keywords analytics destination and states that the connection succeeded, with a data-availability explanation.

**Recommendation.** After an explicit open/import resolves, move focus to the selected report heading and scroll it into view without animation when reduced motion is enabled. Announce “Report opened” or “Search report imported” through a status message. Retain the saved list and query URL. Do not repeatedly move focus on background state updates.

**Acceptance.** Open/import exposes the report heading on desktop and mobile; keyboard focus identifies the new content. Refresh, direct entry, and browser history still reopen saved data without imports. Partial and unavailable metrics keep their current labels.

## 4. Make leaderboard filters describe one consistent result set

**Current behavior.** `Leaderboard` filters table rows by industry and search text, but `RankChart` receives only metric and industry and independently filters its own `brands` array. Searching a website therefore changes the table while leaving unrelated chart bars visible. The table search is also separated from industry/sort controls, and no active result count explains the narrowed set. Source: [`Leaderboard`](../src/components/dashboard.tsx), [`RankChart`](../src/components/charts.tsx).

**Observed reference.** The inspected [Unity catalog screen](https://mobbin.com/screens/33327be3-56c6-4e70-9d0d-bd6c0f3f0592) groups search, filter dropdowns, an active removable language filter, and sorting above the results.

**Recommendation.** Derive chart and table from the same filtered data. Group search and category controls, show “N results,” and provide a clear reset action when filters are active. If a developer-tool directory replaces this sample view, carry the same consistent filtering behavior into it rather than retaining two independent result models.

**Acceptance.** Search, category, and metric produce matching chart/table subjects and ordering; clearing restores the full set. Empty results have a reset action. Sample and published evidence remain separate.

## 5. Let people identify a developer tool before interpreting a score

**Current behavior.** The sample leaderboard exposes brand, domain, broad industry, score, and change. “Developer tools” is a single broad category, and there is no short description or API/CLI/MCP surface to explain a tool’s purpose. Those rows cannot yet support an informed developer-tool comparison. Source: [`Leaderboard`](../src/components/dashboard.tsx), [illustrative brand data](../src/lib/demo-data.ts).

**Observed references.** The inspected [GitHub Marketplace screen](https://mobbin.com/screens/6ce1e117-4cf7-4193-bc09-2295e7417277) pairs a visible category list with tools’ names and short functional descriptions. The inspected [Product Hunt listing](https://mobbin.com/screens/1c8fb0a3-0935-4880-b719-2f069788ae5e) places a short purpose statement directly under each product name, with a visible sort control. Neither screen establishes a benchmark methodology for Folio.

**Recommendation.** For the developer-tool discovery surface, give each tool a short factual purpose, category, and documented interface labels. Make the primary row action open its details/evidence. Keep browsing order separate from a measured ranking; display “Not evaluated” where no comparable run exists and retain explicit sample labels for fixtures. Add categories only when supported by actual directory entries.

**Acceptance.** A user can find a tool by name and category, understand its purpose without opening every row, and distinguish an unmeasured listing from a measured or illustrative score. Interface claims link to supporting documentation; filtering does not start evaluations.

## Implemented Search Console improvements

The accompanying Search Console change implements the panel guidance in finding 1 and the report handoff in finding 3. The three-step guide identifies the current sign-in, permission, or import step. Successful explicit open/import focuses the named report region and scrolls it into view; initial direct entry and refresh retain normal focus. Browser back cancels an outstanding focus handoff, and reduced-motion preference is respected. No scope, import, or provider contract changed.

All 16 focused desktop/mobile fixture checks passed after these changes, including the three guide states, focus and viewport handoff, delayed report response, direct entry/refresh, explicit import, partial data, disconnect/history, and owner clearing. No live provider call was made for this review or its GUI validation. The separate developer-tool implementation owns any changes arising from findings 4–5; the deliberate property-choice recommendation in finding 2 remains a proposal.

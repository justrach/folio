# Landing design and contrast review

The September 13, 2026 update keeps Folio's cream/green identity while simplifying the page around query-specific search rankings. It replaces the tilted report cover, numbered sample cards, repeated oversized serif headings, and illustrative repair panel with a ranked comparison, five audience question rows, and native FAQ disclosures.

The primary view reads `public-search-rankings.json`, a public projection of completed Astra open-web observations. Category and query selection keep each returned list separate. Rank is the original one-based position in that response. Website links, attached citation links, observed time, and model remain visible; reasons and collection provenance expand on demand. Missing observations produce no rows or invented positions. No aggregate rank or comparison delta is calculated across queries. Changes to a query's wording, language, or locale require a new query ID so earlier observations keep their original context.

The current public artifact contains three prepared questions and **zero published search observations**. Public collection is on hold. The UI therefore shows an explicit empty state; private workspace results are not used to populate it. Populated-result validation is deferred until collection and publication of public observations are authorized again.

The HTML report remains under a separate disclosure and reads Folio's saved `readiness-v1` observations for all 36 public websites in the September 13 batch. Allbirds is its initial selection. Readers can choose any website, sort and page through ten checks, open a finding, and inspect captured URLs, time, and SHA-256. Scores describe the captured HTML rubric; they do not claim search position, product quality, or successful agent tasks. The full index similarly defaults to Search rankings, with HTML page checks in a separate view.

The HTML report reuses the existing Spectrum table. Its Apache-2.0 attribution and the existing Rare UI attribution/license files remain intact. The compact rows and progressive disclosure apply the supplied design references to useful controls. On mobile, the HTML table scrolls within its own region; a visible hint explains how to reach points and details. Opening a finding returns horizontal scroll to the left and focuses its heading. The ranking table uses two native columns so rank and website stay visible together on narrow screens.

The palette in `src/components/landing.css` uses:

- Warm cream page `#f8f6ef` and warm-white report `#fffef9`.
- Forest headings/actions `#183b2d`, body text `#3f5149`, and secondary text `#536158`.
- Solid rules `#bcc7bb` and restrained table backgrounds.
- The existing serif for the wordmark and main headline, with sans-serif section headings and report text.

The HTML-report layout was inspected at 1440px, 900px, and 390px, with minimum computed visible-text contrast of **6.03:1**, resolving the nearest opaque background. No inspected text failed its contrast threshold. No page overflow occurred, including expanded finding/source/FAQ states. Desktop, tablet, and mobile screenshots were visually reviewed. This bounded color and interaction check is not a whole-site accessibility conformance assessment; it does not replace inspection of populated search rankings.

With Bun 1.4.1, TypeScript passed after ranking integration. Ten desktop/mobile directory cases and eight landing/ranking cases passed with the initially empty search artifact. They cover category/query selection, absence of fabricated ranks, separation of HTML scores, all 36 measured page results, sorting, pagination reset, keyboard disclosure, source/hash consistency, and viewport fit. The browser checks observed no JavaScript errors or provider/non-GET requests. Reading saved public reports starts no new evaluation. Tests also assert each real recommendation's original position, visible citation links, reasons, and provenance once completed public observations are supplied; those populated-result assertions require a subsequent run.

Eight artifact-validation cases passed. The loader accepts only the public field allowlist and completed managed open-web observations, checks original list positions and query membership, and rejects unsafe links or citations absent from the returned source list. Raw provider collections, account records, reference answers, and bearer credentials have no fields in this public projection.

The `kill-ai-slop` source scan was reviewed for the three landing files. Its remaining leads were normal link underlines and the existing `Mark` component name; these are intentional, not decorative keyword highlighting. No new gradients, animated effects, number badges, or fabricated statistics were added.

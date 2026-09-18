# Folio design review

Reviewed 13 September 2026 using the installed `kill-ai-slop` skill. The user approved all four groups below, and the focused changes have now been applied. The original review locations and proposed wording are retained here as the review record.

## Scope and method

The bundled scanner was inspected before execution. It imports only Node filesystem/path/URL helpers, performs source reads, and prints results; no extra rule modules were loaded. The scan root was **`src/` only**, so local credentials, private exports, Wrangler state, dependencies, and build outputs were outside its traversal.

```sh
node /Users/blackfloofie/.codex/skills/kill-ai-slop/scripts/scan.mjs /Users/blackfloofie/folio-01/src --json
```

The initial scanner examined 76 files and returned 134 leads in 10 categories. Those are pattern matches, not 134 confirmed design problems. Source review narrowed the useful changes to the four groups below. Line numbers in the review tables describe the original working tree, before these edits. Visual validation is performed separately from this source review.

## Approved changes

### 1. Give landing copy and actions concrete meaning

| Location | Confirmed issue | Minimal proposed replacement |
| --- | --- | --- |
| `src/components/landing.tsx:72` | “One considered view” and “a clearer voice” leave the first paragraph vague about the workflow. | “Audit a page, inspect the saved evidence, and download changes for your team to review.” Keep the separate visible disclosures about illustrative AI visibility data. |
| `src/components/landing.tsx:78` | “Find your perspective” does not explain that the action opens the overview demo. | “Explore the demo”, matching the navigation and final call to action. |
| `src/components/landing.tsx:158` | “A little clarity. A meaningful next step.” adds a second general promise where the section introduces three specific actions. | “From page audit to reviewed repair.” |
| `src/components/landing.tsx:436` | “Start with a clearer picture. Leave with a next step.” repeats the earlier abstract promise. | “Open the sample workspace and inspect a report.” |

These are tell 14 findings from reading the copy; the scanner’s short phrase list did not catch them. Keep the main editorial hero treatment unless the user chooses a broader copy rewrite.

### 2. Remove introductory labels that add no information

| Location | Confirmed issue | Minimal proposed fix |
| --- | --- | --- |
| `src/components/landing.tsx:62` | “A NEW CHAPTER IN DISCOVERY” repeats the hero’s future-of-search theme without giving a date, category, or actual state. | Remove this label and its decorative dot. Keep the hero spacing deliberate. |
| `src/components/landing.tsx:156` | “FROM FINDING TO FIX” becomes redundant with the specific section heading proposed above. | Remove this label if group 1 is applied. |
| `src/components/landing.tsx:298` | “A CONSIDERED CHOICE” adds no factual information to the positioning section. | Remove the label; retain the heading and sourced competitor disclosure. |
| `src/components/landing.tsx:430` | “YOUR NEXT CHAPTER” repeats the same chapter metaphor above the final call to action. | Remove the label. |

This is tell 10, not a proposal to delete the shared `.eyebrow` style. Keep labels that identify the source, measurement type, privacy, version, or sample/live state. In particular, the Search Console source labels at `src/components/dashboard.tsx:162` and `src/components/search-console-panel.tsx:173` carry useful information.

The same pattern also appears on operational pages, for example `src/components/dashboard.tsx:111`, `src/components/dashboard.tsx:167`, `src/components/agent-runs-panel.tsx:104`, and `src/components/evaluations-panel.tsx:219`. Treat those as a separate follow-up after reviewing the landing change; they are outside the proposed first edit.

### 3. Remove numbers from unordered benefits

`src/components/landing.tsx:256`, `:268`, and `:280` number the paper trail, repair ownership, and benchmark benefits as 01/02/03. These benefits are independent; the numbers imply a sequence that the text does not require (tell 30).

Remove those three spans and retain the existing heading, body, status text, and dividers. Adjust `.difference-list article` spacing only as needed after removing the number column. Keep **01 / OBSERVE → 02 / UNDERSTAND → 03 / IMPROVE** in the product section: that numbering describes an actual workflow. Keep visible sample rank positions and methodology catalogue identifiers.

### 4. Flatten status dots

| Location | Confirmed issue | Minimal proposed fix |
| --- | --- | --- |
| `src/components/landing.css:73` | A four-pixel halo turns the decorative hero dot into a status-like signal even though its label has no changing state. | Remove the dot with the label in group 2; otherwise remove its `box-shadow`. |
| `src/components/agent-runs-panel.css:9`, `:11` | Connection status already has a word and a dot; the extra halo adds no state. | Remove the two `box-shadow` declarations and preserve dot color and text. |
| `src/components/evaluations-panel.css:216`, `:217`, `:218` | The event-state dots repeat the halo treatment for every activity entry. | Remove the three `box-shadow` declarations; retain the event labels, details, and state colors. |

These are tell 16 findings confirmed from CSS, even though the scanner primarily surfaced them under generic circular-radius matches. No pulse, status semantics, or state logic needs changing.

## Search Console copy notes

The new panel uses concrete actions, owner-bound records, tabular numerals, and useful source labels. Its connected/partial states, exact-property guidance, Pacific reporting dates, privacy explanation, and unavailable-data messages should stay.

Two small wording refinements are useful when the active implementation settles:

- `src/components/search-console-panel.tsx:142`: use “Imports finalized data for a 28-day window ending three days ago.” The implementation requests a fixed date window; it does not search backward until 28 days containing finalized observations are found.
- `src/components/search-console-panel.tsx:180`: shorten the repeated coverage paragraph to “Tables show up to {rowLimit} returned rows per view.” The saved report warnings immediately above already explain omitted queries, bounded samples, and why dimension sums differ from totals. Keep those warnings and the empty-table explanation.

These preserve the evidence contract; they do not remove disclosures to make the screen cleaner.

## Keep the deliberate design

The cream, green, and chartreuse palette, editorial serif, printed rules, report-cover illustration, and concentric Folio mark have an explicit annual-report reference in `README.md:128` and are required by the working agreement. The generic skill’s preference for neutral SaaS styling does not justify replacing them.

Other scanner leads to keep:

- `<Mark />` is the Folio brand component, not an HTML text highlighter. The counter’s `Mark` is also a component; these account for false decorative/highlight hits.
- Link underlines identify real links. The footer © is a copyright notice, and the sample brand symbols are not emoji decoration on every heading.
- Circles used for avatars, chart scores, state dots, and the brand are meaningful shapes, not excessively rounded cards.
- Rare UI gradients mask the edges of animated content; they are not atmospheric backgrounds. Preserve its vendored attribution and license.
- The repeating linear gradient at `src/app/globals.css:1329` draws chart gridlines. The radial patterns at `:304` and `:1021` echo the established concentric mark.
- The modal shadow and blurred modal/mobile-navigation backdrops separate an active overlay from underlying content. They are not the default card surface.
- The monospace declaration at `src/app/globals.css:2061` styles a code diff.
- Large serif headings are an explicit editorial choice. The report’s sample numbers are visibly labelled illustrative; do not mistake them for fabricated customer adoption claims or erase those labels.

## Approval and validation

The installed [skill](../../.codex/skills/kill-ai-slop/SKILL.md) explicitly says: **“Do not mass-edit before the user has seen the report.”** The report was presented and the user approved all four groups. This pass applied landing copy, redundant landing labels, unordered benefit numbers, and flat status dots. No palette, brand, font, or page-layout replacement was made.

The change also removed unused styles for the deleted labels and number column, and adjusted heading/mark spacing after label removal. Agent connection and evaluation event dots retain their original colors, labels, and state behavior.

The post-edit scanner examined the same 76 files and returned **124 leads across 10 categories**, down from 134. The decrease consists of six kicker/style matches, three unordered number matches, and one removed decorative circle. The specific copy rewrites and most halo removals are not directly measured by the scanner, so its count understates those changes. Remaining leads include the intentional and false-positive cases listed above, plus operational-page copy outside this approved first pass.

TypeScript and `git diff --check` passed for the changed source. Desktop/mobile visual checks are handled separately by the integrating agent; this report does not claim that source checks establish the rendered result.

## Research run interactions — September 18

Website question launches now display an immediate starting panel while the POST is pending. Saved running observations show the selected model, elapsed time, a quiet concentric indicator, and expandable recorded milestones. These are derived from saved request/session/answer fields; there are no simulated tool calls, percentages, streamed answers or invented reasoning. Cancellation intent and needs-attention states stop the activity animation. Enabled tools are labelled as enabled, not as executed.

Tool options use native 20px checkboxes inside full-label cards, with visible focus and checked states. Motion uses an explicit reduced-motion fallback, plus a pause-animation control that does not pause or cancel the remote task. The elapsed timer is not a per-second live announcement. Hidden milestone content is inert. Presentation interactions do not add provider requests, change polling, grant spending, or retry a launch.

Visual references: [Beautiful UI loading states, tool chips and task rows](https://www.beautifului.dev/). Accordion CSS uses the installed [transitions.dev](https://transitions.dev/) pattern with its semantic tokens and reduced-motion guard. Folio retains its cream/green visual theme; no third-party component package was added.

Validation: TypeScript passed. The 54-case desktop/mobile suite passed 47 initially; seven outdated copy assertions failed, were corrected or had recovery wording restored, and all 16 focused reruns passed. New checks exercise delayed launch feedback, native checkbox geometry/keyboard selection, disclosure, pause/resume, reduced motion, cancellation and no extra paid starts. An initial test-server startup hit a local SQLite lock; restarting succeeded without modifying stored data. The screenshot preview uses fixtures, not a live provider run.

## Four-model index landscape

The public index leads with a cream/forest-green scatterplot comparing one shared ten-question cohort across Astra, Sol, Terra and Luna. Small dots represent completed attempts; larger directly labelled dots show model medians. Cost uses a labelled logarithmic USD scale; vertical position measures seconds from request persistence to outcome persistence, including retrieval delay, not tokens per second. No winner zone or quality score is inferred from cost and time.

Model cards link to URL-backed model filters. An accessible table exposes completion denominators, plottable counts, medians, all-attempt token estimates and known-cost counts. Failed attempts remain in totals, unknown costs remain null, and explanatory text identifies survivorship bias. Mobile uses two-column model cards and a horizontally scrollable chart/table rather than shrinking axis labels beyond readability. No animation is required. Publication includes only the authorized cohort's public projections and bounded metrics; account/provider identifiers and raw answers stay private.

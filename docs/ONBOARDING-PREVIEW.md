# Onboarding preview

`/onboarding` is a fixture-only, unauthenticated walkthrough of Folio's website-onboarding flow.
It exists so the UX can be reviewed before the real capture, evaluation, and account plumbing is
attached. The route is excluded from indexing (`noindex`/`nofollow`) and is not linked from the
product navigation.

## Boundaries

- **No programmatic network work.** The page makes no external or `/api` calls — nothing is fetched,
  collected, or submitted. The only outbound link is a clearly labelled source URL the reader may
  choose to open. The address only decides whether the bundled Codegraff sample applies.
- **No measurement.** Positions shown in the report preview are static fixture data, labelled
  "Illustrative AI-answer order, not Google rankings". Edited, custom, keyword, and named-comparison
  questions always show "No sample observation" — sample positions are never fuzzy-reused.
- **No persistence.** All state lives in component memory. Refresh resets the preview; nothing is
  saved to an account, cookie, or storage.
- **No paid or implied entitlement.** The report plan states plainly that no collection starts, no
  charge applies, and a production report allowance is not implemented.

## Flow

Four progress steps — Website, Understanding, Goals & competitors, Report plan — then a report
preview (not a fifth step).

1. **Website**: public address input normalized with the same `readEvaluationIntent` helper used by
   evaluation handoffs, plus an editable business name (default `Codegraff` for the sample site
   only). Non-sample sites get no supplied evidence: blank manual statements and no fixture content.
2. **Understanding**: three reviewable statements (description, audience, capabilities). Actions are
   "Looks right", "Edit" (seeds prior wording or the suggestion), and "Other options" (Remove,
   Not sure). A saved revision stays as the card text and survives later status changes; restoring
   the original requires the explicit "Use original suggestion" action inside the expandable
   "Original suggestion" details. Every statement must be decided before continuing; removed/unsure
   statements stay out of the asserted profile. Source details show a clearly-labelled mock excerpt
   and the source URL.
3. **Goals & competitors**: compact, whole-row-checkable topic rows become report questions. When
   the sample capabilities statement is accepted, three rule-based demo topics are offered
   (explicitly not AI-generated research); otherwise the user is told to add their own. Custom
   topics can be removed in place and use the fixed template
   `Which tools are suitable for <topic>?`. Question wording itself is edited on the plan step.
   Competitors default to *Track competitors* (open discovery); the explicit
   *Compare specific businesses* choice switches to named comparison only when names exist, and is
   labelled non-neutral.
4. **Report plan**: reviewed profile, topic-sourced editable/selectable questions, mode, and the
   "Preview first report" CTA with the demo-only notice.
5. **Report preview**: comparative table (Question | business | tracked competitors) showing sample
   positions only for exact unedited fixture questions in open mode on the sample site. On narrow
   screens each question becomes a card with labelled business/competitor cells so positions stay
   readable without sideways scrolling. A sample-only advisory agent action, a "Review agent brief"
   in-page panel (nothing is sent or executed; includes mode, competitor names, and final question
   prompts), and a "Download agent brief" JSON export flagged `mock: true`, `measured: false`,
   `persisted: false` complete the preview.

## Tests

```sh
node --conditions=react-server --import tsx --test tests/onboarding-mock.test.ts
bunx playwright test tests/onboarding-mock-gui.spec.ts
```

Unit tests cover the fixture helpers in `src/lib/onboarding-mock.ts` (claim decisions, list limits,
topic reconciliation, sample observations, export shape). GUI tests run on desktop and mobile
projects, drive the full flow including the JSON download, and abort-and-assert against any `/api`
or external-origin request.

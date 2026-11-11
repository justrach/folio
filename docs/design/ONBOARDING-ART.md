# Onboarding artwork and motion (/start)

The guided setup at `/start` is drawn in the same hand as the landing (`src/lib/sketch.ts`, see [LANDING-ART.md](LANDING-ART.md)). The landing's two buttons lead here, so the setup reads as the next page of the same book. The steps, requests, validation, navigation rules, session restore, "Save and exit" and every sentence about cost, credits or what runs are unchanged.

Files: `src/components/onboarding-sketches.tsx` (every drawing, the trail, glyphs, the meter, the drawn checkbox, `useInkLive`), `onboarding-sketch.css` (their ink and motion), `onboarding.tsx` / `onboarding.css` (layout and step motion), `onboarding-progress.tsx` (baseline queue marks). Test: `tests/onboarding-drawn.spec.ts`.

## The trail

The step bar is a drawn path with seven waypoints. It is still a `nav` labelled "Setup steps" with an ordered list, `aria-current="step"` on the current item, and "Back to {label}" buttons only where `nav.can` allows a return.

- A finished step gets a small planted flag, drawn on when the step completes.
- The current step is a circled number; the circle boils (three redrawn frames in turn).
- Steps ahead are faint rings with their numbers.
- The stretch of path before each waypoint is dashed until the walker passes it, then inked in; going back un-inks it.
- From 1240px the full trail shows; at exactly 1240 the wordmark, trail and "Save and exit" fit with room to spare (the test checks they do not touch). Below 1240px the compact "Step n of 7 · label" text and its `progressbar` stay, with a small drawn trail inside the progress bar, inked up to the current step. On phones the header is two rows: wordmark and "Save and exit", then the step text and the trail at full width.
- "Save and exit" now also shows on phones (it used to be hidden below 600px). It is the same button with the same action, offered on steps 4 to 7 once signed in, and absent when signed out and on step 8, as before.

## Scenes

Each step has one drawing, placed under the copy on wide screens and as a small banner above it on narrow ones. All are `aria-hidden` decoration on a tinted plate (the landing's storyboard colours). None shows a number, a rank, a score or an outcome.

| Step | Drawing | Idle motion |
| --- | --- | --- |
| 1 Website | a web page under a lens | the lens drifts across the page |
| 2 Report | a page with margin ticks and one line circled, a pencil | the circle is redrawn; the pencil rocks |
| 3 Account | a folder with the report tucked in, and a key | the key swings |
| 4 Customers | three people and a speech bubble with a question mark | the bubble nods |
| 5 Questions | a clipboard list with three of four boxes ticked | the ticks are redrawn one after another |
| 6 Competitors | three plain website windows watched by an eye | the eye looks left and right |
| 7 Baseline | a question in a bubble and a paper plane setting off along a dashed path | the plane bobs |
| 8 Search Console | a globe joined to four bars | the bars rise once |

The horizon image on step 1, the CSS ring mark, the icon-set arrows, shield, tick and cross, and the "←" and "+" glyphs are replaced by drawn equivalents (`InkMark`, `InkArrowRight`, `InkPlus` and `InkUnderline` from `landing-sketches.tsx`; `InkBack`, `InkShield`, `InkTick`, `InkCross`, `InkBox`, `InkRunState` drawn here). The "+ Add more" button keeps its accessible name with a visually hidden "+". Company favicons are real brand images and stay.

## Decoration and data

- Decoration: every scene, the trail's flags and rings, the drawn rules between rows, the drawn frame around each sheet, the heading underlines.
- Data, unchanged in content and semantics: the step 2 score (still a `role="img"` "N out of 100"), its fixes and passed checks; the step 4 live question preview; the step 5 question list (same checkboxes, scroll window, fade and fixed footprint); the step 6 competitor table; the step 7 counts and access message; the step 8 queue.
- `InkMeter` is the one drawing that carries a value. Its ink ends at exactly the measured score (`4 + 392 × score / 100` in a 400-wide box); the pen's wobble only moves the line up and down. The value stroke has a butt cap and the end mark sits just inside the value, so no ink is painted past the score; at 100 the ink ends where the track ends. A score of 0 is an empty track: no value ink and no end mark. The test reads the painted pixels at 72, 0 and 100, and with motion on checks that the value stroke and end mark are drawn on and finish fully drawn.
- The heading underlines cover one or two short words ("your website", "72 out of 100", "over time", "need?", "buyers ask", "recommends", "watch?", "now", "Google clicks"). The underlined words do not wrap, so they are kept short enough to fit a 320px screen.
- Rules and frames are Pen paths delivered as CSS masks (`INK_RULES` custom properties on the page root), so rows keep their semantics and no extra elements enter tables or lists.

## Motion rules

- Everything that moves is inside `prefers-reduced-motion: no-preference`. With reduced motion every drawing is shown complete and the score shows its final value at once.
- Only `transform`, `opacity`, `clip-path` and `stroke-dashoffset` animate. No SVG or CSS `filter` is used by the drawings. (The step 5 scroll fade's `backdrop-filter`, which its test pins, is unchanged.)
- A step change slides in the direction of travel: the back link and eyebrow, then the heading, then the rest, 70ms apart; the sheet follows from further out; the scene draws itself on; lists arrive 45ms apart after the sheet.
- The step 2 score counts up over 700ms after a 420ms wait for the sheet, and its meter is drawn on the same curve and timing.
- On step 1 the preview card always holds three faint lines of handwriting that stand for the page. "Checking your page…" writes them again and again, runs a pen stroke along the empty meter, and looks at each check in turn. Nothing ticks, so nothing suggests a result before there is one. Because the lines are always there, the card keeps the same height before, during and after a check.
- Checkbox ticks are drawn in when a box is checked. Buttons lift on hover and press in; arrows nudge.
- The baseline queue marks a running question with a circle that keeps being redrawn, a saved one with a tick, a stopped one with a cross, and a waiting one with a dashed ring.
- Loops run only while their drawing is on screen and the tab is visible (`useInkLive` sets `data-live` from an IntersectionObserver and `visibilitychange`). While someone types in a field, and for 1.2 seconds after the last keystroke, every loop pauses; submitting a form resumes them at once. Rows that appear while typing (the step 6 preview row, the step 1 preview's checks) do not animate, and the step 1 preview card only fades in.
- Nothing changes layout after a step has settled: the step 5 test measures the question sheet, and the drawn-onboarding test measures the step 1 card through a check.
- Focus still moves to the `h1` on each step, and every control keeps a visible focus ring.

## Verification

Local only, against mocked APIs. `tests/onboarding-drawn.spec.ts` renders all eight steps (including step 7 for an account that may run, without pressing "Start baseline", and step 8 with existing runs and no run started), checks the six paid-action sentences word for word, checks layouts at 320, 393, 1240 and 1440px, and, with reduced motion turned off, checks that drawings finish, loops pause while typing, and a forward step plays and settles. No run was started, no onboarding state was written for a real account, and nothing was deployed.

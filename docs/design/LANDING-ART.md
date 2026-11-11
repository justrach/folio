# Landing artwork and interaction

The sparse landing revision starts from `a351884`. The generated poster replaces the collage; the repeated benefits and audience sections are removed. Existing public recommendation and HTML reports retain their evidence and separate meanings. Both primary actions retain the `/start` handoff.

`public/images/folio-dune-hero.webp` was generated with the built-in imagegen tool using the user's moodboard as a reference, then compressed to WebP. The artwork is decorative, not a measured result or product screenshot.

Final generation prompt:

```text
Use case: stylized-concept
Asset type: Folio website landing hero artwork, portrait 4:5 poster.
Primary request: An extremely sparse, beautifully art-directed desert abstraction inspired by the attached moodboard's minimalist Dune and Bauhaus posters. Premium cinematic concept art with tactile fine-art print quality.
Input images: Image 1 is a moodboard reference only; do not reproduce its text, logos, layout or screenshots.
Subject: One sculptural sweeping dune, with a deep forest-black shadow face and muted burnt-orange sunlit edge, beneath one small ochre-orange sun. Expansive warm ivory sky occupies the upper two thirds. Sculptural organic geometry, quiet mysterious atmosphere.
Color palette: warm cream paper, dark forest green nearly black, restrained burnt orange.
Materials/textures: subtle analog film grain, matte handmade paper, fine sand. Crisp elegant silhouette with soft light.
Composition: single simple dune rising from the lower edge, a graceful ridge line; generous negative space, no clutter.
Constraints: no typography, no logos, no watermark, no border, no people, no UI, no extra planets, no vivid saturated rainbow colors.
```

Design consultation: `graff --yolo --model 'grok 4.7'`, bounded to eight model calls, supplied read-only recommendations. It reached the model-call cap after returning its advice; no Graff file edits were made. Its direction was a poster-led hero, fewer repeated explanations and manual workflow cards, with real reports lower down.

The landing uses the actual [Bencho Card Swap](https://bencho.dev/blocks/card-swap) React/CSS source from `cabralorenzo/bencho` revision `c65992417427bb09e661674ffa800bef29adef49`, vendored in `src/components/bencho/card-swap` with its MIT license and an upstream adaptation record. It retains upstream perspective, slot transitions and rubber-band/velocity-based dragging. Folio adds workflow content, keyboard activation/focus transfer, an explicit Next control and reduced-motion support. There is no autoplay. [Cuelume](https://github.com/danielwh2/cuelume), an MIT-licensed dependency, supplies quiet `toggle` and `navigate` cues. Sound starts off, is enabled only by the sound button, and resets on leaving/reloading the page. No audio files or external audio requests are needed.

Provider validation and production deployment are separate from local UI validation. This revision starts no product evaluations or paid report lookups during navigation.

An Impeccable `typeset` pass used the official skill from `pbakaus/impeccable` (4.8.0), independent typographic and mechanical assessments, and rendered desktop/mobile checks. It restores the existing self-hosted DM Sans, relaxes tracking, enlarges small metadata, removes redundant eyebrows, and separates plain ranks from brand icons. The final mechanical scan returned no findings; that is not a claim of full accessibility conformance.

Company favicons are static PNGs collected for existing public recommendations and the catalog through Google's favicon service. `src/data/company-favicons.json` maps 128 known public hosts to local assets. Six unavailable icons use the letter fallback. Browsing makes no external icon requests; unknown and absent URLs use the same fallback. Brand icons identify websites, not endorsements or scores.

Local verification: typecheck passed, 10 landing/report/ranking desktop/mobile cases passed, and six targeted start-flow and synthetic-layout cases passed. The synthetic renderer initially exposed a missing React import in the new favicon component; that was corrected and its desktop/mobile reruns passed. A broader grep also selected the existing published-audits test, which still expects the removed `Explore sample rankings` control; its desktop run timed out and its mobile run was interrupted. That unrelated legacy test is not claimed as passing. No product provider call or deployment was made.

The plain Cloudflare build command is blocked by OpenNext's support-policy check for the base revision's Next.js 15.5.25. The final Cloudflare build passed with the explicit `--dangerouslyUseUnsupportedNextVersion` flag, without changing the Next.js version or deploying.

The demo dashboard's real company tiles also use local favicons. Notion's
`notion.so` alias resolves to the existing Notion asset. Additional icons were
retrieved from the companies' own published icon links on 8 November 2026:
[Linear](https://linear.app/favicon.ico?v=2),
[Webflow](https://cdn.prod.website-files.com/686294e263eb7e215bd232f7/686d53ceda66a40cb6b6d546_favicon.png),
and [Framer](https://framerusercontent.com/images/Io89FonxEaWg4nxvQQllVLwPUUI.png).
They are stored as small PNGs in `public/images/favicons`; viewing the dashboard
makes no third-party icon request. The fictional Acme sample retains its letter
placeholder. Actual brand icons do not make the demo's scores real measurements.

## Hand-drawn revision (12 November 2026)

The owner asked for the landing to be redrawn by hand with motion. This revision replaces the generated dune poster, the Bencho Card Swap deck and every icon on the landing's own chrome. The vendored Card Swap source and the two `folio-dune-hero*.webp` files are no longer used by the landing; they stay in the repository with their records until a later cleanup.

- **Pen.** `src/lib/sketch.ts` joins hand-placed points the way a hand would: lines bow, corners miss slightly, circles overshoot where they close. It is seeded, so the server and the browser draw the same SVG. A `frame` argument redraws the same picture with a different tremor.
- **Drawings.** `src/components/landing-sketches.tsx` holds the dune poster (sun, ridge, hatched lit face, four numbered flags), the three storyboard scenes, the fine-print sketch, the sunrise, the underline and the ink glyphs. Nothing is traced from an icon set or generated by a model.
- **Motion.** `src/components/landing-sketch.css`: draw-on by `stroke-dashoffset` when a figure enters view (`LandingMotion` sets `data-inview`), a three-frame boil at about four frames a second while it is on screen (`data-live`), and loops for the sun, wind, the lens moving down the list, the pencil rewriting a line and the "check again" arrow. Reduced motion shows the first frame complete. Without JavaScript a `noscript` rule shows every stroke.
- **Meaning.** The artwork is decorative, not a measured result. The flags are numbered 4 to 1 up the ridge and a circle is drawn around the third: "find out where you stand". Nothing climbs, because a higher rank is not something Folio sells or promises.
- **Review.** Deployed to `staging.usefolio.site` (the `staging` environment in `wrangler.frontend.jsonc`, served `X-Robots-Tag: noindex, nofollow`). It reads the production public API; sign-in stays on `usefolio.site`.

## Hand-drawn workspace (12 November 2026)

The owner asked for the signed-in dashboard to be drawn by the same hand as the landing, with no icons and much more motion. This revision covers the workspace shell and its shared components; the onboarding flow was redrawn separately.

- **Icons.** The 103 icons in `src/components/icons.tsx` keep their names, props and accessibility, but no longer render their geometry directly. `Pen.trace` (added to `src/lib/sketch.ts`) reads each glyph's path data, circles and rectangles and redraws them once at module load: each corner lands a little off, straight runs bow by a share of their length, curves keep their shape but not their exact line, a closed outline runs past where it began, and a zero-length stroke stays a dot. The wobble is in grid units and shrinks for small marks, so a check, cross, arrow or chevron still reads at 13–17px. An interrupted attempt that roughened every icon with SVG displacement filters was removed: it put a filter on every icon of every page and, with its animated boil, a style pass on every frame.
- **Boil.** An icon rendered with `boil` (only the rail does this) carries three tracings in frame groups; `src/app/ink.css` shows one at a time by visibility. The current page's icon boils for about four seconds after it becomes current and then rests; a keyboard-focused rail icon boils for about two seconds; a hovered rail icon boils while hovered, on devices that can hover (on touch, `:hover` sticks after a tap). Spots and the horizon boil for about seven seconds after drawing themselves on. A running boil was measured to cost a style recalculation on every frame, which is why nothing boils on an idle page.
- **New drawings** (`src/components/workspace-sketches.tsx`): a horizon (dune and rising sun) replacing the two horizon WebP images in shared empty states; the loader (a page being written and ticked, on a loop); a small loop drawn and undrawn beside inline loading text; drawn marks replacing the `···`, ✳, ▥ and ✦ characters in the sample demo; the landing's `InkMark` replacing the ring-drawn Folio mark in the workspace, pricing and the agent consent card; the landing's `InkPlus` replacing the `+`/`−` characters on the overview insights disclosure.
- **Motion.** `src/components/workspace-motion.css` and `workspace-reveal.tsx`, described in design.md. Entrances use fill-mode `backwards`, so they never hold an end state over the controls' own hover and press styles.
- **Two glyphs traced with a steadier hand.** `Loader2` spins, so it is traced with little wobble and turns about its centre; `CircleDashed` measures its dashes along the drawn stroke (`pathLength`) and does not overshoot, so its eight dashes close evenly. Reduced motion shows everything finished and still.
- **Meaning.** Every drawing is decoration beside words that carry the meaning. None is a measured result, a rank or a score, and all are hidden from assistive technology. Real numbers keep their values and labels.
- **Left as they are.** Company favicons (real brand images); the sidebar's wordmark toggle (letter contours of the wordmark, not an icon); the login page's arch artwork; the `⌘ K` key label and em dashes for missing values, which are text.


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

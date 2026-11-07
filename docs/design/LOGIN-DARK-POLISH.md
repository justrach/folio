# Sign-in, dark appearance and control polish

Implemented 8 November 2026. This is visual and interaction work; it does not change provider scopes or launch paid actions.

The sign-in screen starts with configured Google and email choices. Email reveals the existing form, focuses its address field and keeps password visibility, error recovery, signup and validated return destinations. Configured GitHub sign-in remains available under More sign-in options. The small-screen chooser retains a cropped art banner.

Dark appearance uses a forest-black canvas, raised evergreen surfaces, cool readable text, mint actions and restrained amber reference labels. API documentation separates reading, navigation and code surfaces. The stored appearance is applied before hydration. Each artwork has a real dark sibling rather than a CSS brightness filter.

Workspace buttons, selectors, tabs and navigation share press compression and spring return. Report cards stay still. Reduced-motion preferences remove the transforms and transitions. The login panel reveal is adapted from the [transitions-dev skill](/Users/rachpradhan/.codex/skills/transitions-dev/SKILL.md), `07-panel-reveal.md`; its original CSS is retained in `src/components/ui/login-panel-motion.css` with scoped login overrides. Shared workspace motion is in `src/components/ui/press-motion.css`.

The setup preview now says Example · saved public results and Who AI recommended, labels the average position, and explicitly distinguishes public examples from the visitor’s own website. Actual records and values are unchanged.

## Generated artwork

Created with the built-in imagegen tool, inspected locally and encoded as WebP with cwebp. These assets are decorative, with no measurement or evidence claims. Dark editions preserve the referenced composition.

### Light sign-in arch

- Mode: generation, built-in imagegen.
- Saved asset: `public/images/folio-login-arch.webp`.
- Prompt: Use case: stylized-concept. Asset type: portrait artwork for Folio's sign-in page. Primary request: an extremely sparse, elegant editorial paper sculpture landscape, quietly playful and welcoming, in the same cream, forest-green and burnt-orange Bauhaus/desert mood as Folio. A single dark forest-green folded ribbon curves up into a soft rounded arch, suggesting an open doorway; a small matte orange sun peeks through the opening. One low flowing dune or paper fold in the foreground, warm ivory negative space above and around. Tactile uncoated paper, soft natural studio shadows, subtle sand grain, refined sculptural depth, premium art-book print, calm cinematic light. Portrait 4:5 composition; large simple silhouettes, generous empty space, no clutter. No text, no letters, no logos, no UI, no people, no chart, no collage, no glossy plastic. Restrained warm cream background, deep forest green and one muted orange accent. Finished artwork only, not a mockup of a web page.

### Dark sign-in arch

- Mode: edit of the light arch, built-in imagegen.
- Saved asset: `public/images/folio-login-arch-dark.webp`.
- Prompt: Create a dark-mode edition of the reference login artwork. Preserve the exact folded ribbon arch, the small round sun peeking through the doorway, the low dune folds, portrait composition, matte paper texture and generous negative space. Change only palette and lighting: deep forest-black midnight background, sculptural softly rim-lit sage/forest arch distinguishable from the backdrop, subdued warm amber sun, low bronze edges on the dunes. Elegant quiet night atmosphere with readable silhouettes and soft natural shadows, not neon, no stars, no text, no logos, no UI, no extra objects. Keep the same refined sparse Bauhaus paper-art style.

### Dark landing poster

- Mode: edit of the existing landing poster, built-in imagegen.
- Saved asset: `public/images/folio-dune-hero-dark.webp`.
- Prompt: Make a dark-mode night edition of this exact minimalist dune poster. Preserve the dune silhouette, tiny round sun position, large empty sky, portrait composition and paper texture. Replace the cream sky with deep forest-black, give the dune face a subdued amber/bronze light and its shadow a rich dark evergreen, keep the sun warm amber with no halo. Crisp readable sculptural shapes, quiet cinematic night mood. No new objects, text, stars, gradients as UI, logos or watermark. This is artwork only.

### Dark workspace horizon

- Mode: edit of the existing workspace horizon, built-in imagegen.
- Saved asset: `public/images/folio-workspace-horizon-dark.webp`.
- Prompt: Make a dark-mode night version of this exact panoramic sparse paper dune landscape. Preserve the wide 3:1 composition, low single dune at the bottom, thin ochre ridge and small sun near the right. Replace the ivory sky with deep forest-black, use rich dark evergreen dune shadows and a restrained bronze ridge, soft rim lighting so silhouettes remain clear. The sun is muted warm amber with no glow. Tactile matte paper, elegant cinematic stillness. No text, stars, extra objects, logos, or UI.


## Runtime

Upgraded the checked-in Next.js pin and Bun lockfile from 15.5.25 to 16.4.5. The installed version's type generator updates the automatic JSX runtime, route type imports and development type inclusion. `next dev` adds its version-matched documentation block to AGENTS.md. The dev origin allowlist adds only the IPv4 loopback hostname used by browser verification. The plain `bun run cf:build` succeeds on 16.4.5 with the existing OpenNext 1.20.6 adapter; no unsupported-version flag is needed.

## Verification

The local CI result is failing; see `LOCAL-CI-2026-11-08.md` for exact results and remaining failures. Typecheck, 320 unit tests and both builds pass. The separate 10-case desktop/mobile login/artwork/motion scope passed. The full browser run and default parallel D1 run did not pass. No merge, push or deployment was performed.

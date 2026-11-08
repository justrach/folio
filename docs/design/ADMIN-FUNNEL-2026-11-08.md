# Admin funnel and navigation polish

8 November 2026. Local implementation and preview; not a production deployment record.

## Reference and implementation

Reference: [Arc UI funnel chart](https://uiarc.dev/components/funnel-chart). Its public documentation describes a tapered band, ordered conversion stages and keyboard inspection. The component is marked Pro and its source/install instructions are locked. Folio's `product-funnel.tsx` is an original React/SVG implementation; no Arc Pro source was retrieved, copied or represented as installed. Existing licensed Arc Action Button files and attribution remain intact.

The analytical job is ordered session conversion. React owns a single small SVG instance and its stage controls; no additional renderer or chart package was added. Band thickness is linear in the stage's count relative to the first stage. Direct labels carry counts and percentages without hover. Selecting a stage highlights its column and updates a reading panel; arrow keys and Home/End select stages. A data table provides the same counts and rates.

Below 560 pixels of container width the chart becomes stacked stage controls with proportional bars, preserving labels and touch targets. Reduced motion removes hover compression and highlight transitions. No animated particles suggest real-time traffic, and no device split is invented from data that does not record devices.

Three selectable journeys are defined in `src/lib/product-funnels.ts`:

- Website research: product-only check request → successful check return → evaluation request → completed report view → evidence request. Optional evaluations mean this is one possible journey, not compulsory setup.
- Content demo: draft opened → draft saved → caption export requested. Only `content_demo` events qualify.
- Repair requests: repair requested → successful browser bundle preparation. Product and demo sessions never complete each other's stages.

Each session/surface counts at most once per stage, in observed timestamp order. Zero denominators remain unmeasured. A missing later event is not confirmed abandonment or failure. Artifact preparation is not proof of download, publishing or applied repair. Existing retention, partial-history and operator-access caveats still apply.

Journey selection and demo inclusion persist in the URL. Changing chart controls or revisiting analytics starts no provider work. Public sample fixtures remain separate from recorded events. Time-dependent sample events are generated after hydration so server/client clocks do not produce mismatched HTML.

## Layout fixes

The compact sidebar now removes the expanded submenu's margin, padding and left border. Nested icons use the same rail bounds as primary navigation. The mobile drawer retains its expanded navigation and is checked after its opening transition settles.

The local sandbox notice is a small disclosure with details and demo links, rather than a long fixed strip. Its source notice stays visible. The admin heading has a quiet decorative illustration; the funnel has the primary reading space and feature usage follows below it.

## Generated art

Mode: built-in `image_gen`, transparent output. Final project asset: `public/images/admin/observation-path-v1.webp` (800 × 410, approximately 32 KB). The selected generated PNG was optimized into this WebP without altering its composition; the original remains in the Codex generated-images directory. No existing asset was overwritten. The transparent ivory/sage object reads on both cream and dark forest backgrounds; it is decorative, has empty alt text and represents no measured data. It is omitted on narrow screens to prioritize the chart.

Final prompt:

> Use case: stylized-concept. Asset type: a small decorative editorial illustration for Folio's private admin analytics header, displayed next to text, not a data visualization. Primary request: an exquisite sparse sculptural arrangement that suggests bringing scattered observations into a clear path: three softly curved strips of matte ivory and pale sage paper/ceramic come together into a single folded architectural channel, with one small burnt-orange ceramic sphere resting near its edge. Minimal Bauhaus-inspired art direction consistent with an existing cream/forest-green editorial website and an earlier minimalist dune-and-orange-sun moodboard. Single compact object group, generous transparent margin, three-quarter view, subtle paper grain, tactile rounded edges, gentle ambient occlusion confined to the object. Quiet premium studio lighting, restrained ivory/sage/terracotta palette, ivory edge highlights so the object reads on both cream and dark forest-green backgrounds. Landscape composition. Genuinely transparent background. No text, no letters, no digits, no charts, no UI mockup, no labels, no logos, no background scenery, no extra spheres, no watermark.

## Validation

Pure tests cover ordered journey counts, separation of product/demo events, failed preparation, and zero-denominator rates. Browser checks cover keyboard selection, direct counts, chart-table parity, journey persistence, mobile layout, overflow, light/dark appearance, absence of hydration errors and compact-navigation bounds. The isolated local collector preview records actual demonstration clicks; these include automated walkthroughs and are not production customers.

# Social workspace and revenue globe

Local UI concepts, 8 November 2026. These are hypothetical marketer workflows,
not Manus interviews or connected account results.

## One-page marketer loop

1. Read views, reactions and comments for a selected channel/time window.
2. Select a previous sample post to inspect its caption and engagement.
3. Create the suggested post directly in the same-page studio.
4. Supply a topic to the simulated Audience, Writer and Reviewer agents; use the
   writer’s angle in the caption editor.
5. Edit, preview, save for this visit or export the caption with its sample label.

The six authored posts and three agent-role templates live in `social-demo.ts`.
Aggregates and bars derive from those posts. Views are post views, not unique
people. Historical metrics never increase because someone saves a draft. No
account connection, publishing, scheduled post, persistent shared draft, model
call or real analytics import is implemented by this mock. Manus technical HTML
readiness (85/100 in a saved Nov7 capture) remains a separate bounded observation.
The old abstract brief-download tasks and fictional Moss story have been removed.

User needs exposed: prioritize a concrete post, explain the reason for that choice,
retain editable work while brainstorming, distinguish views from people, preserve
claim provenance, and make account connection/publishing status visible.

## Actual website-check workflow

The navigation shows Workspace, Websites, Website checks and Content demo.
Other tools remain in a disclosure, automatically open on a specialist route.
Website checks opens the page-check view explicitly. Saved checks, launch and
findings remain on that page. References, optional crawl and saved SEO input sit
under Advanced options. Prepared context reopens the options it needs. Starting
work still requires the existing explicit action, authenticated ownership,
availability and spend guards. A website that lacks access is not silently enabled.

## Arc source

Actual free Action Button source and motion tokens were copied from the public
Arc registry, with the MIT license and copyright notice intact. Folio supplies
scoped theme variables rather than changing the upstream state/motion behavior.
Its action result refers to local save/export, not actual publishing.

- https://uiarc.dev/r/action-button.json
- https://uiarc.dev/r/arc-motion-tokens.json
- https://uiarc.dev/license

The revenue globe is an independent implementation based on the public preview
and behavior description at https://uiarc.dev/components/blocks/revenue-globe.
That block’s source requires Pro access; none is extracted or included here.

## Globe technical contract

One lazy-loaded Canvas2D instance draws 14,000 precomputed spherical points and
payment arcs. Canvas owns geometry and hit testing; HTML owns headings, totals,
controls, selected-city text and the accessible data table. SVG/DOM would add many
thousands of nodes for dots without improving the labelled controls. DPR is capped
at 2 (roughly 9MB maximum backing store at this layout). No WebGL or new runtime
package is required. The RAF loop pauses offscreen/when hidden; reduced motion
stops drift/replay, with on-demand redraw for selection, resize and theme changes.

Coordinates are coarse schematic city centers. Land dots are derived offline
from Natural Earth 110m land polygons (public domain), not a boundary/territory
claim: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson
Source rights: https://www.naturalearthdata.com/about/terms-of-use/

A deterministic illustrative minute ledger for 40 cities supplies totals, regional
forecast progress, last-hour figures, table values and histogram. The fixed sample
clock is Nov8 at16:42UTC; Sample now is not a live processor connection. Each arc
represents sample payment activity, not a one-to-one rendering of every payment.
Geography does not imply Manus customers, revenue or social audience locations.

Drag/tap uses canvas-local CSS coordinates, pointer capture and nearest visible
city testing. Keyboard arrows rotate; city rows provide a non-drag alternative.
Timeline arrows move five minutes (Shift: one hour), PageUp/Down an hour, Home
midnight, End sample-now. Touch controls wrap at narrow widths; the table remains
available without hovering. Selection and replay are transient and reset on reload.

## Model validation status

Two bounded design/ideation calls to `humansand/ampersand-v0.1` through Vercel
Gateway completed after the user changed the gateway privacy settings. The second
call successfully used the replacement key and returned three post ideas. Usage
reported zero cost for each call. Only public context and hypothetical UI needs
were sent. No private website records, account analytics or real Manus performance
were submitted.

The first review contained unsupported claims about completed website fixes and
internal prototypes; those captions were rejected. The follow-up constrained
feature/performance claims. Its curated caption bank and reviewer notes are in
`ampersand-social-ideas.json`, with model/date provenance. A minor copy edit removes
an unnecessary meta-disclaimer from one X caption. Three topic presets load these
pre-generated ideas into simulated agent roles, and custom topics use local
templates. No browser button invokes a live model or spends credits.

Earlier attempts were rejected first by ZDR and then by a separate prompt-training
restriction. Those failures are not successful model validation. Keys, raw provider
responses and usage records stay ignored under `.local`; no key is in shipped UI.

## Validation and demo delivery

The broader isolated Linux run passed 360 unit tests, typecheck, 112 desktop/mobile
browser checks, Cloudflare/OpenNext build, frontend dry run and frontend runtime
smoke. Subsequent focused checks cover the pre-generated Ampersand ideas and a
public demo that can render while account loading is pending. Private routes keep
the account-loading guard. The shell permits its existing appearance/navigation
preference attributes to differ during hydration because the preference layer
owns them.

The refreshed 1080p walkthrough runs at 1.5× speed. The 60fps output is transcoded
from browser capture, rather than a native 60fps capture. Captures, raw responses,
recordings and CI logs remain private ignored artifacts. These changes are local
review work, not a production deployment or live social/provider integration.

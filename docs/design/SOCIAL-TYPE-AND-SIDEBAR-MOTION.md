# Social demo typography and navigation motion

8 November 2026. Impeccable refinement of `/overview?view=demo` plus the owner's requested sidebar, dark-surface and landing-control adjustments.

## Reading and hierarchy

The incumbent DM Sans family is retained. The social demo uses a stable 28px page heading (26px on narrow screens), 20–22px section headings, 14–16px reading text and a 12px metadata floor. Previous 9–11px microcopy and independently scaled headings made the screen harder to scan; these were identified by source/render inspection even though the mechanical type scan returned no findings.

Three repeated metric cards are now one compact strip with one shared sample/date note. The next post and its caption lead. The suggestion's explanation and the selected post's full text open on demand. The duplicate brainstorm invitation is removed; its single entry remains beside the draft action. Other sample demos remain available through a footer disclosure. Simulated activity, pre-generated ideas and unconnected accounts remain explicitly labelled. No live agent, publishing or analytics integration was added.

## Sidebar and SVG control

The sidebar and content offset share a 240ms linear resize, tuned from the Transitions.dev Card resize pattern. CSS drives the resize without a per-frame React update. Navigation labels fade and move a few pixels; their fixed line boxes avoid wrapping during resize. Motion starts on deliberate toggles rather than preference hydration, supports mid-transition reversal, and is disabled under reduced motion.

The owner clarified that the **toggle button**, not the sidebar logo, should become “folio.”. Its six SVG contours morph into the existing DM Sans wordmark. Static matched outlines were derived locally from the already-used DM Sans font; the browser loads no additional font or image. The existing Motion dependency interpolates the paths and reverses from current values. The button keeps its accessible navigation name, pressed state and descriptive title.

A headless browser sampled synchronized sidebar/content positions throughout the transition with no observed mismatch. That environment sampled around 60Hz; it does not establish 120fps on a user's device. CSS follows the browser's presentation rate, and actual high-refresh performance depends on the hardware and page workload.

## Surface consistency

Dark workspace panel, ranking-container and select borders are subdued or transparent while focused controls retain visible rings. The Bencho search field retains its floating label and focus behavior; its fill is on the containing box so it cannot cover the label. Landing CTAs use the same rounded, softly raised press treatment, keeping their existing navigation targets.

## Validation

Typecheck and 31 focused desktop/mobile social-workflow, analytics and sidebar checks passed, with one desktop-only animation case skipped on mobile. Separate landing and dashboard regression checks passed. Tests cover interrupted toggles, persisted state, reduced motion, mobile close, draft edit/save/export, pre-generated brainstorming and no paid provider writes. Light/dark desktop and narrow layouts were rendered without horizontal overflow. Source type scans returned no findings.

The direct live Impeccable URL scan timed out on the development server. A separate static copy of the hydrated DOM, with scripts removed but rendered content and styles preserved, passed the mechanical DOM scan with no findings; it is an audit artifact, not the interactive preview. Private preview data and captured artifacts stay ignored. No production deployment is established by this pass.

The desktop sidebar’s original wordmark is hidden because the animated toggle supplies that identity. The toggle now occupies the original brand slot at the top-left of the sidebar, outside the breadcrumb. Its layout slot stays reserved so navigation does not jump. The mobile drawer retains its wordmark because its header toggle is hidden. Desktop and mobile navigation regressions cover this single-wordmark behavior.

The owner rejected a pronounced content fade after trying it. Final behavior keeps the content fully visible and uses a short linear sidebar/content resize and SVG morph. There is no frozen reading width or fade-out timer in the shipped source.

Account-footer refinement: desktop profile metadata reserves two single-line rows and a constant footer height. Expanding the rail reveals the labels with a delayed 100ms linear opacity transition; closing hides them promptly. The avatar stays visible, text truncates instead of wrapping into the rail, and reduced motion removes the transition. The sidebar-motion browser regression checks fixed height and nonwrapping labels during the transition.

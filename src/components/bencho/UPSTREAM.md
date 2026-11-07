# Bencho Card Swap

Source: https://github.com/cabralorenzo/bencho/tree/c65992417427bb09e661674ffa800bef29adef49/blocks/card-swap

Demo: https://bencho.dev/blocks/card-swap

Copyright 2026 Lorenzo Cabra. MIT license retained in `LICENSE`.

`card-swap/CardSwap.tsx` and `CardSwap.css` are copied from the actual upstream component. The slot transforms, perspective, paint ordering, drag rubber band, velocity/distance thresholds, window pointer listeners and optional timer are upstream behavior.

Folio adds a Next.js client boundary, configurable card data/content, an imperative Next handle, swap notification, keyboard activation and focus transfer. The landing supplies its three workflow steps, maps colors/type to Folio, and disables autoplay. Reduced-motion behavior is applied by the landing stylesheet. Bencho's demo photographs are not included.

## Label Input

`label-input/LabelInput.tsx` and `LabelInput.css` are copied from the same upstream revision. Folio adds controlled values/callbacks, generalized search labels with explicit accessible names, fluid measured width, configurable height and autofocus. The upstream SVG notch, lifted label and focus animation are retained. Colors use Folio tokens; reduced motion removes the animation.

## Stacked Bars

`stacked-bars/StackedBars.tsx` and `StackedBars.css` are copied from the same upstream revision. Folio removes the seeded demonstration generator and the unrelated bounce/escalation series. The component takes only supplied published-observation bins and model labels; the window ends at the latest recorded observation, not today's date. Zero-count segments have no positive minimum height. Responsive width, a static initial plot, button-group semantics and a separate accessible daily data table are added. The upstream pointer scrubber, spring-following tooltip and day/week switching remain. The existing `motion` package supplies the same Motion exports instead of adding `framer-motion`.

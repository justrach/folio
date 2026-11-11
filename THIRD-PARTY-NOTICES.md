# Third-party UI components

## Spectrum UI

`src/components/ui/spectrum-data-table.tsx` adapts the column/value contract, stable blank-last sorting and pagination patterns from [Spectrum UI DataTable](https://github.com/arihantcodes/spectrum-ui/blob/main/components/spectrumui/data-table.tsx), by Arihant and contributors, accessed 13 September 2026.

Licensed under [Apache License 2.0](LICENSES/spectrum-ui.txt). Folio retains a focused table subset with native controls, Lucide icons, explicit unavailable states and its existing cream/green styling. Selection, clipboard actions, deletion, resizing and animation were omitted. These modifications are Folio's, not upstream behavior.

## MCP Apps page

The Folio MCP App page (`ui://folio/workspace.html`, built from `src/mcp-app/` into `src/lib/folio-app.generated.ts` and served to MCP hosts) inlines the prebundled `app-with-deps` entry of [`@modelcontextprotocol/ext-apps`](https://github.com/modelcontextprotocol/ext-apps) 1.7.5 (MIT, per its package metadata). That bundle carries its own copies of:

- the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk): MIT for earlier contributions, Apache-2.0 for newer ones; see [its license](LICENSES/modelcontextprotocol-sdk.txt);
- [Zod](https://github.com/colinhacks/zod): MIT, Copyright (c) 2025 Colin McDonnell; see [its license](LICENSES/zod.txt).

The bundle's code is unmodified; Folio's own page code and styles are in `src/mcp-app/`.

## Rare UI

Existing vendored Rare UI components retain their attribution and [license](LICENSES/rare-ui.txt).

## Annual Report Archive

[Annual Report Archive](https://annualreport.gallery/) was consulted through its public MCP for visual references. Historical cover artwork is not bundled into Folio; Folio's report illustration and geometric styling remain original interface elements.

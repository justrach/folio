import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { RecordedRanking } from "../../src/components/recorded-ranking";
import type { PublicSearchObservation, PublicSearchQuery } from "../../src/lib/public-search-rankings";

// Run outside Playwright's component JSX transform. Input is a synthetic test fixture only.
const input = JSON.parse(readFileSync(0, "utf8")) as { query: PublicSearchQuery; observation: PublicSearchObservation };
process.stdout.write(renderToStaticMarkup(createElement(RecordedRanking, input)));

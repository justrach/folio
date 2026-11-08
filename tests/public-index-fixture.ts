import { buildPublicDashboard } from "../src/lib/public-dashboard";
import { PUBLIC_SEARCH_RANKINGS, PUBLIC_SEARCH_PROGRESS } from "../src/lib/public-search-rankings";
export const publicIndexFixture = buildPublicDashboard(PUBLIC_SEARCH_RANKINGS, PUBLIC_SEARCH_PROGRESS);

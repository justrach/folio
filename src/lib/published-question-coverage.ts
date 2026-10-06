import artifact from "@/data/public-question-coverage.json";
import { PUBLIC_SEARCH_RANKINGS } from "./public-search-rankings";
import { assertPublicQuestionCoverage, type PublicQuestionCoverage } from "./public-question-coverage";

// Only reviewed public projections live here. Prepared plans and private captures never enter the browser.
assertPublicQuestionCoverage(artifact, PUBLIC_SEARCH_RANKINGS);
export const PUBLIC_QUESTION_COVERAGE: PublicQuestionCoverage = artifact;

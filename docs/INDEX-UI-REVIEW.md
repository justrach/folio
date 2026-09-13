# Index UI review — 13 September 2026

The Index uses one view selector for recorded search recommendations, the public HTML directory, published audits, and the illustrative sample. The nested second selector, decorative volume label, large editorial headline, and private activity overlay were removed from this page.

The page now has a compact heading, a direct link to evaluations, and category/question controls above the evidence. The full question wraps on mobile because a native select can truncate long text. Desktop keeps the selected question in its control. Observation details sit behind a native disclosure; recommendation positions, website names and source links remain visible.

Positions retain the order returned for that exact question. A named comparison question and an unprompted discovery question have different meanings; this interface does not turn either into a Google ranking or combine them with HTML scores. Unrecorded questions retain an explicit empty state and a link to the user's evaluations.

Validation used desktop and mobile browser fixtures: 10 directory cases, four public ranking-control cases, six compact/populated/empty layout cases, and six affected shell/navigation cases passed. TypeScript passed. Populated layout cases render the actual recommendation component with explicitly synthetic test data, including missing URLs/citations and an empty completed observation. They do not replace the public artifact or establish a live collection result. The first synthetic render attempt encountered Playwright's JSX transform; running that renderer through Node/tsx resolved the harness issue.

The preceding hosted check passed 200 browser cases and failed the same activity-polling case on desktop and mobile. React Strict Mode briefly started a read that was then cancelled during effect replay. The initial read now waits one microtask and checks that its owner and effect are still active. Four focused activity cases passed with deterministic time, retaining exact refresh counts, logout clearing, and the prohibition on new-work requests. The hosted check must run again for this revision.

No provider request, GitHub authentication change, publication, or deployment was performed as part of this UI review. Live collection is a separate operation.

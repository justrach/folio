# Saved visibility and recommendations

Create a **read** Folio API key at `/docs/api` while signed in. Use that key from any HTTP client; no SDK or provider credentials are required. These endpoints read private records belonging to the key owner. They never submit a model task or SEO lookup.

```sh
export FOLIO_BASE_URL=http://localhost:3001
# Set FOLIO_API_KEY in your shell's secret environment.
curl "$FOLIO_BASE_URL/api/v1/sites" \
  -H "Authorization: Bearer $FOLIO_API_KEY"

# Set WEBSITE_ID to an ID returned above.
curl --get "$FOLIO_BASE_URL/api/v1/visibility/overview" \
  -H "Authorization: Bearer $FOLIO_API_KEY" \
  --data-urlencode "websiteId=$WEBSITE_ID"
```

| GET endpoint | Result |
| --- | --- |
| `/api/v1/visibility/current` | Target appearance percentage, share of voice, average returned position and measured question counts |
| `/api/v1/visibility/overview` | Current metrics, daily samples, observed competitors, model list, citations, prompts and recommendations |
| `/api/v1/visibility/citations` | Cited URLs, number of answers citing each URL, supporting run IDs |
| `/api/v1/visibility/prompts` | Per-question position, target citation status, ordered recommendations and source links; `suiteId` groups questions |
| `/api/v1/visibility/recommendations` | Suggested content/documentation changes with the saved question and run supporting each suggestion |

Every endpoint requires `websiteId`. Optional `startDate` and `endDate` are inclusive UTC calendar dates (`YYYY-MM-DD`). Optional `model` matches the saved model exactly. `platform=openai` is the only supported platform; these are managed OpenAI API search observations, not measurements of the consumer ChatGPT website. Only open-web observations are included.

Citations support `sourceType=all|owned|external` and `limit=1–200` (default 50). Owned means the same normalized hostname as the saved website; it does not establish verified domain ownership. Unknown/repeated filters return 400. Authentication errors return 401; a website outside the key owner's account returns 404. Keys retain their existing expiry, revocation and 60-request/minute limit.

## How to read the numbers

The latest completed answer per question within the selected date window is used. A newer unsuccessful attempt does not replace an earlier completed answer. The newest **100 matching attempts** are loaded; `coverage.truncated` indicates additional history. Website matching uses the saved exact target URL. Empty results remain unmeasured.

- `visibilityScore`: percentage of answers listing the target among answers with known target identity. Unknown identities are counted and excluded from this denominator.
- `shareOfVoice`: target domain appearances divided by all identified domain appearances, counting a domain at most once in each answer.
- `averagePosition`: mean first target position among answers listing it. Absence is not converted to a fabricated last position.
- Citation counts count distinct answers citing each exact URL, not repeated links within one answer.
- Daily samples use the same calculation for that day's answers. Questions and execution settings can vary, so this is not a controlled trend or causal improvement measurement. Use the model filter and inspect per-prompt provenance.

Positions reflect the order in a saved answer, not universal search rank. Recommendations are deterministic suggestions based on missing mentions or citations. Review the supporting answer before making changes; no improvement is guaranteed. Technical audit scores, backlinks and Search Console metrics stay separate.

To explicitly request a fresh observation, use the existing `/api/v1/observations/ensure` contract with an evaluate-scoped key and an idempotency key. Its default freshness is 24 hours. Unresolved spending holds still apply. None of the visibility endpoints calls it automatically.

The browser workspace overview shows recommendations from its loaded saved answers. The public benchmark dashboard remains a separately published dataset; private API responses are not automatically published.

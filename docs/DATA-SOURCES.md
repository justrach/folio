# Where Folio's numbers come from, and how they compare with Ahrefs and Similarweb

Research date: 11 November 2026. Competitor statements below come from each company's own documentation, linked in the footnotes. Folio's sources come from the code (`src/lib/website-gaps.ts`) and the production data checked on that date.

## The short answer

**For traffic and backlink numbers, Folio is not more accurate than Ahrefs, and we shouldn't say it is.**
- Folio buys these numbers from DataForSEO.
- DataForSEO estimates search visits the same way Ahrefs does: for each search a website ranks for, the monthly searches multiplied by the share of clicks expected at its position, summed.[^dfs-etv][^ahrefs-traffic]
- DataForSEO's backlink counts come from its own crawler; Ahrefs runs its own.[^dfs-backlinks]
- Nothing we have measured shows DataForSEO's estimates beating Ahrefs's, or the reverse.

**Where Folio is more trustworthy is in how it handles those numbers:**

1. **Google's own count beside the estimate.**
   - When the owner imports Google Search Console, the website report shows Google's own click count next to the third-party estimate and says how far apart they are.
   - Ahrefs reports that across 1,635 websites its traffic estimates differed from Google Search Console by a median of 49.5%, and by more than 1,000% for some websites. Its suggested fix is to compare your own Search Console numbers with its estimate and adjust.[^ahrefs-study] Folio does that comparison for each website automatically.
   - Folio's own data shows why it matters. For `codegraff.com`, Search Console counted 149 clicks in the 28 days to 10 September 2026, about 160 a month across all countries. DataForSEO's saved estimate from 17 September was 0.16 visits a month from US searches. Some of that gap is non-US clicks, but not a thousandfold.
2. **Every number says what it is.**
   - Each figure in the report is labelled Google's own count, Estimate, Third-party record or Recorded by Folio, with its provider and date (`sources` in `folio_website_gaps`).
   - The report names third-party sources by kind, not by vendor: `Search data provider` for positions, searches a month and visits, `Link data provider` for links. See [How the report names providers](#how-the-report-names-providers).
   - Missing data stays "not measured", never zero, and unknowns are listed apart from findings.
3. **AI answers can be checked.**
   - Folio's AI-answer numbers count answers it recorded itself, saving each full answer with its citations, model and date. Anyone can open the answer behind a number.
   - This is about being able to check the numbers, not about coverage: Ahrefs Brand Radar tracks AI answers on a much larger scale.[^ahrefs-brand-radar] Folio has 291 published answers.

**Where Ahrefs and Similarweb are stronger:**
- Coverage and history: Ahrefs's keyword and link indexes, and years of history per website.
- Total traffic across every channel. Similarweb models direct, referral, social and app traffic as well as search, from a contributory panel, first-party analytics that sites share with it, data partners and public data.[^similarweb-method] Folio has no estimate of non-search traffic at all.

## Number by number

| Number in the report | Folio's source | Kind | How Ahrefs gets it | How Similarweb gets it |
| --- | --- | --- | --- | --- |
| Clicks from Google | The owner's Google Search Console (`search_console_reports`), 28 days, all countries and, from 11 November 2026, US only | Google's own count | Not this number: Ahrefs shows estimates and tells users to expect differences from Search Console[^ahrefs-traffic] | Not this number |
| Search visits a month | DataForSEO `domain_rank_overview`, US Google | Estimate | The same method, with a CTR curve per keyword modelled from clickstream data[^ahrefs-ctr] | Total visits, all channels, modelled from four data sources[^similarweb-method] |
| Searches it ranks for | DataForSEO, US Google | Estimate | Its keyword index, top 100 results per country[^ahrefs-metrics] | Not reviewed here |
| Google positions | DataForSEO's record of Google's US results (`research.rankings_latest`, captured 7 November 2026) | Third-party record | Its own record of Google results | Not reviewed here |
| Searches a month per phrase | DataForSEO | Estimate | Google Keyword Planner, Google Trends and other sources, a 12-month average; Ahrefs says only Google has exact counts[^ahrefs-volume] | Not reviewed here |
| Links and linking websites | DataForSEO's own crawler[^dfs-backlinks] | Third-party record | Its own crawler | Not a backlink tool |
| AI answers | Folio, recorded answers with citations | Recorded by Folio | Brand Radar: a pre-collected index plus custom prompts[^ahrefs-brand-radar] | Not reviewed here |
| Pages read | Folio's own crawler, against the website's sitemaps | Recorded by Folio | Site Audit crawls | Not reviewed here |

"Not reviewed here" means we did not check, not that the product lacks it.

## How the report names providers

Since 12 November 2026 the **Where these numbers come from** panel (on `/websites` and in the MCP App) and the `sources` returned by `folio_website_gaps` no longer name the vendor. The table above keeps naming DataForSEO as internal reference.

- `provider` is `Search data provider` (`google_positions`, `search_volumes`, `visits_estimate`) or `Link data provider` (`backlinks`). The details say "a third-party provider's" record, estimate or crawl. The Search Console comparison labels the estimate `Search data provider, US` with its date.
- Each card says "provider", singular, because each of those numbers comes from one external provider today. The panel's opening line says "third-party data providers", plural, as the category the search and link numbers belong to.
- The opening line reads: "Folio combines third-party data providers with its own index of AI answers and crawled pages." "Combines" means the report brings the providers' numbers and Folio's own index together in one place. Each number still comes from one source, and no number is blended, weighted or corrected against another. The Search Console block is a comparison: it sets Google's clicks beside the estimate and changes neither.
- `provider` values in saved SEO reports, the privacy page and the paid-lookup permissions still name DataForSEO.

## What to say when someone asks "why is your data better than Ahrefs or Similarweb?"

- "Our search and backlink numbers come from DataForSEO. They're estimates made the same way as Ahrefs's, so we won't claim they're more accurate."
- "What we add is Google's own numbers beside the estimate. Connect Search Console and every website shows how far off the estimate is. Ahrefs's own study puts the typical gap at about half."
- "Every number is labelled with where it came from and when, and anything we haven't measured says so instead of showing zero."
- "Our AI-answer numbers are answers we recorded ourselves. You can open each one and read what the AI said and which pages it cited."
- "Ahrefs has far bigger keyword and link indexes, and Similarweb covers traffic beyond search. If you need those, use them; Folio reads its sources from DataForSEO, Google and its own records."

## What would make Folio's numbers measurably better

- **Correct competitor estimates with the owner's own ratio.** This is Ahrefs's suggested method[^ahrefs-study]: Google's clicks divided by the estimate for your own website, applied to competitors in the same market. Folio now stores that ratio per website (`googleCheck.ratio`) but does not apply it yet.
- **Measure the estimates across many websites.** One website is an example, not a study. With more owners importing Search Console, Folio could publish its own deviation figure, as Ahrefs did.
- **Compare like with like.** Imports since 11 November 2026 record US clicks separately (`unitedStatesTotals`), so the comparison is US with US. Older snapshots only have all-country totals, and the report says so.

[^ahrefs-traffic]: Ahrefs, [What is Organic Traffic in Ahrefs and how do we calculate it?](https://help.ahrefs.com/en/articles/1863206-what-is-organic-traffic-in-ahrefs-and-how-do-we-calculate-it)
[^ahrefs-ctr]: Ahrefs, [How does Ahrefs estimate CTR when calculating search traffic?](https://help.ahrefs.com/en/articles/1077709-how-does-ahrefs-estimate-ctr-when-calculating-search-traffic)
[^ahrefs-study]: Ahrefs, [How Accurate Are the Search Traffic Estimations in Ahrefs?](https://ahrefs.com/blog/traffic-estimations-accuracy/) (May 2022): median deviation 49.52% across 1,635 websites, Pearson correlation 0.76 with Search Console; Semrush's median deviation on the same sample was 68.36%.
[^ahrefs-volume]: Ahrefs, [How accurate is keyword search volume in Ahrefs?](https://help.ahrefs.com/en/articles/72571-how-accurate-is-keyword-search-volume-in-ahrefs)
[^ahrefs-metrics]: Ahrefs Academy, [Keyword and search traffic metrics](https://ahrefs.com/academy/how-to-use-ahrefs/ahrefs-seo-metrics/keyword-and-search-traffic)
[^ahrefs-brand-radar]: Ahrefs, [Brand Radar](https://ahrefs.com/brand-radar); see also [research-seo.md](research-seo.md).
[^similarweb-method]: Similarweb, [Similarweb Data Methodology](https://support.similarweb.com/hc/en-us/articles/360001631538-Similarweb-Data-Methodology): direct measurement (first-party analytics such as Google Analytics that websites share), a contributory network of consumer products, partnerships (including internet service providers), and public data extraction, blended by machine-learning models.
[^dfs-etv]: DataForSEO, [Domain Rank Overview](https://docs.dataforseo.com/v3/dataforseo_labs/google/domain_rank_overview/live/): `etv` is "estimated organic monthly traffic to the domain calculated as the product of CTR (click-through-rate) and search volume values of all keywords the domain ranks for".
[^dfs-backlinks]: DataForSEO, [Backlinks Summary](https://docs.dataforseo.com/v3/backlinks/summary/live/): `first_seen` is the date "when our crawler found the backlink for the target for the first time".

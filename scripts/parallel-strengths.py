"""Fetch public excerpts for the developer-tools directory via Parallel Extract.

Operator script: reads the checked-in catalog, writes only extracted public page
excerpts under the ignored .local/ directory. No credentials are written here.

    PARALLEL_API_KEY=... python3 scripts/parallel-strengths.py
"""
import json, os, time, urllib.request, urllib.error

KEY = os.environ["PARALLEL_API_KEY"]
OUT = ".local/folio-strengths"
os.makedirs(OUT, exist_ok=True)

tools = json.load(open("src/data/developer-tools.json"))
pairs = []
for tool in tools:
    for kind, url in (("site", tool.get("websiteUrl")), ("docs", tool.get("docsUrl"))):
        if isinstance(url, str) and url.startswith("http"):
            pairs.append({"id": tool["id"], "name": tool["name"], "kind": kind, "url": url})

print(f"{len(pairs)} urls across {len(tools)} products", flush=True)
OBJECTIVE = (
    "Describe what this page does exceptionally well for a prospective user: "
    "product clarity, differentiation, documentation and learning path, onboarding, "
    "and trust signals. Prefer concrete, quotable specifics over generic praise."
)

written = 0
for start in range(0, len(pairs), 18):
    batch = pairs[start:start + 18]
    body = json.dumps({
        "urls": [item["url"] for item in batch],
        "objective": OBJECTIVE,
        "advanced_settings": {"excerpt_settings": {"max_chars_per_result": 900}},
    }).encode()
    request = urllib.request.Request(
        "https://api.parallel.ai/v1/extract",
        data=body,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        method="POST",
    )
    payload = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                payload = json.load(response)
            break
        except urllib.error.HTTPError as error:
            print(f"batch {start}: HTTP {error.code} {error.read()[:200]!r}", flush=True)
            if error.code in (429, 500, 502, 503):
                time.sleep(5 * (attempt + 1))
                continue
            break
        except Exception as error:  # noqa: BLE001 - report and continue
            print(f"batch {start}: {type(error).__name__}", flush=True)
            time.sleep(5 * (attempt + 1))
    if not payload:
        continue
    for item in batch:
        item["excerpts"] = next(
            (r.get("excerpts") for r in payload.get("results", []) if r.get("url") == item["url"]),
            [],
        )
    errors = payload.get("errors") or []
    with open(f"{OUT}/batch-{start:03d}.json", "w") as handle:
        json.dump({"items": batch, "errors": errors, "usage": payload.get("usage")}, handle, indent=1)
    written += len(batch)
    print(f"batch {start}: {len(batch)} urls, {len(errors)} errors", flush=True)

print(f"wrote {written} urls", flush=True)

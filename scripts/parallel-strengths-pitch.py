"""Second, sharper Extract pass: core pitch + concrete proof per product homepage.

    PARALLEL_API_KEY=... python3 scripts/parallel-strengths-pitch.py
"""
import json, os, time, urllib.request, urllib.error

KEY = os.environ["PARALLEL_API_KEY"]
OUT = ".local/folio-strengths"
os.makedirs(OUT, exist_ok=True)

tools = json.load(open("src/data/developer-tools.json"))
items = [
    {"id": t["id"], "name": t["name"], "category": t["category"], "url": t["websiteUrl"]}
    for t in tools if isinstance(t.get("websiteUrl"), str)
]
OBJECTIVE = (
    "Extract this company's core promise, the specific capability it claims others lack, "
    "and any concrete proof it offers (numbers, benchmarks, guarantees, customer names, "
    "free tier, migration credit). Quote the site's own words."
)

for start in range(0, len(items), 12):
    batch = items[start:start + 12]
    body = json.dumps({
        "urls": [item["url"] for item in batch],
        "objective": OBJECTIVE,
        "advanced_settings": {"excerpt_settings": {"max_chars_per_result": 1800}},
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
            print(f"batch {start}: HTTP {error.code}", flush=True)
            if error.code in (429, 500, 502, 503):
                time.sleep(5 * (attempt + 1))
                continue
            break
        except Exception as error:  # noqa: BLE001
            print(f"batch {start}: {type(error).__name__}", flush=True)
            time.sleep(5 * (attempt + 1))
    if not payload:
        continue
    for item in batch:
        item["excerpts"] = next(
            (r.get("excerpts") for r in payload.get("results", []) if r.get("url") == item["url"]),
            [],
        )
    with open(f"{OUT}/pitch-{start:03d}.json", "w") as handle:
        json.dump({"items": batch, "errors": payload.get("errors") or []}, handle, indent=1)
    print(f"pitch batch {start}: {len(batch)} urls, {len(payload.get('errors') or [])} errors", flush=True)

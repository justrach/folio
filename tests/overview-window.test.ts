import test from "node:test";
import assert from "node:assert/strict";
import { ALL_LOADED, byteSize, csvCell, dailySeries, exportFilename, formatBytes, inWindow, toCsv, windowBounds, windowLabel } from "../src/lib/overview-window";

const now = Date.parse("2026-11-06T15:00:00Z");

test("presets are inclusive UTC day windows ending today", () => {
  assert.deepEqual(windowBounds(ALL_LOADED, now), { from: null, to: null });
  assert.deepEqual(windowBounds({ preset: "7", from: null, to: null }, now), { from: "2026-10-31", to: "2026-11-06" });
  assert.deepEqual(windowBounds({ preset: "30", from: null, to: null }, now), { from: "2026-10-08", to: "2026-11-06" });
});

test("custom windows validate days and swap reversed ranges", () => {
  assert.deepEqual(windowBounds({ preset: "custom", from: "2026-11-05", to: "2026-10-01" }, now), { from: "2026-10-01", to: "2026-11-05" });
  assert.deepEqual(windowBounds({ preset: "custom", from: "bad", to: "2026-10-01" }, now), { from: null, to: "2026-10-01" });
});

test("inWindow compares UTC days and rejects invalid dates", () => {
  const bounds = { from: "2026-10-31", to: "2026-11-06" };
  assert.equal(inWindow("2026-10-31T00:00:00Z", bounds), true);
  assert.equal(inWindow("2026-10-30T23:59:59Z", bounds), false);
  assert.equal(inWindow("nope", bounds), false);
  assert.equal(inWindow("2020-01-01T00:00:00Z", { from: null, to: null }), true);
});

test("labels describe the window honestly", () => {
  const f = (d: string) => d;
  assert.equal(windowLabel({ from: null, to: null }, f), "All loaded history");
  assert.equal(windowLabel({ from: "a", to: "b" }, f), "a – b");
  assert.equal(windowLabel({ from: "a", to: null }, f), "From a");
});

test("daily series starts at the first loaded attempt and marks the window", () => {
  assert.deepEqual(dailySeries([], { from: null, to: null }, now), []);
  const series = dailySeries([
    { createdAt: "2026-11-04T01:00:00Z", status: "completed" }, { createdAt: "2026-11-04T02:00:00Z", status: "failed" },
    { createdAt: "2026-11-06T02:00:00Z", status: "completed" }, { createdAt: "2026-12-01T00:00:00Z", status: "completed" },
  ], { from: "2026-11-05", to: "2026-11-06" }, now);
  assert.deepEqual(series.map(p => [p.day, p.total, p.completed, p.other, p.selected]), [
    ["2026-11-04", 2, 1, 1, false], ["2026-11-05", 0, 0, 0, true], ["2026-11-06", 1, 1, 0, true],
  ]);
});

test("CSV cells are quoted and spreadsheet formulas are neutralised", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("+1"), "\"'+1\"");
  assert.equal(csvCell("-2"), "\"'-2\"");
  assert.equal(csvCell("@cmd"), "\"'@cmd\"");
  assert.equal(csvCell("a,b"), "\"a,b\"");
  assert.equal(csvCell(72), "72");
  assert.equal(csvCell(null), "");
  assert.equal(toCsv(["a", "b"], [["x", 1]]), "a,b\r\nx,1\r\n");
});

test("byte sizes and filenames reflect real content and scope", () => {
  assert.equal(byteSize("é"), 2);
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(exportFilename("Example.dev", "questions", { from: null, to: null }, "2026-11-06"), "folio-example.dev-questions-all-loaded_2026-11-06.csv");
  assert.equal(exportFilename("a b/c", "audits", { from: "2026-10-01", to: "2026-11-06" }, "x"), "folio-a-b-c-audits-2026-10-01_2026-11-06.csv");
});

test("invalid calendar days cannot become custom window bounds", () => {
  assert.deepEqual(windowBounds({preset:"custom",from:"2026-02-30",to:"2026-02-28"},Date.parse("2026-11-06T00:00:00Z")),{from:null,to:"2026-02-28"});
});

test("CSV formula prefixes remain text after leading whitespace and controls", () => {
  for(const value of [" =1+1","\n=1+1","\uFEFF@SUM(1)"]){assert.ok(csvCell(value).startsWith('"\''));}
});

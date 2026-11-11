import { expect, test, type Page } from "@playwright/test";
import { websiteQuestionDrafts } from "../src/lib/website-question-drafts";

/**
 * The hand-drawn onboarding against a mocked API. The walk renders every step (1 to 8) and checks the
 * drawn trail, the decorative scenes, that no icon-set or CSS-ring mark is left, that reduced motion
 * shows every drawing complete, the paid-action sentences word for word, "Save and exit", narrow
 * and mid-width layouts, and that only the walk's own writes are made. A second case turns motion on.
 * Nothing here can start paid work: "Start baseline" is never pressed, a POST that would start a
 * baseline run is refused and counted, and every API call is answered by the fixture.
 */
const at = "2026-09-13T08:00:00.000Z";
const audience = "small design teams", task = "collect feedback on prototypes";
const STEPS = ["Website", "Report", "Account", "Customers", "Questions", "Competitors", "Baseline"];
const PAID = {
  website: "Free. Folio reads one public page and changes nothing on your site.",
  drafts: "Drafts come from your words. No AI call and no cost.",
  save: "Saving starts no search. You choose when to run.",
  credits: "Uses evaluation credits. You can cancel while it runs.",
  disabled: "Nothing runs and nothing is charged until runs are enabled.",
  queue: "One question runs at a time while Folio is open. Cancel any run from Evaluations.",
};
const check = {
  id: "fixture-check", url: "https://example.test/", host: "example.test", createdAt: at, seoScore: 72, scoredChecks: 12,
  fixes: [
    { id: "meta", label: "Add a meta description", points: 0, maxPoints: 15, gap: 15, detail: "Search results show a short summary." },
    { id: "schema", label: "Describe the page in structured data", points: 4, maxPoints: 12, gap: 8, detail: "" },
  ],
  suggestion: { audience, task },
  competitors: { category: "Design tools", questions: 2, totalAnswers: 6, rows: [
    { name: "Fixture Company", domain: "fixture.example.test", aliases: [], aliasCounts: [], answers: 4, totalAnswers: 6, averagePosition: 1.5, isTarget: false, namedInQuestion: 0 },
    { name: "Example", domain: "example.test", aliases: [], aliasCounts: [], answers: 2, totalAnswers: 6, averagePosition: 3, isTarget: true, namedInQuestion: 0 },
  ] },
};
// Existing baseline runs for step 8: one saved, one running, one failed; the other questions wait.
const runs = [
  { id: "run-saved", caseId: "case-0", status: "completed", createdAt: at },
  { id: "run-live", caseId: "case-1", status: "running", createdAt: "2026-09-13T08:01:00.000Z" },
  { id: "run-failed", caseId: "case-2", status: "failed", createdAt: "2026-09-13T08:02:00.000Z" },
];

async function fixture(page: Page, baseURL: string) {
  const state = { signedIn: false, canRun: false, competitorsSaved: false, baselineRequested: false, failCheck: false,
    suite: null as null | { id: string; cases: { id: string; query: string }[] },
    writes: [] as { method: string; path: string; body: unknown }[], reconciles: [] as string[], runStarts: 0,
    unexpected: [] as string[], external: [] as string[], errors: [] as string[] };
  page.on("pageerror", error => state.errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method(), path = url.pathname;
    if (url.origin !== new URL(baseURL).origin) { state.external.push(url.origin); return route.abort("blockedbyclient"); }
    if (!path.startsWith("/api/")) return route.continue();
    // Reconciling an existing run reads remote work; it never starts one.
    const reconcile = path.match(/^\/api\/benchmarks\/runs\/([^/]+)\/reconcile$/);
    if (method === "POST" && reconcile) {
      state.reconciles.push(reconcile[1]);
      return route.fulfill({ json: { run: runs.find(run => run.id === reconcile[1]) } });
    }
    if (method === "POST" && path === "/api/benchmarks/runs") {
      state.runStarts++;
      return route.fulfill({ status: 409, json: { error: "Starting a run is forbidden in this fixture." } });
    }
    if (method !== "GET") {
      // Every write this flow makes carries a JSON object. Anything else is recorded as unexpected, with a readable reason,
      // rather than throwing inside the route handler.
      let body: Record<string, unknown>;
      try {
        const parsed: unknown = request.postDataJSON();
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not a JSON object");
        body = parsed as Record<string, unknown>;
      } catch (failure) {
        state.unexpected.push(`${method} ${path} with a body that is not a JSON object (${failure instanceof Error ? failure.message : String(failure)}): ${String(request.postData()).slice(0, 80)}`);
        return route.fulfill({ status: 400, json: { error: "The fixture expected a JSON object body." } });
      }
      state.writes.push({ method, path, body });
      if (path === "/api/onboarding/check" && method === "POST") {
        if (state.failCheck) {
          await new Promise(resolve => setTimeout(resolve, 1200));
          return route.fulfill({ status: 502, json: { error: "Fixture: the page could not be read." } });
        }
        return route.fulfill({ json: { check, siteId: null } });
      }
      if (path === "/api/onboarding" && method === "PUT") return route.fulfill({ json: {} });
      if (path === "/api/benchmarks" && method === "POST") {
        if (!Array.isArray(body.questions)) {
          state.unexpected.push(`${method} ${path} without a questions list`);
          return route.fulfill({ status: 400, json: { error: "The fixture expected a questions list." } });
        }
        state.suite = { id: "fixture-suite", cases: (body.questions as string[]).map((query, index) => ({ id: `case-${index}`, query })) };
        return route.fulfill({ json: { suite: state.suite } });
      }
      if (path === "/api/competitors" && method === "PUT") { state.competitorsSaved = true; return route.fulfill({ json: { competitors: body.competitors } }); }
      state.unexpected.push(`${method} ${path}`);
      return route.fulfill({ status: 409, json: { error: "No other writes are allowed in this fixture." } });
    }
    if (path === "/api/auth/get-session") return route.fulfill({ json: state.signedIn ? {
      user: { id: "drawn-owner", name: "Fixture owner", email: "owner@example.test", emailVerified: true, createdAt: at, updatedAt: at },
      session: { id: "drawn-session", userId: "drawn-owner", token: "non-secret-fixture", expiresAt: "2099-01-01T00:00:00Z", createdAt: at, updatedAt: at },
    } : null });
    if (path === "/api/onboarding") return route.fulfill({ json: {
      state: { siteId: "fixture-site", audience, customerGroups: [audience], task, suiteId: state.suite?.id ?? null,
        competitorsSavedAt: state.competitorsSaved ? at : null, baselineRequestedAt: state.baselineRequested ? at : null, completedAt: null },
      site: { id: "fixture-site", url: "https://example.test/", name: "Example" }, check, suite: state.suite, competitors: [],
    } });
    if (path === "/api/search-console" || path === "/api/github") return route.fulfill({ json: { configured: false, connected: false } });
    // The site-wide analytics switch is read on every page (CI opts out in storage instead); answer it as off.
    if (path === "/api/analytics/config") return route.fulfill({ json: { enabled: false } });
    if (path === "/api/benchmarks/runs") return route.fulfill({ json: { runs } });
    if (path === "/api/benchmarks") return route.fulfill({ json: { access: state.canRun
      ? { canRun: true, message: "Fixture: runs are enabled, but this test never starts one." }
      : { canRun: false, message: "Fixture only: runs are disabled." } } });
    state.unexpected.push(`GET ${path}`);
    return route.fulfill({ status: 404, json: {} });
  });
  return state;
}

/** HTML in the setup page that reaches past either side of the viewport (the page clips, so scrollWidth would not show it). */
function clipped(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [], width = document.documentElement.clientWidth;
    const outside = (box: DOMRect) => box.width > 0 && (box.left < -1 || box.right > width + 1);
    for (const node of document.querySelectorAll(".ob *")) {
      if (node instanceof SVGElement || node.closest(".ob-question-scroll, .ob-vh")) continue;
      if (outside(node.getBoundingClientRect())) out.push(`${node.tagName.toLowerCase()}.${node.getAttribute("class") ?? ""}`);
    }
    // The heading's underlined words and their drawn underline, which may not wrap.
    for (const node of document.querySelectorAll(".ob h1 .ink-underlined, .ob h1 .sk-underline"))
      if (outside(node.getBoundingClientRect())) out.push(`heading mark ${node.textContent || "underline"}`);
    return out;
  });
}

/** The drawn trail, the step's scene, no icon or ring marks, finished drawings, "Save and exit", and no overflow. */
async function inspect(page: Page, step: number, back: string[], options: { mobile: boolean; exit: boolean }) {
  const { mobile, exit } = options;
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeFocused();

  // The trail stays a navigation list: seven steps, one current (none on the optional step 8), and buttons only for steps a person may return to.
  const trail = page.locator('nav[aria-label="Setup steps"]');
  await expect(trail.locator("ol > li")).toHaveCount(7);
  await expect(trail.locator('li[aria-current="step"]')).toHaveCount(step <= 7 ? 1 : 0);
  if (step <= 7) await expect(trail.locator('li[aria-current="step"]')).toContainText(STEPS[step - 1]);
  expect(await trail.locator("button").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label")))).toEqual(back.map(label => `Back to ${label}`));
  await expect(trail.locator("li.done .ob-flag")).toHaveCount(Math.min(step, 8) - 1);
  const progress = page.getByRole("progressbar", { name: "Setup progress" });
  if (mobile) {
    await expect(trail).toBeHidden();
    await expect(progress).toHaveAttribute("aria-valuenow", String(Math.min(step, 7)));
    await expect(page.locator(".ob-progress")).toContainText(step <= 7 ? `Step ${step} of 7` : "Optional");
  } else {
    const nav = page.getByRole("navigation", { name: "Setup steps" });
    await expect(nav.getByRole("listitem")).toHaveCount(7);
    for (const label of back) await expect(nav.getByRole("button", { name: `Back to ${label}`, exact: true })).toBeVisible();
  }

  // "Save and exit" is offered once signed in, from step 4 to 7, on phones too; it is never pressed here.
  const save = page.getByRole("button", { name: "Save and exit", exact: true });
  if (exit) {
    await expect(save).toHaveCount(1);
    await expect(save).toBeVisible();
    await expect(save).toBeInViewport({ ratio: 1 });
  } else await expect(save).toHaveCount(0);

  // One decorative drawing for this step.
  const scene = page.locator(".ob-scene");
  await expect(scene).toHaveCount(1);
  await expect(scene).toHaveAttribute("aria-hidden", "true");
  await expect(scene).toHaveAttribute("data-scene", String(step));
  await expect(scene.locator("svg path.sk-ink").first()).toBeAttached();

  // No icon-set glyphs, CSS ring mark or raster art remain in the setup page.
  const leftovers = await page.locator(".ob").evaluate(root => ({
    icons: root.querySelectorAll("svg.folio-icon, svg.lucide, [class*='lucide']").length,
    rings: root.querySelectorAll(".ob-mark, .ob-mark i, .folio-mark i").length,
    raster: root.querySelectorAll("img.workspace-empty-art, img.theme-art-light, img.theme-art-dark").length,
    marks: root.querySelectorAll(".ob-wordmark svg.sk-mark").length,
  }));
  expect(leftovers).toEqual({ icons: 0, rings: 0, raster: 0, marks: 1 });

  // Reduced motion (the project default) shows every drawing complete: no running animation,
  // no hidden or half-drawn stroke in the visible frame.
  const unfinished = await page.locator(".ob").evaluate(root => {
    const shown = (node: Element) => { for (let at: Element | null = node; at && at !== root; at = at.parentElement) {
      const style = getComputedStyle(at); if (style.display === "none" || style.visibility === "hidden") return false; } return true; };
    return Array.from(root.querySelectorAll<SVGPathElement>(".ob-scene path, .ob-top path, .ob-copy path, .ob-side path")).filter(shown).flatMap(path => {
      // Faded means hidden by the drawing itself (the path or a group inside its SVG), not a disabled button around it.
      const svg = path.ownerSVGElement, style = getComputedStyle(path), faded = (() => { for (let at: Element | null = path; at && at !== svg?.parentElement; at = at.parentElement) if (getComputedStyle(at).opacity !== "1") return true; return false; })();
      const box = path.closest(".ob-box"), unchecked = box && !(box.previousElementSibling as HTMLInputElement | null)?.checked;
      if (unchecked && path.classList.contains("ob-inkbox-tick")) return [];
      if (path.classList.contains("ob-inkbox-fill") && unchecked) return [];
      if (path.classList.contains("ob-meter-reading")) return [];
      // The trail ahead of the walker is not inked yet; that is its state, not an unfinished drawing.
      if (path.classList.contains("ob-leg-ink") && path.closest("li.next")) return [];
      const offset = parseFloat(style.strokeDashoffset || "0");
      return style.animationName !== "none" || faded || (style.strokeDasharray !== "none" && offset !== 0) ? [path.getAttribute("class") ?? "path"] : [];
    });
  });
  expect(unfinished).toEqual([]);

  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(await clipped(page)).toEqual([]);

  const original = page.viewportSize()!;
  if (mobile) {
    // The narrowest phone the style audit checks: nothing, including the underlined heading words, may be cut off.
    await page.setViewportSize({ width: 320, height: 780 });
    await expect.poll(() => clipped(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.setViewportSize(original);
  } else if (exit) {
    // The narrowest width that shows the full trail: it, the wordmark and "Save and exit" fit without touching.
    await page.setViewportSize({ width: 1240, height: 1000 });
    await expect(save).toBeInViewport({ ratio: 1 });
    const boxes = await page.evaluate(() => [".ob-wordmark", ".ob-steps", ".ob-exit"].map(selector => document.querySelector(selector)!.getBoundingClientRect().toJSON() as DOMRect));
    const [mark, steps, exitBox] = boxes;
    expect(steps.width).toBeGreaterThan(0);
    expect(mark.right).toBeLessThan(steps.left);
    expect(steps.right + 8).toBeLessThanOrEqual(exitBox.left);
    expect(exitBox.right).toBeLessThanOrEqual(1240);
    expect(await clipped(page)).toEqual([]);
    await page.setViewportSize(original);
  }
}

/** Where the score meter's ink is painted to, read from the rendered pixels, and where the measured value puts it (CSS pixels). */
async function meterEnd(page: Page, score: number) {
  const meter = page.locator(".ob-side .ob-meter-ink");
  const png = (await meter.screenshot({ scale: "css", animations: "disabled" })).toString("base64");
  return meter.evaluate(async (svg, { png, score }) => {
    // The value ink's colour is the accent token, read beside the meter (a score of 0 has no value path to read it from).
    const probe = document.createElement("span");
    probe.style.color = "var(--folio-accent)";
    svg.parentElement!.append(probe);
    const [r, g, b] = getComputedStyle(probe).color.match(/\d+/g)!.map(Number);
    probe.remove();
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    let painted = -1;
    for (let y = Math.floor(image.height * 0.3); y <= Math.ceil(image.height * 0.7); y++)
      for (let x = 0; x < image.width; x++) {
        const at = (y * image.width + x) * 4;
        if (Math.hypot(data[at] - r, data[at + 1] - g, data[at + 2] - b) < 70) painted = Math.max(painted, x + 1);
      }
    const value = svg.querySelector(".ob-meter-value"), track = (svg.querySelector("path") as SVGPathElement).getBBox();
    return { painted, expected: image.width * (4 + 392 * score / 100) / 400, trackEnd: image.width * (track.x + track.width) / 400,
      cap: value ? getComputedStyle(value).strokeLinecap : null, valuePaths: svg.querySelectorAll(".ob-meter-value, .ob-meter-end").length };
  }, { png, score });
}

test("the drawn onboarding walks steps 1 to 8 with its trail, scenes, paid-action sentences and only the expected writes", async ({ page, baseURL }, info) => {
  test.setTimeout(150_000);
  const mobile = info.project.name === "mobile";
  expect(page.viewportSize()!.width).toBe(mobile ? 393 : 1440);
  const state = await fixture(page, baseURL!);

  await page.goto("/start");
  await expect(page.getByRole("heading", { name: "Start with your website.", exact: true })).toBeVisible();
  await expect(page.getByText(PAID.website, { exact: true })).toBeVisible();
  await inspect(page, 1, [], { mobile, exit: false });
  await page.getByLabel("Website address").fill("example.test");
  await page.getByRole("button", { name: "Check my page", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Your page scores 72 out of 100.", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "72 out of 100" })).toBeVisible();
  await inspect(page, 2, ["Website"], { mobile, exit: false });
  // The meter's ink ends at exactly the measured score: by its geometry, and by the pixels actually painted.
  const meter = await page.locator(".ob-side .ob-meter-value").evaluate(path => {
    const line = path as SVGPathElement, box = line.getBBox(), view = (line.ownerSVGElement as SVGSVGElement).viewBox.baseVal;
    return (box.x + box.width - 4) / (view.width - 8) * 100;
  });
  expect(meter).toBeCloseTo(72, 0);
  const end = await meterEnd(page, 72);
  expect(end.cap).toBe("butt");
  expect(Math.abs(end.painted - end.expected)).toBeLessThanOrEqual(1.2);
  expect(state.writes.map(write => `${write.method} ${write.path}`)).toEqual(["POST /api/onboarding/check"]);

  await page.getByRole("button", { name: "Save this report", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Keep this report and track it over time.", exact: true })).toBeVisible();
  await inspect(page, 3, ["Website", "Report"], { mobile, exit: false });
  await expect(page.getByRole("button", { name: "Create account with email", exact: true })).toBeVisible();

  state.signedIn = true;
  await page.goto("/start?step=4");
  await expect(page.getByRole("heading", { name: "Who should find you, and what do they need?", exact: true })).toBeVisible();
  await expect(page.getByText(PAID.drafts, { exact: true })).toBeVisible();
  await inspect(page, 4, [], { mobile, exit: true });
  await page.getByRole("button", { name: "Draft my questions", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Pick the questions your buyers ask.", exact: true })).toBeVisible();
  await expect(page.getByText(PAID.save, { exact: true })).toBeVisible();
  await inspect(page, 5, ["Customers"], { mobile, exit: true });
  await expect(page.getByRole("checkbox")).toHaveCount(10);
  await page.getByRole("button", { name: "Save 5 questions", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Here is who AI already recommends.", exact: true })).toBeVisible();
  await inspect(page, 6, ["Customers", "Questions"], { mobile, exit: true });
  await page.getByRole("button", { name: "Track 1 competitor", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Ask AI your 5 questions now.", exact: true })).toBeVisible();
  await expect(page.getByText("Fixture only: runs are disabled.")).toBeVisible();
  await expect(page.getByText(PAID.disabled, { exact: true })).toBeVisible();
  await inspect(page, 7, ["Customers", "Questions", "Competitors"], { mobile, exit: true });

  // Step 7 again, for an account that may run: the credits sentence is shown and "Start baseline" is offered but not pressed.
  state.canRun = true;
  await page.goto("/start?step=7");
  await expect(page.getByRole("heading", { name: "Ask AI your 5 questions now.", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start baseline", exact: true })).toBeVisible();
  await expect(page.getByText(PAID.credits, { exact: true })).toBeVisible();
  await inspect(page, 7, ["Customers", "Questions", "Competitors"], { mobile, exit: true });

  // Step 8 with a baseline already requested: existing runs are shown with their drawn marks; none is started.
  state.baselineRequested = true;
  await page.goto("/start?step=8");
  await expect(page.getByRole("heading", { name: "Add your real Google clicks.", exact: true })).toBeVisible();
  await expect(page.getByText(PAID.queue, { exact: true })).toBeVisible();
  const queue = page.getByRole("status").filter({ has: page.locator(".ob-run") });
  await expect(queue.locator(".ob-run")).toHaveCount(5);
  await expect(queue.locator(".ob-run.is-live")).toHaveCount(1);
  await expect(queue.locator(".ob-run.is-live .ob-runmark.is-live")).toHaveCount(1);
  await expect(queue.locator(".ob-run.is-done .ob-runmark.is-done")).toHaveCount(1);
  await expect(queue.locator(".ob-run.is-bad .ob-runmark.is-bad")).toHaveCount(1);
  await expect(queue.locator(".ob-run.is-waiting .ob-runmark.is-waiting")).toHaveCount(2);
  await expect(queue.locator(".ob-run.is-live .ob-state")).toHaveText("Searching");
  await inspect(page, 8, ["Customers", "Questions", "Competitors", "Baseline"], { mobile, exit: false });
  await page.screenshot({ path: info.outputPath("step-8.png"), fullPage: true });

  const questions = websiteQuestionDrafts(audience, task).slice(0, 5);
  expect(state.writes).toEqual([
    { method: "POST", path: "/api/onboarding/check", body: { url: "https://example.test" } },
    { method: "PUT", path: "/api/onboarding", body: { customerGroups: [audience], task } },
    { method: "POST", path: "/api/benchmarks", body: { name: "example.test buyer questions", websiteId: "fixture-site", questions, language: "English", locale: "United States" } },
    { method: "PUT", path: "/api/onboarding", body: { suiteId: "fixture-suite" } },
    { method: "PUT", path: "/api/competitors", body: { siteId: "fixture-site", competitors: [{ name: "Fixture Company", aliases: [], source: "public-index", domain: "fixture.example.test" }] } },
  ]);
  expect(state.runStarts).toBe(0);
  expect(new Set(state.reconciles)).toEqual(new Set(["run-live"]));
  expect(state.unexpected).toEqual([]);
  expect(state.external).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("the score meter paints no value ink at 0 and ends at the track's end at 100", async ({ page, baseURL }) => {
  for (const score of [0, 100]) {
    const tab = await page.context().newPage();
    const state = await fixture(tab, baseURL!);
    // A signed-out check restored from this tab's session, as after the step 1 request.
    await tab.addInitScript(saved => sessionStorage.setItem("folio-onboarding-v1", JSON.stringify(saved)),
      { ownerId: null, url: "example.test", check: { ...check, seoScore: score }, customerGroups: [""], task: "" });
    await tab.goto("/start?step=2");
    await expect(tab.getByRole("heading", { name: `Your page scores ${score} out of 100.`, exact: true })).toBeVisible();
    await expect(tab.getByRole("img", { name: `${score} out of 100` })).toBeVisible();
    const end = await meterEnd(tab, score);
    if (score === 0) {
      // An empty track: no value stroke, no end mark, and no accent ink anywhere in the meter.
      expect(end.valuePaths).toBe(0);
      expect(end.painted).toBe(-1);
    } else {
      expect(end.valuePaths).toBe(2);
      expect(end.cap).toBe("butt");
      expect(Math.abs(end.painted - end.expected)).toBeLessThanOrEqual(1.2);
      expect(Math.abs(end.painted - end.trackEnd)).toBeLessThanOrEqual(1.2);
    }
    expect(state.writes).toEqual([]);
    expect(state.unexpected).toEqual([]);
    expect(state.external).toEqual([]);
    expect(state.errors).toEqual([]);
    await tab.close();
  }
});

test("the step 1 preview keeps its height while the page is checked", async ({ page, baseURL }) => {
  const state = await fixture(page, baseURL!);
  state.failCheck = true;
  await page.goto("/start");
  await page.getByLabel("Website address").fill("example.test");
  const card = page.locator(".ob-live");
  await expect(card).toBeVisible();
  const height = () => card.evaluate(node => node.getBoundingClientRect().height);
  const before = await height();
  await page.getByRole("button", { name: "Check my page", exact: true }).click();
  await expect(card).toHaveAttribute("data-checking", "true");
  await expect(page.getByRole("button", { name: "Checking your page…" })).toBeVisible();
  expect(await height()).toBe(before);
  await expect(page.getByRole("alert").filter({ hasText: "Fixture: the page could not be read." })).toBeVisible();
  await expect(card).not.toHaveAttribute("data-checking", /.*/);
  expect(await height()).toBe(before);
  expect(state.writes.map(write => `${write.method} ${write.path}`)).toEqual(["POST /api/onboarding/check"]);
  expect(state.unexpected).toEqual([]);
  expect(state.external).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("with motion on, drawings finish, loops pause while typing, and a forward step plays and settles", async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const state = await fixture(page, baseURL!);
  await page.goto("/start");
  await expect(page.getByRole("heading", { name: "Start with your website.", exact: true })).toBeVisible();
  const scene = page.locator(".ob-scene");
  // Strokes in the first boil frame (the one shown complete without motion), and fills popped in after them.
  // Only drawings that are displayed: on phones the full trail is replaced by the compact one.
  const unfinished = (selector: string) => page.evaluate(selector => Array.from(document.querySelectorAll<SVGElement>(selector)).filter(node => {
    if (!node.checkVisibility()) return false;
    const style = getComputedStyle(node);
    return style.opacity !== "1" || (node.classList.contains("sk-draw") && parseFloat(style.strokeDashoffset || "0") !== 0);
  }).length, selector);
  const sceneInk = ".ob-scene .sk-frame-0 :is(.sk-draw, .sk-pop)";
  expect(await page.locator(sceneInk).count()).toBeGreaterThan(10);
  expect(await unfinished(sceneInk)).toBeGreaterThan(0);
  await expect(scene).toHaveAttribute("data-inview", "");
  await expect(scene).toHaveAttribute("data-live", "");
  await expect.poll(() => unfinished(sceneInk), { timeout: 10_000 }).toBe(0);

  // Typing pauses every loop; a moment after the last keystroke they run again.
  const playState = () => scene.evaluate(root => Array.from(root.querySelectorAll(".sk-frame, .ob-drift")).map(node => getComputedStyle(node))
    .filter(style => style.animationName !== "none").map(style => style.animationPlayState));
  expect(new Set(await playState())).toEqual(new Set(["running"]));
  const input = page.getByLabel("Website address");
  await input.focus();
  await input.pressSequentially("example.te", { delay: 60 });
  await expect(page.locator(".ob")).toHaveAttribute("data-typing", "");
  const paused = await playState();
  expect(paused.length).toBeGreaterThan(0);
  expect(new Set(paused)).toEqual(new Set(["paused"]));
  await expect.poll(() => page.locator(".ob").getAttribute("data-typing"), { timeout: 5_000 }).toBeNull();
  expect(new Set(await playState())).toEqual(new Set(["running"]));

  // A forward step: the copy and the sheet slide in from the direction of travel, then everything comes to rest.
  await input.pressSequentially("st");
  await input.press("Enter");
  await expect(page.getByRole("heading", { name: "Your page scores 72 out of 100.", exact: true })).toBeVisible();
  const entrance = await page.evaluate(() => {
    const main = document.querySelector(".ob-main")!;
    const names = (selector: string) => Array.from(main.querySelectorAll(selector)).flatMap(node => node.getAnimations().map(animation => (animation as CSSAnimation).animationName));
    return { dir: main.getAttribute("data-dir"), heading: names(":scope > .ob-copy > h1"), side: names(":scope > .ob-side") };
  });
  expect(entrance).toEqual({ dir: "forward", heading: ["ob-in-forward"], side: ["ob-in-forward-far"] });
  // The score meter is drawn on: its value stroke and end mark are dashed to the path's length and run the draw animation...
  const meterInk = () => page.locator(".ob-side .ob-meter-ink").evaluate(svg => [".ob-meter-value", ".ob-meter-end"].map(selector => {
    const node = svg.querySelector(selector)!, style = getComputedStyle(node);
    return { selector, dash: style.strokeDasharray, offset: parseFloat(style.strokeDashoffset), opacity: style.opacity,
      animations: node.getAnimations().map(animation => ({ name: (animation as CSSAnimation).animationName, state: animation.playState })) };
  }));
  const arrived = await meterInk();
  for (const ink of arrived) {
    expect(ink.dash, ink.selector).not.toBe("none");
    expect(ink.animations.map(animation => animation.name), ink.selector).toEqual(["ob-draw-plain"]);
  }
  // ...and both finish fully drawn: no dash gap left, visible, and the animation done.
  await expect.poll(async () => (await meterInk()).map(ink => ({ selector: ink.selector, offset: ink.offset, opacity: ink.opacity, running: ink.animations.some(animation => animation.state === "running") })), { timeout: 10_000 })
    .toEqual([{ selector: ".ob-meter-value", offset: 0, opacity: "1", running: false }, { selector: ".ob-meter-end", offset: 0, opacity: "1", running: false }]);
  await expect.poll(() => page.evaluate(() => {
    const moving: string[] = [];
    for (const node of [document.querySelector(".ob-main")!, ...document.querySelectorAll(".ob-main *")]) {
      if (node instanceof SVGElement) continue;
      const transform = getComputedStyle(node).transform;
      if (transform !== "none" && transform !== "matrix(1, 0, 0, 1, 0, 0)") moving.push(`${node.className} ${transform}`);
      for (const animation of node.getAnimations()) if (animation.playState === "running") moving.push(`${node.className} running`);
    }
    return moving;
  }), { timeout: 10_000 }).toEqual([]);
  await expect(page.locator(".ob-side .ob-score b")).toHaveText("72");
  await expect.poll(() => unfinished(".ob-scene .sk-frame-0 :is(.sk-draw, .sk-pop), .ob-top .ob-flag :is(.sk-draw, .sk-pop)"), { timeout: 10_000 }).toBe(0);
  expect(state.writes.map(write => `${write.method} ${write.path}`)).toEqual(["POST /api/onboarding/check"]);
  expect(state.unexpected).toEqual([]);
  expect(state.external).toEqual([]);
  expect(state.errors).toEqual([]);
});

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  fs.mkdirSync("tests/output", { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || chromium.executablePath(),
    headless: true,
    args: ["--no-sandbox"],
  });
  const passed = [],
    errors = [];
  const check = (n, c = true) => {
    assert.ok(c, n);
    passed.push(n);
    console.log("PASS", n);
  };
  const base = process.env.TEST_URL || "http://127.0.0.1:8765/";
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await p.goto(base);
  await p.locator("h1").waitFor();
  for (const [width, height] of [
    [320, 844],
    [375, 812],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1440, 900],
    [1920, 1080],
  ]) {
    await p.setViewportSize({ width, height });
    for (const view of [
      "dashboard",
      "tasks",
      "focus",
      "calendar",
      "analytics",
      "settings",
    ]) {
      await p.goto(base + "#" + view);
      await p.locator("h1").waitFor();
      await p.evaluate(() => document.fonts.ready);
      check(
        "No overflow " + width + "x" + height + " " + view,
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    if (width === 320) {
      await p
        .getByRole("button", { name: "Новая задача", exact: true })
        .click();
      check(
        "320px task dialog contained",
        await p.locator("#task-dialog").evaluate((e) => {
          const b = e.getBoundingClientRect();
          return b.left >= 0 && b.right <= innerWidth;
        }),
      );
      await p.keyboard.press("Escape");
    }
  }
  await p.setViewportSize({ width: 1440, height: 900 });
  for (const view of [
    "dashboard",
    "tasks",
    "focus",
    "calendar",
    "analytics",
    "settings",
  ]) {
    await p.goto(base + "#" + view);
    await p.locator("h1").waitFor();
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(550);
    await p.screenshot({
      path:
        "screenshots/" +
        (view === "dashboard" ? "desktop" : view) +
        "-1440.png",
      fullPage: true,
    });
  }
  await p.setViewportSize({ width: 1920, height: 1080 });
  await p.goto(base);
  await p.waitForTimeout(600);
  await p.screenshot({ path: "screenshots/desktop-1920.png", fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.screenshot({ path: "screenshots/mobile-390.png", fullPage: true });
  await p.screenshot({ path: "screenshots/mobile-viewport.png" });
  await p.goto(base + "#focus");
  await p.waitForTimeout(500);
  await p.screenshot({ path: "screenshots/mobile-focus.png", fullPage: true });
  await p.goto(base + "#settings");
  await p.locator("[data-action=set-theme][data-theme=dark]").click();
  await p.goto(base + "#dashboard");
  await p.waitForTimeout(500);
  await p.screenshot({ path: "screenshots/dark-mobile.png", fullPage: true });
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.screenshot({ path: "screenshots/dark-desktop.png", fullPage: true });
  check(
    "Dark theme screenshot and contrast state",
    (await p.locator("html").getAttribute("data-theme")) === "dark",
  );
  // Persisted overdue deadlines: simulates a sleeping/closed tab, without relying on setInterval frequency.
  await p.evaluate(async () => {
    const m = await import("./js/store.js");
    m.update((s) => {
      s.timer = {
        id: crypto.randomUUID(),
        mode: "work",
        running: true,
        total: 60,
        remaining: 60000,
        deadline: Date.now() - 500,
        taskId: null,
      };
    });
  });
  await p.reload();
  let s = await p.evaluate(() =>
    JSON.parse(localStorage.getItem("focus-flow.v1")),
  );
  check(
    "Overdue deadline reconciled on reload",
    s.sessions.length === 1 && !s.timer.running,
  );
  await p.reload();
  s = await p.evaluate(() => JSON.parse(localStorage.getItem("focus-flow.v1")));
  check("Reload cannot record session twice", s.sessions.length === 1);
  const p2 = await ctx.newPage();
  await p2.goto(base);
  await p2.locator("h1").waitFor();
  await p.evaluate(async () => {
    const m = await import("./js/store.js");
    m.update((s) => (s.settings.name = "Синхронизация"));
  });
  await p2.waitForFunction(
    () =>
      document.querySelector("#profile-name").textContent === "Синхронизация",
  );
  check("Cross-tab storage synchronization");
  const invalid = await p.evaluate(async () => {
    const m = await import("./js/store.js");
    const good = structuredClone(m.getState()),
      cases = [];
    let r = structuredClone(good);
    r.version = 99;
    cases.push(r);
    r = structuredClone(good);
    r.tasks[0].category = "__proto__";
    cases.push(r);
    r = structuredClone(good);
    r.tasks.push({ ...r.tasks[0] });
    cases.push(r);
    r = structuredClone(good);
    r.settings.work = NaN;
    cases.push(r);
    return cases.map((r) => {
      try {
        m.validate(r);
        return false;
      } catch {
        return true;
      }
    });
  });
  check(
    "Schema rejects unknown version, prototype keys, duplicate IDs and NaN",
    invalid.every(Boolean),
  );
  for (const zone of [
    "Europe/Berlin",
    "America/Los_Angeles",
    "Pacific/Kiritimati",
  ]) {
    const c = await browser.newContext({ timezoneId: zone });
    const tab = await c.newPage();
    await tab.goto(base);
    await tab.locator("h1").waitFor();
    const correct = await tab.evaluate(async () => {
      const m = await import("./js/store.js"),
        d = new Date();
      return (
        m.today() ===
          [
            d.getFullYear(),
            String(d.getMonth() + 1).padStart(2, "0"),
            String(d.getDate()).padStart(2, "0"),
          ].join("-") &&
        m.shiftDate("2026-03-29", 1) === "2026-03-30" &&
        m.shiftDate("2026-10-25", 1) === "2026-10-26"
      );
    });
    check("Local dates and DST " + zone, correct);
    await c.close();
  }
  const blocked = await browser.newContext();
  await blocked.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("Quota reached", "QuotaExceededError");
    };
  });
  const tab = await blocked.newPage();
  await tab.goto(base + "#tasks");
  await tab.locator("h1").waitFor();
  check(
    "Storage failure is visibly reported",
    await tab.locator("#storage-warning").isVisible(),
  );
  await tab.getByRole("button", { name: "Новая задача", exact: true }).click();
  await tab.locator("#task-form [name=title]").fill("Сохранено в памяти");
  await tab.locator("#task-form button[type=submit]").click();
  check(
    "Storage failure retains in-memory edits",
    await tab
      .getByRole("button", { name: "Сохранено в памяти", exact: true })
      .isVisible(),
  );
  await blocked.close();
  check("No console errors in quality matrix", errors.length === 0);
  fs.writeFileSync(
    "tests/output/quality-results.json",
    JSON.stringify({ passed, errors }, null, 2),
  );
  await browser.close();
  console.log("TOTAL", passed.length, "passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

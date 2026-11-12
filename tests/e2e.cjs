/** Development-only QA. App has no Node or build dependency. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  fs.mkdirSync("tests/output", { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || chromium.executablePath(),
    headless: true,
    args: ["--no-sandbox"],
    downloadsPath: process.cwd() + "/tests/output/downloads",
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [],
    passed = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const check = (name, condition = true) => {
    assert.ok(condition, name);
    passed.push(name);
    console.log("PASS", name);
  };
  const go = async (view) => {
    await page.goto("http://127.0.0.1:8765/#" + view);
    await page.locator("h1").waitFor();
  };
  const state = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("focus-flow.v1")));
  const confirm = () => page.locator("#confirm-ok").click();
  await go("tasks");
  check(
    "First launch creates six clearly marked demo tasks",
    (await state()).tasks.length === 6,
  );
  await page.getByRole("button", { name: "Новая задача", exact: true }).click();
  await page.locator("#task-form [name=title]").fill("   ");
  await page.locator("#task-form button[type=submit]").click();
  check(
    "Whitespace title validation",
    (await page.locator("#task-error").innerText()) ===
      "Добавьте название задачи.",
  );
  await page.locator("[data-action=close-task]").last().click();
  await go("settings");
  await page.locator("[data-action=clear-demo]").click();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  check(
    "Destructive cancel preserves demos",
    (await state()).tasks.length === 6,
  );
  await page.locator("[data-action=clear-demo]").click();
  await confirm();
  check("Demo cleanup", (await state()).tasks.length === 0);
  await go("tasks");
  const today = await page.evaluate(() => {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
  });
  const create = async (title, category = "learn", priority = "high") => {
    await page
      .getByRole("button", { name: "Новая задача", exact: true })
      .click();
    const f = page.locator("#task-form");
    await f.locator("[name=title]").fill(title);
    await f
      .locator("[name=description]")
      .fill("Описание с деталями <script>window.xss=1</script>");
    await f.locator("[name=category]").selectOption(category);
    await f.locator("[name=priority]").selectOption(priority);
    await f.locator("[name=date]").fill(today);
    await f.locator("[name=time]").fill("14:30");
    await f.locator("[name=duration]").fill("45");
    await f.locator("button[type=submit]").click();
  };
  await create('Проверить <img src=x onerror="window.xss=1">');
  let s = await state();
  check(
    "Task create stores full metadata",
    s.tasks.length === 1 &&
      s.tasks[0].description.includes("<script>") &&
      s.tasks[0].duration === 45 &&
      s.tasks[0].time === "14:30",
  );
  check(
    "User text is escaped",
    (await page.locator(".task-title img").count()) === 0 &&
      (await page.evaluate(() => !window.xss)),
  );
  await page.reload();
  check("Task survives reload", (await state()).tasks.length === 1);
  await page.locator(".task-title").click();
  await page.locator("#task-form [name=title]").fill("Главная задача");
  await page.locator("#task-form [name=priority]").selectOption("medium");
  await page.locator("#task-form button[type=submit]").click();
  check(
    "Task edit and priority",
    (await state()).tasks[0].title === "Главная задача" &&
      (await state()).tasks[0].priority === "medium",
  );
  await create("Второе дело", "personal", "low");
  await page.locator("#task-search").fill("главная");
  check("Search", (await page.locator(".task-row").count()) === 1);
  await page.locator("#task-search").fill("");
  await page.locator("#filter-category").selectOption("health");
  check(
    "Category empty state",
    (await page.locator(".task-row").count()) === 0 &&
      (await page.locator(".empty-state").isVisible()),
  );
  await page.locator("#filter-category").selectOption("all");
  await page.locator("#filter-priority").selectOption("low");
  check("Priority filter", (await page.locator(".task-row").count()) === 1);
  await page.locator("#filter-priority").selectOption("all");
  await page.locator("#filter-sort").selectOption("priority");
  check(
    "Priority sort",
    (await page.locator(".task-title").first().innerText()) ===
      "Главная задача",
  );
  await page.locator("#filter-sort").selectOption("manual");
  await page.locator("[data-action=move-up]").nth(1).click();
  check(
    "Keyboard-accessible reordering",
    (await page.locator(".task-title").first().innerText()) === "Второе дело",
  );
  await page
    .locator(".drag-handle")
    .first()
    .dragTo(page.locator(".task-row").nth(1));
  check(
    "Drag reorder",
    (await page.locator(".task-title").first().innerText()) ===
      "Главная задача",
  );
  await page.locator("[data-action=complete]").first().click();
  check(
    "Completion timestamp",
    (await state()).tasks[0].done && (await state()).tasks[0].completedAt > 0,
  );
  await page.locator("[data-action=status][data-value=done]").click();
  check("Status filter", (await page.locator(".task-row").count()) === 1);
  await page.locator("[data-action=reset-filters]").click();
  await page.locator("[data-action=delete]").nth(1).click();
  await confirm();
  check("Task delete", (await state()).tasks.length === 1);
  await go("calendar");
  const month = await page.locator(".calendar-panel h2").innerText();
  await page.locator('[data-action=month][data-delta="1"]').click();
  check(
    "Month navigation",
    (await page.locator(".calendar-panel h2").innerText()) !== month,
  );
  await page.locator("[data-action=calendar-today]").click();
  await page.locator(".calendar-day.is-today").focus();
  await page.keyboard.press("ArrowRight");
  const selected = await page
    .locator(".calendar-day.is-selected")
    .getAttribute("data-date");
  check("Keyboard calendar navigation", selected !== today);
  await page.locator("[data-action=add-selected]").first().click();
  check(
    "Selected date carried into task form",
    (await page.locator("#task-form [name=date]").inputValue()) === selected,
  );
  await page.locator("#task-form [name=title]").fill("Задача на завтра");
  await page.locator("#task-form button[type=submit]").click();
  check(
    "Calendar agenda reflects new task",
    (await page.locator(".calendar-agenda .task-title").innerText()) ===
      "Задача на завтра",
  );
  await go("settings");
  await page.locator("#settings-form [name=name]").fill("Алекс");
  await page.locator("#settings-form [name=work]").fill("1");
  await page.locator("[data-action=set-theme][data-theme=dark]").click();
  check(
    "Theme switch preserves unsaved settings draft",
    (await page.locator("#settings-form [name=name]").inputValue()) ===
      "Алекс" &&
      (await page.locator("#settings-form [name=work]").inputValue()) === "1",
  );
  await page.locator("#settings-form [name=short]").fill("1");
  await page.locator("#settings-form [name=long]").fill("2");
  await page.locator("#settings-form button[type=submit]").click();
  await page.reload();
  check(
    "Theme and settings persist",
    (await page.locator("html").getAttribute("data-theme")) === "dark" &&
      (await state()).settings.work === 1 &&
      (await state()).settings.name === "Алекс",
  );
  await page.locator("[data-action=set-theme][data-theme=light]").click();
  await go("focus");
  await page.locator("[data-action=mode][data-mode=work]").click();
  await page
    .locator("#linked-task")
    .selectOption({ label: "Задача на завтра" });
  check(
    "Timer uses custom duration and linked task",
    (await page.locator("#timer-display").innerText()) === "01:00" &&
      Boolean((await state()).timer.taskId),
  );
  await page.clock.install();
  await page.locator("[data-action=timer-toggle]").click();
  await page.clock.fastForward(20000);
  await page.locator("[data-action=timer-toggle]").click();
  const paused = await page.locator("#timer-display").innerText();
  await page.clock.fastForward(60000);
  check(
    "Timer pause",
    (await page.locator("#timer-display").innerText()) === paused,
  );
  await page.reload();
  check(
    "Paused timer survives reload",
    (await page.locator("#timer-display").innerText()) === paused,
  );
  await page.locator("[data-action=timer-toggle]").click();
  await page.clock.fastForward(41000);
  check(
    "Deadline-based session completes once",
    (await state()).sessions.length === 1 &&
      (await state()).sessions[0].duration === 60 &&
      !(await state()).timer.running,
  );
  await page.clock.fastForward(5000);
  check("No duplicate completion", (await state()).sessions.length === 1);
  await page.locator("[data-action=mode][data-mode=short]").click();
  await page.locator("[data-action=timer-toggle]").click();
  await page.clock.fastForward(61000);
  check("Break does not count as focus", (await state()).sessions.length === 1);
  await page.locator("[data-action=mode][data-mode=long]").click();
  check(
    "Long break settings",
    (await page.locator("#timer-display").innerText()) === "02:00",
  );
  await page.locator("[data-action=timer-toggle]").click();
  await page.locator("[data-action=mode][data-mode=work]").click();
  check(
    "Running-mode switch asks confirmation",
    await page.locator("#confirm-dialog").isVisible(),
  );
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.locator("[data-action=timer-reset]").click();
  await confirm();
  check(
    "Timer reset",
    !(await state()).timer.running &&
      (await page.locator("#timer-display").innerText()) === "02:00",
  );
  await page.locator("[data-action=sound]").click();
  check("Sound toggle", (await state()).settings.sound);
  await page.locator("[data-action=sound]").click();
  await go("analytics");
  check(
    "Analytics use real completion and focus data",
    (await page.locator(".analytics-metrics strong").nth(0).innerText()) ===
      "1" &&
      (
        await page.locator(".analytics-metrics strong").nth(1).innerText()
      ).includes("1"),
  );
  await page.locator('[data-action=period][data-value="30"]').click();
  check(
    "Month analytics",
    (await page
      .locator(".chart-panel")
      .first()
      .locator(".chart-bar")
      .count()) === 30,
  );
  check(
    "Session history is linked",
    (await page.locator(".history-row b").innerText()) === "Задача на завтра",
  );
  await go("settings");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-action=export]").click();
  const download = await downloadPromise;
  await download.saveAs("tests/output/roundtrip.json");
  const exported = JSON.parse(
    fs.readFileSync("tests/output/roundtrip.json", "utf8"),
  );
  check(
    "JSON export",
    exported.version === 1 &&
      exported.tasks.length === 2 &&
      exported.sessions.length === 1,
  );
  await page.locator("#import-file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{bad"),
  });
  check(
    "Malformed JSON rejected without mutation",
    (await state()).tasks.length === 2,
  );
  const invalid = structuredClone(exported);
  invalid.tasks[0].date = "2026-02-31";
  await page.locator("#import-file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  check(
    "Invalid calendar date rejected",
    (await page.locator("#toasts").innerText()) ===
      "Некорректная дата или время." && (await state()).tasks.length === 2,
  );
  await page.locator("[data-action=reset-app]").click();
  await confirm();
  check(
    "Confirmed app reset",
    (await state()).tasks.length === 0 &&
      (await state()).sessions.length === 0 &&
      (await state()).settings.work === 25,
  );
  await page
    .locator("#import-file")
    .setInputFiles("tests/output/roundtrip.json");
  await confirm();
  check(
    "JSON import restores tasks/history/settings",
    (await state()).tasks.length === 2 &&
      (await state()).sessions.length === 1 &&
      (await state()).settings.work === 1,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobile-nav a[href="#calendar"]').click();
  check(
    "Mobile bottom navigation",
    (await page.locator("#page-label").innerText()) === "Календарь",
  );
  await page.locator("#mobile-settings").click();
  check(
    "Mobile settings entry",
    await page.locator("#settings-form").isVisible(),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  check(
    "Reduced motion path",
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  );
  await page.keyboard.press("n");
  await page.keyboard.press("Escape");
  check(
    "Keyboard shortcut and Escape dialog closure",
    !(await page.locator("#task-dialog").evaluate((n) => n.open)),
  );
  check("No browser console errors", errors.length === 0);
  fs.writeFileSync(
    "tests/output/e2e-results.json",
    JSON.stringify({ passed, errors }, null, 2),
  );
  await browser.close();
  console.log("TOTAL", passed.length, "passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

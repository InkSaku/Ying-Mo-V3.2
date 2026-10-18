import { expect, test } from "@playwright/test";

test("home is revealed by the login sheet only after real authentication", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill("editor_e2e");
  await page.getByLabel("密码", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "显示密码" }).click();
  // Delaying the real response must leave the form in charge of loading.
  let release;
  await page.route("**/api/v1/auth/login", async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => { release = resolve; });
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("button", { name: "正在登录…" })).toBeDisabled();
  await expect(page.locator(".login-page-turn")).toHaveCount(0);
  await expect.poll(() => Boolean(release)).toBe(true);
  release();
  await expect(page).toHaveURL(/\/home$/);
  const turn = page.locator(".login-page-turn");
  await expect(turn).toHaveAttribute("data-mode", "peel");
  await expect(turn).toHaveAttribute("aria-hidden", "true");
  await expect(turn.locator("input, textarea, select, [id]")).toHaveCount(0);
  expect(await turn.textContent()).not.toContain("password123");
  expect(await turn.textContent()).not.toContain("editor_e2e");
  await expect(turn.locator(".reader-book")).toBeAttached();
  await expect(page.locator(".home-spark-entry")).toHaveClass(/is-docked/);
  await expect(turn).toHaveCount(0);
  await expect(page.locator("#root")).not.toHaveAttribute("inert");
  await expect(page.locator("#root h1")).toBeFocused();
  await expect(page.locator(".home-edition-heading h1")).toContainText("朋友的");
  await page.reload();
  await expect(page.locator(".home-edition-heading h1")).toBeVisible();
  await expect(turn).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("real-home-after-turn.png"), fullPage: true });
});

test("an authentication error never puts a sheet over the form", async ({ page }) => {
  await page.route("**/api/v1/auth/login", (route) => route.fulfill({ status: 401, json: {
    ok: false, error: { code: "INVALID_CREDENTIALS", message: "用户名、邮箱或密码错误。" },
  } }));
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill("a-friend");
  await page.getByLabel("密码", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".login-page-turn")).toHaveCount(0);
  await expect(page.locator("#root")).not.toHaveAttribute("inert");
});

test("the replay shows a real diagonal fold on desktop and mobile in both themes", async ({ page }, testInfo) => {
  await page.clock.install();
  for (const theme of ["light", "dark"]) {
    await page.addInitScript((value) => localStorage.setItem("yingmo_theme", value), theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/dev/login-page-turn");
      await expect(page.getByRole("button", { name: "播放翻页", exact: true })).toBeVisible();
      await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
      await page.getByRole("button", { name: "播放翻页", exact: true }).click();
      await page.clock.runFor(410);
      const turn = page.locator(".login-page-turn");
      await expect(turn).toHaveAttribute("data-mode", "peel");
      const front = await turn.locator(".login-turn-front").evaluate((element) => getComputedStyle(element).clipPath);
      expect(front).toContain("polygon");
      const polygon = await turn.locator(".login-turn-back").getAttribute("points");
      expect(polygon.length).toBeGreaterThan(15);
      await page.screenshot({ path: testInfo.outputPath(`fold-${theme}-${width}.png`) });
      await page.clock.runFor(1000);
      await expect(turn).toHaveCount(0);
      await expect(page.getByRole("button", { name: "再看一次" })).toBeEnabled();
      await page.getByRole("button", { name: "再看一次" }).click();
      await page.clock.runFor(1000);
      await expect(turn).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      // Restore real time before the next navigation/viewport.
      await page.clock.resume();
    }
  }
});

test("resize, back navigation and a changed motion preference release the real page", async ({ page }) => {
  for (const interruption of ["resize", "popstate", "motion"]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/dev/login-page-turn");
    await page.getByRole("button", { name: "播放翻页", exact: true }).click();
    if (interruption === "resize") await page.setViewportSize({ width: 768, height: 900 });
    if (interruption === "popstate") await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
    if (interruption === "motion") await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".login-page-turn")).toHaveCount(0);
    await expect(page.locator("#root")).not.toHaveAttribute("inert");
    await expect(page.getByRole("button", { name: "再看一次" })).toBeEnabled();
  }
});

test("reduced motion skips the sheet, including a successful real login", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill("editor_e2e");
  await page.getByLabel("密码", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator(".login-page-turn")).toHaveCount(0);
  await expect(page.locator("#root")).not.toHaveAttribute("inert");
  await expect(page.getByRole("link", { name: "进入续火花助手" })).toHaveClass(/is-docked/);
});

import { expect, test } from "@playwright/test";

async function restoreSession(page) {
  const response = await page.request.post("/api/v1/auth/login", { data: {
    identifier: "editor_e2e", password: "password123",
  } });
  expect(response.ok()).toBeTruthy();
}

async function holdRefresh(page) {
  let release;
  await page.route("**/api/v1/auth/refresh", async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => { release = resolve; });
    await route.fulfill({ response });
  });
  return async () => {
    await expect.poll(() => Boolean(release)).toBe(true);
    release();
  };
}

test("a restored session opens the welcome cover once, replacing its history entry", async ({ page }) => {
  await restoreSession(page);
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "关于映墨", exact: true })).toBeVisible();
  const release = await holdRefresh(page);
  await page.goto("/");
  await expect(page.locator(".landing-paper h1")).toBeVisible();
  await expect(page.locator(".home-page, .login-page-turn")).toHaveCount(0);
  await release();
  await expect(page).toHaveURL(/\/home$/);
  const turn = page.locator(".login-page-turn");
  await expect(turn.locator(".landing-paper")).toBeAttached();
  await expect(turn).toHaveAttribute("data-mode", "peel");
  await expect(turn).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#root")).toHaveAttribute("inert", "");
  await expect(turn).toHaveCount(0);
  await expect(page.locator("#root")).not.toHaveAttribute("inert");
  await expect(page.locator(".home-page h1")).toBeFocused();
  await page.unroute("**/api/v1/auth/refresh");
  await page.reload();
  await expect(page.locator(".home-page h1")).toBeVisible();
  await expect(turn).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/about$/);
});

test("an anonymous or expired session keeps the welcome page usable", async ({ page }) => {
  const release = await holdRefresh(page);
  await page.goto("/");
  await expect(page.locator(".landing-paper h1")).toBeVisible();
  await expect(page.getByRole("link", { name: "进入映墨", exact: true })).toHaveAttribute("href", "/login");
  await release();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".login-page-turn, .home-page")).toHaveCount(0);
  await page.getByRole("link", { name: "进入映墨", exact: true }).click();
  await expect(page.getByLabel("用户名或邮箱")).toBeVisible();
});

test("leaving the cover during session checking cancels automatic entry", async ({ page }) => {
  await restoreSession(page);
  const release = await holdRefresh(page);
  await page.goto("/");
  await page.getByRole("link", { name: "关于映墨", exact: true }).click();
  await release();
  await expect(page.getByRole("heading", { name: "关于映墨", exact: true })).toBeVisible();
  await expect(page.locator(".login-page-turn")).toHaveCount(0);
  await expect(page).toHaveURL(/\/about$/);
  // An ordinary internal link to the cover goes straight home, with no replay.
  await page.getByRole("link", { name: "Ying-Mo 首页" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator(".login-page-turn")).toHaveCount(0);
});

test("slow or failed home data never holds the cover over the real page", async ({ page }) => {
  await restoreSession(page);
  let release;
  await page.route("**/api/v1/home/feed?**", async (route) => {
    await new Promise((resolve) => { release = resolve; });
    await route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "暂时无法读取记录" } } });
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator(".login-page-turn")).toHaveCount(0);
  await expect(page.locator("#root")).not.toHaveAttribute("inert");
  await expect(page.locator(".home-page h1")).toBeVisible();
  await expect(page.locator(".home-feed-loading")).toBeVisible();
  await expect.poll(() => Boolean(release)).toBe(true);
  release();
  await expect(page.getByRole("alert")).toContainText("暂时无法读取记录");
  await expect(page.getByRole("button", { name: "重新读取" })).toBeEnabled();
});

test("reduced motion restores the session directly without a moving sheet", async ({ page }) => {
  await restoreSession(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator(".home-page h1")).toBeVisible();
  await expect(page.locator(".login-page-turn")).toHaveCount(0);
  await expect(page.locator("#root")).not.toHaveAttribute("inert");
});

test("the welcome replay keeps the same paper fold at the shorter tempo in both themes", async ({ page }, testInfo) => {
  await page.clock.install();
  for (const theme of ["light", "dark"]) {
    await page.addInitScript((value) => localStorage.setItem("yingmo_theme", value), theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/dev/login-page-turn?from=welcome");
      await expect(page.locator(".landing-paper h1")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
      await page.getByRole("button", { name: "播放翻页", exact: true }).click();
      await page.clock.runFor(275);
      const turn = page.locator(".login-page-turn");
      const progress = Number(await turn.getAttribute("data-progress"));
      expect(progress).toBeGreaterThan(.4);
      expect(progress).toBeLessThan(.6);
      expect(await turn.locator(".login-turn-front").evaluate((element) => getComputedStyle(element).clipPath)).toContain("polygon");
      await page.screenshot({ path: testInfo.outputPath(`welcome-fold-${theme}-${width}.png`) });
      await page.clock.runFor(325);
      await expect(turn).toHaveCount(0);
      await expect(page.getByRole("button", { name: "再看一次" })).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.clock.resume();
    }
  }
});

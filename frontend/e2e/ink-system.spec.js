import { expect, test } from "@playwright/test";

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

async function login(page) {
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill("editor_e2e");
  await page.getByLabel("密码", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/home/);
}

async function headingHasRoom(page) {
  const header = page.locator("main > header:has(> .ink-page-sketch)");
  if (!await header.count()) return;
  const scene = await header.locator(".ink-page-sketch").boundingBox();
  const copy = await header.locator("h1").boundingBox();
  expect(scene.x >= copy.x + copy.width - 1 || scene.y >= copy.y + copy.height - 1).toBeTruthy();
}

test("public ink scenes preserve form access and adapt to light and dark paper", async ({ page }, testInfo) => {
  for (const theme of ["light", "dark"]) {
    await page.addInitScript((value) => localStorage.setItem("yingmo_theme", value), theme);
    for (const path of ["/", "/login", "/register", "/about", "/forgot-password", "/reset-password", "/verify-email", "/missing-page"]) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.locator("main .ink-sketch:visible").first()).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await noOverflow(page);
      if (["/", "/login", "/register"].includes(path)) {
        const paper = await page.locator("main").evaluate((element) => getComputedStyle(element).backgroundColor);
        expect(paper).toBe(theme === "dark" ? "rgb(32, 35, 31)" : "rgb(248, 247, 243)");
      }
      if (["/", "/login", "/register"].includes(path) && theme === "light") {
        await page.screenshot({ path: testInfo.outputPath(`public-${path.replaceAll("/", "") || "welcome"}-desktop.png`), fullPage: true });
      }
      for (const width of [768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await noOverflow(page);
      }
      if (path === "/login") {
        await expect(page.getByLabel("用户名或邮箱")).toBeVisible();
        await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`login-${theme}-mobile.png`), fullPage: true });
      }
    }
  }
});

test("personal and writing pages keep scene, heading and actions usable at every size", async ({ page }, testInfo) => {
  await login(page);
  const paths = ["/home", "/write", "/me", "/me/posts", "/me/collections", "/me/favorites", "/me/comments", "/me/notifications", "/me/settings", "/me/sessions", "/me/media", "/me/data", "/on-this-day", "/year-in-review", "/collections/new"];
  for (const path of paths) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(path);
    if (path === "/write") await expect(page.getByPlaceholder("文章标题（必填）")).toBeVisible();
    else await expect(page.locator("main .ink-sketch:visible").first()).toBeVisible();
    await expect(page.locator(".app-header .ink-brand-mark")).toBeVisible();
    await headingHasRoom(page);
    await noOverflow(page);
    if (["/write", "/me/settings", "/me/posts", "/year-in-review"].includes(path)) {
      await page.screenshot({ path: testInfo.outputPath(`workspace-${path.split("/").at(-1)}-desktop.png`), fullPage: true });
    }
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await headingHasRoom(page);
      await noOverflow(page);
    }
    if (path === "/me/settings") await page.screenshot({ path: testInfo.outputPath("settings-mobile.png"), fullPage: true });
  }
});

test("admin ledger shares the ink style while retaining readable controls", async ({ page }, testInfo) => {
  for (const endpoint of ["login", "refresh"]) {
    await page.route(`**/api/v1/auth/${endpoint}`, async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      if (json.data?.user) json.data.user.role = "system_admin";
      await route.fulfill({ response, json });
    });
  }
  await page.route("**/api/v1/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const settings = { settings: { site_name: "映墨" }, schema: [{ key: "site_name", label: "站点名称", required: true, max_length: 80 }] };
    await route.fulfill({ json: {
      data: path.endsWith("dashboard") ? { counts: {}, recent_posts: [], recent_comments: [], system: { status: "ok", environment: "test", database: "SQLite", media_storage: "local" } } : path.endsWith("settings") ? settings : [],
      meta: { pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 } },
    } });
  });
  await login(page);
  for (const path of ["/admin", "/admin/users", "/admin/posts", "/admin/collections", "/admin/comments", "/admin/categories", "/admin/tags", "/admin/media", "/admin/featured", "/admin/settings", "/admin/notifications", "/admin/logs"]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(path);
    await expect(page.locator(".admin-heading .ink-page-sketch")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "后台导航" })).toBeVisible();
    await headingHasRoom(page);
    await noOverflow(page);
    if (path === "/admin") await page.screenshot({ path: testInfo.outputPath("admin-desktop.png"), fullPage: true });
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await headingHasRoom(page);
      await noOverflow(page);
    }
  }
});

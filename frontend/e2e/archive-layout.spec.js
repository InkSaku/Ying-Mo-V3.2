import { expect, test } from "@playwright/test";

const account = { username: "archive_layout_e2e", password: "password123" };
const items = [
  { id: 901, post_type: "article", title: "沿着旧地图，找回曾经走过的街道", current_slug: "archive-test", published_at: "2026-09-03T08:00:00Z", updated_at: "2026-09-03T08:00:00Z", author: { username: "friend", nickname: "安安" }, tags: [] },
  { id: 902, post_type: "note", body: "风吹过窗边，忽然想起去年这个时候，我们也在这里喝茶。", semantic_time: "2026-09-01T08:00:00Z", author: { username: "friend", nickname: "安安" }, tags: [] },
  { id: 903, post_type: "note", body: "记下一段很长的散步。", semantic_time: "2025-12-02T08:00:00Z", tags: [] },
];
test("Archive keeps year/month navigation and filters accessible in a quiet layout", async ({ page, request }, testInfo) => {
  expect((await request.post("/api/v1/auth/register", { data: { ...account, nickname: "归档验收", email: "archive-layout@example.com", invite_code: "e2e-invite" } })).status()).toBe(201);
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill(account.username);
  await page.getByLabel("密码").fill(account.password);
  await page.getByRole("button", { name: /登录，继续书写/ }).click();
  await expect(page).toHaveURL(/\/home/);
  await page.route("**/api/v1/archive**", route => {
    const path = new URL(route.request().url()).pathname;
    const filtered = path.includes("2026") ? items.slice(0, 2) : items;
    return route.fulfill({ json: { data: { items: filtered, month_facets: [{ year: 2026, month: 9, count: 2 }, { year: 2025, month: 12, count: 1 }] }, meta: { pagination: { total: filtered.length, page: 1, page_size: 20, total_pages: 1 } } } });
  });
  await page.goto("/archive");
  await expect(page.locator(".archive-issue-entry")).toHaveCount(3);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--page").trim())).toBe("#f8f7f3");
  await expect(page.locator(".archive-filter-shelf .post-filters")).toBeHidden();
  await page.locator(".archive-filter-shelf summary").click();
  await expect(page.getByText("全部作者", { exact: true })).toBeVisible();
  await page.locator(".archive-filter-shelf summary").click();
  await page.getByRole("button", { name: /2026 年/ }).click();
  await expect(page).toHaveURL(/year=2026/);
  await page.getByRole("button", { name: /09 月/ }).click();
  await expect(page).toHaveURL(/month=9/);
  await expect(page.locator("#archive-range-title")).toHaveText("2026 年 09 月");
  await page.getByRole("button", { name: /全部年份/ }).click();
  await expect(page.locator(".archive-issue-entry")).toHaveCount(3);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`archive-${width}.png`), fullPage: true });
  }
});

import { expect, test } from "@playwright/test";

const account = { username: "search_layout_e2e", password: "password123" };
const searchData = {
  posts: [
    { id: 31, post_type: "article", title: "在海边重新找到安静", summary: "沿着海岸走了一下午，也重新整理了生活的节奏。", current_slug: "quiet-coast", published_at: "2026-09-08T08:00:00Z", updated_at: "2026-09-08T08:00:00Z", reading_minutes: 5, author: { username: "friend", nickname: "安安" }, tags: [] },
    { id: 32, post_type: "note", body: "风从海面吹过来，带着一点入秋前的凉意。", semantic_time: "2026-09-07T08:00:00Z", author: { username: "friend", nickname: "安安" }, tags: [] },
  ],
  collections: [{ id: 41, name: "海边手册", slug: "coast-book", description: "我们一起记下的沿海片段。", cover_media: null }],
  users: [{ id: 51, username: "friend", nickname: "安安", avatar_media: null }],
  category_facets: [{ id: 61, name: "沿途", slug: "journey", count: 2 }],
  tag_facets: [{ id: 71, name: "海边", slug: "coast", count: 3 }],
};

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/v1/auth/register", { data: {
    ...account, nickname: "搜索验收", email: "search-layout@example.com", invite_code: "e2e-invite",
  } })).status()).toBe(201);
});

test("Search keeps suggestions, result views and responsive reading order", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill(account.username);
  await page.getByLabel("密码").fill(account.password);
  await page.getByRole("button", { name: /登录，继续书写/ }).click();
  await expect(page).toHaveURL(/\/home/);

  await page.route("**/api/v1/search?*", route => route.fulfill({ json: {
    data: searchData,
    meta: { pagination: { total: 2, page: 1, page_size: 20, total_pages: 1 } },
  } }));
  await page.route("**/api/v1/search/suggestions?*", route => route.fulfill({ json: {
    data: { post_titles: ["在海边重新找到安静"], collection_names: ["海边手册"] },
  } }));

  await page.goto("/search");
  const input = page.getByRole("combobox", { name: "搜索内容" });
  await input.focus();
  await input.fill("海边");
  await expect(page.getByRole("option", { name: /在海边重新找到安静/ })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/q=/);
  await expect(page.locator(".search-post-stream .post-card-search")).toHaveCount(2);
  await expect(page.locator(".search-collection-result")).toHaveCount(1);
  await expect(page.locator(".search-member-result")).toHaveCount(1);
  await page.getByRole("button", { name: /合集/ }).click();
  await expect(page).toHaveURL(/type=collections/);
  await expect(page.locator(".search-collection-grid")).toBeVisible();
  await page.getByRole("button", { name: /全部/ }).click();

  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--page").trim())).toBe("#f8f7f3");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`search-${width}.png`), fullPage: true });
  }
});

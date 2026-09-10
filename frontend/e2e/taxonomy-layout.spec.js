import { expect, test } from "@playwright/test";

const account = { username: "taxonomy_layout_e2e", password: "password123" };
const categories = [
  { id: 1, name: "生活札记", slug: "life", description: "收集日常生活里值得慢慢写下的片段。", visible_post_count: 6 },
  { id: 2, name: "阅读与思考", slug: "reading", description: "关于书、知识与一次次重新理解。", visible_post_count: 4 },
  { id: 3, name: "沿途", slug: "journey", description: "道路、城市和抵达以前的风景。", visible_post_count: 3 },
];
const tags = [
  { id: 11, name: "日常", slug: "daily", visible_post_count: 9 },
  { id: 12, name: "散步", slug: "walk", visible_post_count: 5 },
  { id: 13, name: "阅读", slug: "books", visible_post_count: 2 },
  { id: 14, name: "朋友", slug: "friends", visible_post_count: 4 },
];
const posts = [
  { id: 21, post_type: "article", title: "在平常日子里重新发现生活", summary: "记录那些容易被匆忙略过的光线与声音。", current_slug: "ordinary-days", published_at: "2026-09-08T08:00:00Z", updated_at: "2026-09-08T08:00:00Z", reading_minutes: 5, author: { username: "friend", nickname: "安安" }, tags: [] },
  { id: 22, post_type: "note", body: "傍晚绕了一点远路，风里已经有了秋天的味道。", semantic_time: "2026-09-07T08:00:00Z", author: { username: "friend", nickname: "安安" }, tags: [] },
];

async function login(page) {
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill(account.username);
  await page.getByLabel("密码").fill(account.password);
  await page.getByRole("button", { name: /登录，继续书写/ }).click();
  await expect(page).toHaveURL(/\/home/);
}

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/v1/auth/register", { data: {
    ...account, nickname: "分类验收", email: "taxonomy-layout@example.com", invite_code: "e2e-invite",
  } })).status()).toBe(201);
});

test("Category and tag pages form a readable responsive index", async ({ page }, testInfo) => {
  await login(page);
  await page.route("**/api/v1/categories", route => route.fulfill({ json: { data: categories } }));
  await page.route("**/api/v1/tags", route => route.fulfill({ json: { data: tags } }));
  await page.route("**/api/v1/categories/life**", route => route.fulfill({ json: {
    data: { category: categories[0], visible_post_count: posts.length, posts },
    meta: { pagination: { total: posts.length, page: 1, page_size: 20, total_pages: 1 } },
  } }));

  await page.goto("/categories");
  await expect(page.getByRole("heading", { name: "栏目目录" })).toBeVisible();
  await expect(page.locator(".taxonomy-category-register li")).toHaveCount(3);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--page").trim())).toBe("#f8f7f3");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`categories-${width}.png`), fullPage: true });
  }
  await page.getByRole("link", { name: /生活札记/ }).click();
  await expect(page).toHaveURL(/\/categories\/life/);
  await expect(page.locator(".taxonomy-reading-entry")).toHaveCount(2);
  await expect(page.locator(".taxonomy-reading-entry .article-card")).toHaveCount(1);
  await expect(page.locator(".taxonomy-reading-entry .note-card")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("category-detail-390.png"), fullPage: true });

  await page.goto("/tags");
  await expect(page.locator(".taxonomy-tag-entry")).toHaveCount(4);
  await expect(page.locator(".taxonomy-tag-entry.is-prominent")).toContainText("#日常");

  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`taxonomy-${width}.png`), fullPage: true });
  }
});

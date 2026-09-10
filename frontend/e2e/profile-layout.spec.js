import { expect, test } from "@playwright/test";

const account = { username: "profile_layout_e2e", password: "password123" };

async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

test("member profile reads as a portrait, personal catalogue and shared shelf", async ({ page, request }, testInfo) => {
  const registration = await request.post("/api/v1/auth/register", { data: {
    ...account,
    nickname: "林间",
    email: "profile-layout@example.com",
    invite_code: "e2e-invite",
  } });
  expect(registration.status()).toBe(201);

  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill(account.username);
  await page.getByLabel("密码").fill(account.password);
  await page.getByRole("button", { name: /登录，继续书写/ }).click();
  await expect(page).toHaveURL(/\/home/);

  const author = { username: account.username, nickname: "林间", avatar_media: null, bio: "写下散步、阅读，以及朋友们一起经过的普通日子。", region: "杭州" };
  const posts = [
    { id: 301, post_type: "article", title: "沿着河岸慢慢走回家", summary: "关于傍晚、树影和一条走过许多次的路。", current_slug: "river-walk", reading_minutes: 4, author, published_at: "2026-09-08T08:00:00Z", updated_at: "2026-09-09T08:00:00Z", tags: [] },
    { id: 302, post_type: "note", body: "雨停以后，窗外的树叶忽然亮了一点。", author, semantic_time: "2026-09-07T08:00:00Z", published_at: "2026-09-07T08:00:00Z", tags: [] },
  ];
  const collections = [
    { id: 401, name: "城市散步", slug: "city-walks", description: "把一起走过的街道收进这一册。", creator: author, member_count: 3, cover_media: null, updated_at: "2026-09-09T08:00:00Z" },
    { id: 402, name: "四季通信", slug: "seasonal-letters", description: "朋友之间缓慢往来的记录。", creator: author, member_count: 4, cover_media: null, updated_at: "2026-09-06T08:00:00Z" },
  ];

  await page.route(`**/api/v1/users/${account.username}?*`, route => route.fulfill({ json: {
    data: { user: author, posts, collections, visible_post_count: posts.length, visible_collection_count: collections.length },
    meta: {
      posts_pagination: { page: 1, page_size: 12, total: posts.length, total_pages: 1 },
      collections_pagination: { page: 1, page_size: 12, total: collections.length, total_pages: 1 },
    },
  } }));

  await page.goto(`/users/${account.username}`);
  await expect(page.getByRole("heading", { level: 1, name: "林间" })).toBeVisible();
  await expect(page.locator(".profile-monogram")).toContainText("林");
  await expect(page.getByRole("link", { name: "编辑公开资料" })).toBeVisible();
  await expect(page.locator(".profile-post-catalogue .post-card-profile")).toHaveCount(2);
  await expect(page.locator(".profile-collection-shelf .collection-card-shelf")).toHaveCount(2);

  await page.setViewportSize({ width: 1440, height: 1000 });
  const desktop = await page.evaluate(() => {
    const portrait = document.querySelector(".profile-portrait").getBoundingClientRect();
    const copy = document.querySelector(".profile-copy").getBoundingClientRect();
    const counts = document.querySelector(".profile-counts").getBoundingClientRect();
    return { portrait, copy, counts };
  });
  expect(desktop.portrait.right).toBeLessThan(desktop.copy.left);
  expect(desktop.copy.right).toBeLessThan(desktop.counts.left);
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("profile-desktop.png"), fullPage: true });

  for (const width of [980, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoOverflow(page);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".profile-local-nav")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("profile-mobile.png"), fullPage: true });
});

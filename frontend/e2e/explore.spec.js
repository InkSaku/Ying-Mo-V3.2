import { expect, test } from "@playwright/test";

const account = { username: "explore_layout_e2e", password: "password123" };

const article = (id, title) => ({
  id,
  post_type: "article",
  title,
  summary: "记录不是为了赶路，而是替未来的我们保留一些能够返回的入口。",
  published_at: "2026-09-07T08:00:00Z",
  updated_at: "2026-09-07T08:00:00Z",
  reading_minutes: 6,
  author: { username: "explore_friend", nickname: "安安" },
  current_slug: `explore-article-${id}`,
  tags: [],
});

const note = (id, body) => ({
  id,
  post_type: "note",
  body,
  semantic_time: "2026-09-07T10:00:00Z",
  published_at: "2026-09-07T10:00:00Z",
  author: { username: "explore_friend", nickname: "安安" },
  tags: [],
});

const populatedExplore = {
  random_articles: [
    article(1, "一条反复走过的路，也会在某一天显出从未留意过的方向"),
    article(2, "把周末交给旧城区"),
    article(3, "城市另一面的清晨"),
    article(4, "在雨停之前抵达"),
  ],
  random_notes: [
    note(11, "旧相机拍出的颜色很安静，像记忆自己加了一层滤镜。"),
    note(12, "雨停以后，沿着河边慢慢走了一小段路。"),
    note(13, "今天的晚霞恰好照亮了翻开的那一页。"),
    note(14, "把周末留给一本还没有读完的书。"),
  ],
  roaming_tags: [
    { id: 1, name: "日常", slug: "daily", visible_post_count: 9 },
    { id: 2, name: "散步", slug: "walk", visible_post_count: 6 },
  ],
  featured_collections: [],
  on_this_day: { month: 9, day: 7, items: [], total: 0 },
  recent_members: [
    { id: 2, username: "explore_friend", nickname: "安安", bio: "认真生活，也认真记录。" },
  ],
};

async function login(page) {
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill(account.username);
  await page.getByLabel("密码").fill(account.password);
  await page.getByRole("button", { name: /登录，继续书写/ }).click();
  await expect(page).toHaveURL(/\/home/);
}

async function fulfillExplore(page, data) {
  await page.route("**/api/v1/explore**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ data }),
  }));
}

async function expectNoOverflow(page) {
  const overflow = await page.evaluate(() => ({ width: innerWidth, excess: document.documentElement.scrollWidth - innerWidth, elements: [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > innerWidth).map(el => el.className).slice(0, 12) }));
  expect(overflow.excess, JSON.stringify(overflow)).toBeLessThanOrEqual(1);
}

test.beforeAll(async ({ request }) => {
  const response = await request.post("/api/v1/auth/register", { data: {
    ...account,
    nickname: "漫游验收",
    email: "explore-layout@example.com",
    invite_code: "e2e-invite",
  } });
  expect(response.status()).toBe(201);
});

test("Explore keeps text-led content readable without a fake cover or overlapping collage", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await login(page);
  await fulfillExplore(page, populatedExplore);
  await page.goto("/explore");

  await expect(page.getByRole("heading", { name: "漫游", exact: true })).toBeVisible();
  await expect(page.locator(".explore-opening-visual")).toHaveCount(0);
  await expect(page.locator(".explore-opening-caption h2")).toContainText("一条反复走过的路");
  await expect(page.locator(".explore-article-ledger .post-card-content > p").first()).toBeVisible();

  const overlap = await page.evaluate(() => {
    const caption = document.querySelector(".explore-opening-caption").getBoundingClientRect();
    const noteCard = document.querySelector(".explore-opening-note").getBoundingClientRect();
    const width = Math.max(0, Math.min(caption.right, noteCard.right) - Math.max(caption.left, noteCard.left));
    const height = Math.max(0, Math.min(caption.bottom, noteCard.bottom) - Math.max(caption.top, noteCard.top));
    return width * height;
  });
  expect(overlap).toBe(0);

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoOverflow(page);
  }

  await page.getByRole("button", { name: "换一批内容" }).click();
  await expect(page).toHaveURL(/\/explore\?seed=batch-[a-z0-9]+/);
  await page.screenshot({ path: testInfo.outputPath("explore-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("explore-mobile.png"), fullPage: true });
});

test("Explore uses one useful empty state when every source is empty", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await fulfillExplore(page, {
    random_articles: [], random_notes: [], roaming_tags: [], featured_collections: [],
    on_this_day: { month: 9, day: 7, items: [], total: 0 }, recent_members: [],
  });
  await page.goto("/explore");

  await expect(page.getByRole("heading", { name: "还没有可以偶遇的内容" })).toBeVisible();
  await expect(page.locator(".explore-opening, .explore-section")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "返回首页" })).toBeVisible();
  await expectNoOverflow(page);
});

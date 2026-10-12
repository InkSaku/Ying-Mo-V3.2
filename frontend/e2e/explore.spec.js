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

  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoOverflow(page);
    }
  }

  await page.getByRole("button", { name: "换一批内容" }).click();
  await expect(page).toHaveURL(/\/explore\?seed=batch-[a-z0-9]+/);
  await page.emulateMedia({ colorScheme: "light" });
  await page.screenshot({ path: testInfo.outputPath("explore-desktop.png"), fullPage: true, style: ".app-header, .mobile-bottom-nav { visibility: hidden !important; }" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: testInfo.outputPath("explore-mobile.png"), fullPage: true, style: ".app-header, .mobile-bottom-nav { visibility: hidden !important; }" });
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

test("mixed roaming content keeps covers, links and seed history through refresh", async ({ page }, testInfo) => {
  const media = { public_id: "explore-layout-cover", media_type: "image", thumbnail_path: "/api/v1/uploads/explore-layout/thumbnail", read_path: "/api/v1/uploads/explore-layout/thumbnail" };
  const collection = { id: 51, slug: "quiet-seasons", name: "一起走过的四季", description: "把平常的日子，收进共同的一册。", creator: populatedExplore.recent_members[0] };
  const mixed = {
    ...populatedExplore,
    random_articles: populatedExplore.random_articles.map((post, index) => ({ ...post, cover_media: index % 2 === 0 ? media : null })),
    random_notes: populatedExplore.random_notes.map((post, index) => ({ ...post, display_media: index % 2 === 0 ? media : null })),
    featured_collections: [collection, { ...collection, id: 52, slug: "old-bookshop", name: "旧书店与一下午", cover_media: media }],
    on_this_day: { month: 9, day: 7, items: [{ ...article(91, "一年前的今天，也在慢慢记录"), years_ago: 1, memory_year: 2025 }], total: 1 },
  };
  let hold = false;
  let release;
  await page.route("**/api/v1/uploads/explore-layout/thumbnail", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#d8ddd1"/><path d="M0 255 110 130 250 240 340 170 480 270V320H0Z" fill="#8d9d89"/><circle cx="350" cy="76" r="30" fill="#f7edc9"/></svg>' }));
  await page.route("**/api/v1/explore**", async (route) => {
    const seed = new URL(route.request().url()).searchParams.get("seed");
    if (hold) await new Promise((resolve) => { release = resolve; });
    const data = { ...mixed, random_articles: mixed.random_articles.map((post, index) => index === 0 && seed !== "batch-first" ? { ...post, title: "另一条路，也有新的风景" } : post) };
    await route.fulfill({ json: { data } });
  });
  await login(page);
  await page.goto("/explore?seed=batch-first");
  await expect(page.locator(".explore-opening-visual img")).toBeVisible();
  await expect(page.getByRole("heading", { name: "往年今日", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "一起走过的四季", exact: true })).toHaveAttribute("href", "/collections/quiet-seasons");
  await expect(page.getByRole("navigation", { name: "漫游标签" }).getByRole("link").first()).toHaveAttribute("href", "/tags/daily");
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectNoOverflow(page);
      const overlap = await page.evaluate(() => {
        const story = document.querySelector(".explore-opening-story").getBoundingClientRect();
        const note = document.querySelector(".explore-opening-note").getBoundingClientRect();
        return Math.max(0, Math.min(story.right, note.right) - Math.max(story.left, note.left)) * Math.max(0, Math.min(story.bottom, note.bottom) - Math.max(story.top, note.top));
      });
      expect(overlap).toBe(0);
      if (theme === "light" && width === 1440 || theme === "dark" && width === 390) {
        await page.screenshot({ path: testInfo.outputPath(`explore-mixed-${theme}-${width}.png`), fullPage: true, style: ".app-header, .mobile-bottom-nav { visibility: hidden !important; }" });
      }
    }
  }
  hold = true;
  await page.getByRole("button", { name: "换一批内容" }).click();
  await expect(page.getByRole("button", { name: "正在换一条路" })).toBeDisabled();
  await expect(page.locator(".explore-opening-caption h2")).toContainText("一条反复走过的路");
  await expect.poll(() => typeof release).toBe("function");
  hold = false;
  release();
  await expect(page.getByRole("heading", { name: "另一条路，也有新的风景" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/seed=batch-first$/);
  await expect(page.locator(".explore-opening-caption h2")).toContainText("一条反复走过的路");
});

test("partial sources stay visible without a row of empty sections", async ({ page }) => {
  let data = { random_articles: [], random_notes: [note(31, "只有一则随记，也可以从这里开始。")], roaming_tags: [], featured_collections: [], on_this_day: { items: [] }, recent_members: [] };
  await page.route("**/api/v1/explore**", (route) => route.fulfill({ json: { data } }));
  await login(page);
  await page.goto("/explore");
  await expect(page.getByRole("link", { name: "只有一则随记，也可以从这里开始。" })).toBeVisible();
  await expect(page.locator(".explore-section, .explore-all-empty")).toHaveCount(0);
  data = { ...data, random_notes: [], roaming_tags: populatedExplore.roaming_tags };
  await page.reload();
  await expect(page.getByRole("navigation", { name: "漫游标签" })).toBeVisible();
  await expect(page.locator(".explore-opening, .explore-all-empty")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 900 });
  await expectNoOverflow(page);
});

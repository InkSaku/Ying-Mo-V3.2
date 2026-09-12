import { expect, test } from "@playwright/test";

const account = { username: "p1_layout_e2e", password: "password123" };
let currentUser = { id: 1, username: account.username, nickname: "林间" };

async function login(page) {
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill(account.username);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录，继续书写" }).click();
  await expect(page).toHaveURL(/\/home/);
}

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

function mockReview(page) {
  return page.route("**/api/v1/home/year-in-review?*", (route) => route.fulfill({ json: { data: {
    summary: { total: 18, articles: 5, notes: 13, media: 7, active_months: 6, locations: 4 },
    months: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, total: index % 2 ? index + 1 : 0, article: index % 3, note: index % 2 ? index : 0 })),
    collections: [{ id: 101, slug: "p1-book", name: "一起走过的四季", count: 8 }],
    locations: ["河边", "旧书店", "山路", "厨房"],
    highlights: [],
  } } }));
}

function mockMemory(page) {
  return page.route("**/api/v1/home/on-this-day?*", (route) => route.fulfill({ json: {
    data: { items: [], date: "2026-09-12", month: 9, day: 12, year_facets: [{ year: 2025, count: 2 }, { year: 2024, count: 1 }] },
    meta: { pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 } },
  } }));
}

async function mockPersonalContent(page) {
  const pagination = (pageSize = 20) => ({ page: 1, page_size: pageSize, total: 1, total_pages: 1 });
  const post = {
    id: 201,
    post_type: "article",
    status: "published",
    visibility: "public",
    title: "九月的第一封信",
    summary: "把晚风、树影与一段缓慢的归途放在一起。",
    slug: "september-letter",
    slug_candidate: "september-letter",
    canonical: "/articles/september-letter",
    author: currentUser,
    published_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-12T10:00:00Z",
    reading_minutes: 4,
    reading_stats: { views: 36, unique_readers: 24, views_7d: 11, views_30d: 36 },
    tags: [{ id: 1, name: "日常", slug: "daily" }],
  };

  await page.route("**/api/v1/posts/me?*", (route) => route.fulfill({ json: { data: [post], meta: { pagination: pagination() } } }));
  await page.route("**/api/v1/users/me/collections?*", (route) => route.fulfill({ json: { data: [{
    id: 101,
    name: "一起走过的四季",
    slug: "p1-book",
    description: "把平常的日子按季节收进同一册。",
    creator: currentUser,
    member_count: 2,
    cover_media: null,
    updated_at: "2026-09-12T10:00:00Z",
  }], meta: { pagination: pagination(12) } } }));
  await page.route("**/api/v1/interactions/favorites?*", (route) => route.fulfill({ json: { data: [post], meta: { pagination: pagination() } } }));
  await page.route("**/api/v1/users/me/comments?*", (route) => route.fulfill({ json: { data: [{
    id: 301,
    body: "这段关于晚风的描述，我很喜欢。",
    status: "visible",
    created_at: "2026-09-11T18:20:00Z",
    post: { id: post.id, title: post.title, post_type: post.post_type, canonical: post.canonical },
  }], meta: { pagination: pagination() } } }));
  await page.route("**/api/v1/notifications?*", (route) => route.fulfill({ json: { data: [{
    id: 401,
    message: "阿遥回应了你的文章",
    summary: "读到这里时，忽然想起我们走过的那条路。",
    is_read: false,
    target_url: post.canonical,
    created_at: "2026-09-12T08:30:00Z",
  }], meta: { pagination: pagination() } } }));
}

async function mockCollectionManagement(page) {
  await page.route("**/api/v1/collections/member-options", (route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/v1/collections/101/members", (route) => route.fulfill({ json: { data: { members: [] } } }));
  await page.route("**/api/v1/collections/p1-book", (route) => route.fulfill({ json: { data: {
    id: 101,
    name: "一起走过的四季",
    slug: "p1-book",
    description: "把平常的日子按季节收进同一册。",
    creator: currentUser,
    members: [],
    posts: [],
    highlights: [],
    cover_media: null,
    first_shared_at: null,
    auto_add_future_members: false,
  } } }));
}

test.beforeAll(async ({ request }) => {
  const registered = await request.post("/api/v1/auth/register", { data: {
    ...account,
    nickname: "林间",
    email: "p1-layout@example.com",
    invite_code: "e2e-invite",
  } });
  expect([201, 409]).toContain(registered.status());
  if (registered.status() === 201) currentUser = (await registered.json()).data.user;
});

test("P1 personal archive is one coherent desktop directory", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockReview(page);
  await mockMemory(page);
  await mockPersonalContent(page);
  await mockCollectionManagement(page);
  await login(page);

  await page.goto("/me");
  await expect(page.locator(".personal-nav")).toBeVisible();
  await expect(page.locator(".personal-nav section")).toHaveCount(3);
  await expect(page.locator(".personal-nav-mobile")).toBeHidden();
  const navigationBox = await page.locator(".personal-navigation").boundingBox();
  const heroBox = await page.locator(".me-hero").boundingBox();
  expect(navigationBox.x).toBeLessThan(heroBox.x);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("personal-overview-desktop.png"), fullPage: true });

  const personalPages = [
    ["/me/posts", "我的内容"],
    ["/me/collections", "我的共同记录册。"],
    ["/me/favorites", "收藏"],
    ["/me/comments", "我的评论"],
    ["/me/notifications", "通知"],
    ["/me/media", "影像资料"],
    ["/on-this-day", "往年今日"],
    ["/year-in-review", "2026 年度回顾"],
  ];
  for (const [path, heading] of personalPages) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.locator(".personal-navigation")).toBeVisible();
    await noOverflow(page);
  }

  await page.goto("/me/posts");
  await expect(page.locator(".post-management-row")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "九月的第一封信" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("personal-content-desktop.png"), fullPage: true });

  await page.goto("/me/collections");
  await expect(page.locator(".collection-card-shelf")).toHaveCount(1);
  await page.goto("/me/favorites");
  await expect(page.locator(".favorite-list-item")).toHaveCount(1);
  await page.goto("/me/comments");
  await expect(page.locator(".comment-history-list article")).toHaveCount(1);
  await page.goto("/me/notifications");
  await expect(page.locator(".notification-list article.unread")).toHaveCount(1);

  await page.goto("/year-in-review");
  await expect(page.locator(".year-review-months > div")).toHaveCount(12);
  await page.screenshot({ path: testInfo.outputPath("year-review-desktop.png"), fullPage: true });

  await page.goto("/collections/p1-book/manage");
  await expect(page.locator(".collection-manage-index a")).toHaveCount(5);
  await expect(page.getByRole("heading", { name: "一起走过的四季" })).toBeVisible();
  await noOverflow(page);
});

test("P1 pages stay operable on a narrow phone", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockReview(page);
  await mockMemory(page);
  await mockPersonalContent(page);
  await mockCollectionManagement(page);
  await login(page);

  await page.goto("/me");
  await expect(page.locator(".personal-nav")).toBeHidden();
  const mobileDirectory = page.locator(".personal-nav-mobile");
  await expect(mobileDirectory).toBeVisible();
  await mobileDirectory.locator(":scope > summary").click();
  await expect(mobileDirectory.locator("nav section")).toHaveCount(3);
  await expect(mobileDirectory.locator("nav a")).toHaveCount(12);
  await mobileDirectory.locator(":scope > summary").click();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("personal-overview-mobile.png"), fullPage: true });

  await page.goto("/year-in-review");
  await expect(page.locator(".personal-nav-mobile summary strong")).toHaveText("年度回顾");
  await expect(page.locator(".year-review-month-scroll")).toBeVisible();
  await noOverflow(page);

  await page.goto("/collections/new");
  await expect(page.getByRole("heading", { name: "创建共同书册" })).toBeVisible();
  await expect(page.locator(".collection-create-form")).toHaveCSS("grid-template-columns", "350px");
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("collection-create-mobile.png"), fullPage: true });

  await page.goto("/collections/p1-book/manage");
  await expect(page.locator(".collection-manage-index")).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("collection-manage-mobile.png"), fullPage: true });

  await page.setViewportSize({ width: 320, height: 700 });
  for (const path of ["/me", "/me/posts", "/year-in-review", "/collections/new", "/collections/p1-book/manage"]) {
    await page.goto(path);
    await noOverflow(page);
  }
});

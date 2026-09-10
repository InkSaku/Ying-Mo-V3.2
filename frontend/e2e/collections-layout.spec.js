import { expect, test } from "@playwright/test";

test("collection library wraps its volumes and keeps creation accessible", async ({ page }, testInfo) => {
  await page.goto('/login');
  await page.getByLabel('用户名或邮箱').fill('editor_e2e');
  await page.getByLabel('密码').fill('password123');
  await page.getByRole('button', { name: /登录，继续书写/ }).click();
  await expect(page).toHaveURL(/\/home/);
  await page.route('**/api/v1/collections?*', route => route.fulfill({ json: {
    data: ['城市漫步', '一起走过的四季', '厨房里的小事', '写给未来的我们'].map((name, index) => ({ id: index + 1, name, slug: `book-${index}`, description: '把平常的日子，留在这一册。', member_count: 3, creator: { username: 'editor_e2e', nickname: '林间' }, updated_at: '2026-09-09T08:00:00Z' })),
    meta: { pagination: { page: 1, total: 4, total_pages: 1, page_size: 20 } }
  } }));
  await page.goto('/collections');
  await expect(page.getByRole('link', { name: '创建新册' })).toHaveAttribute('href', '/collections/new');
  await expect(page.locator('.collection-card-shelf')).toHaveCount(4);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (width === 1440 || width === 390) await page.screenshot({ path: testInfo.outputPath(`collections-${width}.png`), fullPage: true });
  }
});

test("collection detail behaves as a shared volume across all reading views", async ({ page, request }, testInfo) => {
  const account = { username: "collection_detail_e2e", password: "password123" };
  const registration = await request.post("/api/v1/auth/register", { data: {
    ...account, nickname: "合集详情验收", email: "collection-detail@example.com", invite_code: "e2e-invite",
  } });
  expect(registration.status()).toBe(201);
  const currentUser = (await registration.json()).data.user;
  const creator = { id: currentUser.id, username: account.username, nickname: "合集详情验收" };
  const posts = [
    { id: 201, post_type: "article", title: "沿着海岸一起走过的那个下午", summary: "把风、光线与同行的人收进这一册。", current_slug: "collection-coast", semantic_time: "2026-09-08T08:00:00Z", published_at: "2026-09-08T08:00:00Z", updated_at: "2026-09-08T08:00:00Z", reading_minutes: 5, author: creator, tags: [] },
    { id: 202, post_type: "note", body: "晚霞落在海面上，大家都安静了一会儿。", semantic_time: "2026-09-07T08:00:00Z", published_at: "2026-09-07T08:00:00Z", author: creator, tags: [] },
  ];
  const collection = {
    id: 101, name: "海边手册", slug: "coast-book", description: "我们一起留下的海边片段，以及那些没有说完的话。",
    creator, members: [{ id: 999, username: "friend", nickname: "安安" }], cover_media: null,
    updated_at: "2026-09-09T08:00:00Z", highlights: [posts[0]], posts,
  };

  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill(account.username);
  await page.getByLabel("密码").fill(account.password);
  await page.getByRole("button", { name: /登录，继续书写/ }).click();
  await expect(page).toHaveURL(/\/home/);
  await page.route("**/api/v1/collections/coast-book", route => route.fulfill({ json: { data: collection } }));
  await page.route("**/api/v1/collections/coast-book/timeline?*", route => route.fulfill({ json: {
    data: { items: posts, year_facets: [{ year: 2026, count: 2 }], authors: [{ ...creator, count: 2 }] },
    meta: { pagination: { page: 1, page_size: 20, total: 2, total_pages: 1 } },
  } }));
  await page.route("**/api/v1/collections/coast-book/media?*", route => route.fulfill({ json: {
    data: { items: [], year_facets: [{ year: 2026, count: 2 }], authors: [{ ...creator, count: 2 }] },
    meta: { pagination: { page: 1, page_size: 24, total: 0, total_pages: 0 } },
  } }));
  await page.route("**/api/v1/collections/101/notification-preference", route => route.fulfill({ json: { data: { level: "all" } } }));

  await page.goto("/collections/coast-book");
  await expect(page.getByRole("heading", { name: "海边手册" })).toBeVisible();
  await expect(page.locator(".collection-volume-fallback")).toBeVisible();
  await expect(page.locator(".collection-timeline-group .post-card")).toHaveCount(2);
  await expect(page.locator(".collection-memory-filters")).toBeHidden();
  await page.locator(".collection-memory-filter-drawer summary").click();
  await expect(page.locator(".collection-memory-filters")).toBeVisible();
  await page.getByRole("button", { name: "合集内容" }).click();
  await expect(page).toHaveURL(/view=overview/);
  await expect(page.locator(".collection-post-catalogue .post-card")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "管理这册合集" })).toBeVisible();
  await page.getByRole("button", { name: "共同影像" }).click();
  await expect(page).toHaveURL(/view=media/);
  await expect(page.getByText("这里还没有可展示的共同影像")).toBeVisible();
  await page.getByRole("button", { name: "共同时间轴" }).click();
  await expect(page.locator(".collection-timeline-group .post-card")).toHaveCount(2);
  await page.evaluate(() => window.scrollTo(0, 0));

  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--page").trim())).toBe("#f8f7f3");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (width === 1440 || width === 390) await page.screenshot({ path: testInfo.outputPath(`collection-detail-${width}.png`), fullPage: true });
  }
});

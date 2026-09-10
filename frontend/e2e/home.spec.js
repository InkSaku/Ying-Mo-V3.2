import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const account = { username: "home_layout_e2e", password: "password123" };
let seededItems;

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

test.beforeAll(async ({ request }) => {
  const registered = await request.post("/api/v1/auth/register", { data: {
    ...account, nickname: "林间", email: "home-layout@example.com", invite_code: "e2e-invite",
  } });
  expect(registered.status()).toBe(201);
  const { access_token: token } = (await registered.json()).data;
  const headers = { Authorization: `Bearer ${token}` };
  const notes = [
    "雨停以后，沿着河边走了一小段路。树叶还在滴水，风里有一点秋天的凉意。",
    "把周末留给一本没读完的书，也给那些暂时没有答案的问题。",
    "今天的晚霞落在窗边，恰好照亮了翻开的那一页。普通的一天，也有值得留下的片刻。",
  ];
  for (let index = 0; index < 15; index += 1) {
    const article = index % 4 === 0;
    const draft = await request.post("/api/v1/posts", { headers, data: {
      post_type: article ? "article" : "note", visibility: "login_only",
      ...(article ? {
        title: index === 12 ? "在忙碌的日常里，为缓慢而持久的事留一点位置" : `阅读与生活之间：第 ${index + 1} 次记录`,
        summary: "关于阅读、散步和持续记录的一点思考。把注意力还给那些具体的事，也许就能重新找到自己的节奏。",
      } : { location: "河边", occurred_at: new Date().toISOString() }),
      body: article ? "## 留出一点时间\n\n记录帮助我们看见平常被忽略的小事。\n\n## 慢慢继续\n\n不急于完成，先开始。" : notes[index % notes.length],
    } });
    expect(draft.status()).toBe(201);
    const { id } = (await draft.json()).data;
    const published = await request.post(`/api/v1/posts/${id}/publish`, { headers, data: article ? { slug: `home-layout-${index}` } : {} });
    expect(published.ok()).toBeTruthy();
  }
  const feed = await request.get("/api/v1/home/feed?type=all&page_size=12", { headers });
  seededItems = (await feed.json()).data.items;
});

test("home keeps chronological order, cursor paging and the reading position", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const response = page.waitForResponse((res) => res.url().includes("/home/feed?") && res.ok());
  await login(page);
  const items = (await (await response).json()).data.items;
  const entries = page.locator(".home-feed-entry[data-feed-post-id]");
  await expect(entries).toHaveCount(items.length);
  expect(await entries.evaluateAll((nodes) => nodes.map((node) => Number(node.dataset.feedPostId)))).toEqual(items.map((post) => post.id));
  expect(items[0].post_type).toBe("note");
  await expect(page.locator(".home-edition-heading h1")).toBeInViewport();
  await expect(page.locator(".home-ink-landscape")).toBeVisible();
  await expect(page.locator(".home-writing-sketch")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "快速随记正文" })).toBeInViewport();
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".home-collage img").evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("home-desktop.png"), fullPage: false });
  await page.screenshot({ path: testInfo.outputPath("home-desktop-full.png"), fullPage: true });

  await entries.nth(5).scrollIntoViewIfNeeded();
  const target = entries.nth(5);
  const before = await target.boundingBox();
  await target.locator(".home-feed-post-footer > a").click();
  await expect(page).toHaveURL(/\/(articles|notes)\//);
  await page.getByRole("button", { name: "返回首页时间流" }).click();
  await expect(page).toHaveURL(/\/home/);
  await expect.poll(async () => Math.abs((await target.boundingBox()).y - before.y)).toBeLessThan(6);

  await entries.last().scrollIntoViewIfNeeded();
  await expect(entries).toHaveCount(15);
  const toolbar = page.locator(".home-feed-toolbar");
  expect(Math.abs((await toolbar.boundingBox()).y - (await page.locator(".app-header").boundingBox()).height)).toBeLessThan(2);
  await page.getByRole("button", { name: "文章", exact: true }).click();
  await expect(page).toHaveURL(/type=article/);
  await expect(page.locator(".home-feed-post[data-post-type=note]")).toHaveCount(0);
  await expect(page.locator(".home-feed-post[data-post-type=article]").first()).toBeVisible();
  await page.getByRole("button", { name: "全部", exact: true }).click();
  await expect(entries).toHaveCount(15);
});

test("home fits narrow screens and publishes an image note through the existing composer", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const first = page.locator(".home-feed-entry").first();
  await expect(first).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".home-edition-heading h1")).toBeInViewport();
  await expect(page.locator(".home-ink-landscape")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "快速随记正文" })).toBeInViewport();
  await page.locator(".home-collage img").evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  await page.screenshot({ path: testInfo.outputPath("home-mobile.png") });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".quick-note-audience .custom-select-trigger")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.screenshot({ path: testInfo.outputPath("home-dark.png") });
  await page.emulateMedia({ colorScheme: "light" });

  const body = "手机首页验收：文字与图片一起留下。";
  await page.getByRole("textbox", { name: "快速随记正文" }).fill(body);
  await expect(page.getByText("发生时间", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 844 });
  await noOverflow(page);
  const png = await readFile(new URL("../public/pwa-192.png", import.meta.url));
  await page.locator(".quick-note-tools input[type=file]").setInputFiles({ name: "test.png", mimeType: "image/png", buffer: png });
  await expect(page.locator(".quick-note-images img")).toHaveCount(1);
  await page.getByRole("button", { name: "发布随记", exact: true }).click();
  await expect(page.locator(".home-feed-entry").first()).toContainText(body);
  await expect(page.locator(".home-feed-entry").first().locator("img.home-feed-media")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "快速随记正文" })).toHaveValue("");
  await noOverflow(page);
  await page.reload();
  await expect(page.locator(".home-feed-entry").first()).toContainText(body);
  await expect(page.locator(".home-feed-entry").first().locator("img.home-feed-media")).toHaveCSS("filter", "none");
});

test("home keeps empty and failed feeds usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let fail = true;
  await page.route("**/api/v1/home/feed?**", (route) => route.fulfill({
    status: fail ? 503 : 200, contentType: "application/json",
    body: JSON.stringify(fail ? { error: { code: "UNAVAILABLE", message: "暂时无法读取记录" } } : { data: { items: [], has_more: false, next_cursor: "", memory_interlude: null } }),
  }));
  await login(page);
  await expect(page.getByRole("alert")).toContainText("暂时无法读取记录");
  fail = false;
  await page.getByRole("button", { name: "重新读取" }).click();
  await expect(page.getByRole("heading", { name: "时间流还是空的" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "快速随记正文" })).toBeVisible();
  await noOverflow(page);
});

test("a memory interlude appears once after three entries and adapts to a short feed", async ({ page }) => {
  let count = 5;
  const memory = {
    month: 9, day: 7, total: 1,
    items: [{ ...seededItems[0], memory_year: 2025, years_ago: 1 }],
  };
  await page.route("**/api/v1/home/feed?**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ data: { items: seededItems.slice(0, count), has_more: false, next_cursor: "", memory_interlude: memory } }),
  }));
  await login(page);
  await expect(page.locator(".home-feed-memory")).toHaveCount(1);
  expect(await page.locator(".home-feed-stream > *").evaluateAll((nodes) => nodes.findIndex((node) => node.classList.contains("home-feed-interlude-row")))).toBe(3);
  count = 1;
  await page.reload();
  await expect(page.locator(".home-feed-entry")).toHaveCount(1);
  await expect(page.locator(".home-feed-memory")).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 844 });
  await noOverflow(page);
});

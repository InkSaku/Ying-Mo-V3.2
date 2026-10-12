import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const account = { username: "reading_layout_e2e", password: "password123" };
const coverPath = fileURLToPath(new URL("../public/pwa-192.png", import.meta.url));
const quietTitle = "训练集、验证集、测试集，训练误差、泛化误差与 VC 维";
let quietRecord;

async function login(page) {
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill(account.username);
  await page.getByLabel("密码").fill(account.password);
  await page.getByRole("button", { name: /登录，继续书写/ }).click();
  await expect(page).toHaveURL(/\/home/);
}

async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

test.beforeAll(async ({ request }) => {
  const registered = await request.post("/api/v1/auth/register", { data: {
    ...account,
    nickname: "阅读页验收",
    email: "reading-layout@example.com",
    invite_code: "e2e-invite",
  } });
  expect(registered.status()).toBe(201);
  const { access_token: token } = (await registered.json()).data;
  const headers = { Authorization: `Bearer ${token}` };
  const uploaded = await request.post("/api/v1/uploads/images", {
    headers,
    multipart: {
      file: { name: "reading-cover.png", mimeType: "image/png", buffer: await readFile(coverPath) },
    },
  });
  expect(uploaded.status()).toBe(201);
  const cover = (await uploaded.json()).data;
  const draft = await request.post("/api/v1/posts", { headers, data: {
    post_type: "article",
    visibility: "login_only",
    title: "在缓慢阅读里，重新看见日常的纹理",
    summary: "从一次普通散步开始，记录那些容易被速度忽略的细节，也为未来保留可以返回的入口。",
    cover_media_id: cover.id,
    body: "## 从一条熟悉的路开始\n\n我们以为自己熟悉一条路，只是因为已经走过许多次。真正慢下来以后，树影、风声和店铺门口的光才重新变得具体。\n\n## 记录不是保存答案\n\n记录更像是在时间里留下坐标。它并不要求每一刻都有结论，只需要诚实地承认当时看见了什么。\n\n### 给未来的入口\n\n多年以后重新读到这些句子，我们返回的并不是原样的过去，而是另一种理解过去的方式。\n\n## 继续慢慢生活\n\n写作和阅读都不必急着抵达。让注意力留在具体的事物上，日常就会显露出自己的层次。",
  } });
  expect(draft.status()).toBe(201);
  const { id } = (await draft.json()).data;
  const published = await request.post(`/api/v1/posts/${id}/publish`, {
    headers,
    data: { slug: "reading-layout-e2e" },
  });
  expect(published.ok()).toBeTruthy();

  const noCoverDraft = await request.post("/api/v1/posts", { headers, data: {
    post_type: "article",
    visibility: "login_only",
    title: "关于一次临时起意的出发（29）",
    summary: "出发的时候并没有完整计划。我们只记下了一个方向，然后把剩下的部分交给天气和脚步。",
    body: "## 在路上重新决定\n\n很多出发并不需要完整答案，只需要给今天留下一个清楚的方向。\n\n## 把未知留在途中\n\n没有写进计划的部分，也会成为故事真正开始的地方。",
  } });
  expect(noCoverDraft.status()).toBe(201);
  const noCover = (await noCoverDraft.json()).data;
  const noCoverPublished = await request.post(`/api/v1/posts/${noCover.id}/publish`, {
    headers,
    data: { slug: "reading-layout-no-cover-e2e" },
  });
  expect(noCoverPublished.ok()).toBeTruthy();

  const quietDraft = await request.post("/api/v1/posts", { headers, data: {
    post_type: "article", visibility: "login_only", title: quietTitle,
    summary: "先分清三种数据各自负责什么，再理解模型如何从已见的数据走向未见的数据。",
    body: `# ${quietTitle}\n\n## 1. 数据集的划分\n\n在机器学习与深度学习中，通常会把数据划分为：\n\n- 训练集（Training Set）\n- 验证集（Validation Set）\n- 测试集（Test Set）\n\n三者承担不同的作用。\n\n## 2. 训练集（Training Set）\n\n训练集用于拟合模型的参数。\n\n### 定义\n\n模型在这部分数据上学习输入与输出之间的关系。\n\n#### 核心作用\n\n把训练数据看成学习时翻过的书页。\n\n## 3. 验证集（Validation Set）\n\n验证集帮助我们比较不同的模型设置。\n\n### 参数选择\n\n观察模型面对未参与训练的数据时的表现。\n\n## 4. 测试集（Test Set）\n\n测试集用于评估最终模型的表现。`,
  } });
  expect(quietDraft.status()).toBe(201);
  quietRecord = (await quietDraft.json()).data;
  const quietPublished = await request.post(`/api/v1/posts/${quietRecord.id}/publish`, { headers, data: { slug: "reading-quiet-e2e" } });
  expect(quietPublished.ok()).toBeTruthy();
  quietRecord = (await quietPublished.json()).data;
});

test("long title without a cover remains in the main reading column", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/articles/reading-layout-no-cover-e2e");

  await expect(page.getByRole("heading", { level: 1, name: "关于一次临时起意的出发（29）" })).toBeVisible();
  await expect(page.locator(".article-detail-cover-frame")).toHaveCount(0);
  const desktop = await page.evaluate(() => {
    const heading = document.querySelector(".article-detail-heading").getBoundingClientRect();
    const body = document.querySelector(".article-reading-column").getBoundingClientRect();
    const title = document.querySelector(".article-detail-heading h1").getBoundingClientRect();
    return { heading, body, title };
  });
  expect(desktop.heading.left).toBeCloseTo(desktop.body.left, 0);
  expect(desktop.heading.width).toBeGreaterThan(600);
  expect(desktop.title.height).toBeLessThan(260);
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("reading-no-cover-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileTitle = await page.locator(".article-detail-heading h1").boundingBox();
  expect(mobileTitle.width).toBeGreaterThan(300);
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("reading-no-cover-mobile.png"), fullPage: true });
});

test("reading page forms a complete editorial opening and a focused reading column", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/articles/reading-layout-e2e");

  await expect(page.locator(".article-detail-cover-frame img")).toBeVisible();
  await expect(page.locator(".article-toc-list a")).toHaveCount(4);
  await expect(page.locator(".article-toc-list a:visible")).toHaveCount(3);
  await page.getByRole("button", { name: "展开子标题" }).click();
  await expect(page.locator(".article-toc-list a:visible")).toHaveCount(4);
  const geometry = await page.evaluate(() => {
    const cover = document.querySelector(".article-detail-cover-frame").getBoundingClientRect();
    const heading = document.querySelector(".article-detail-heading").getBoundingClientRect();
    const toc = document.querySelector(".article-toc").getBoundingClientRect();
    const body = document.querySelector(".article-reading-column").getBoundingClientRect();
    const rail = document.querySelector(".article-reading-rail").getBoundingClientRect();
    return { cover, heading, toc, body, rail };
  });
  expect(geometry.cover.width).toBeCloseTo(geometry.heading.width, 0);
  expect(geometry.cover.top).toBeGreaterThan(geometry.heading.bottom);
  expect(geometry.toc.right).toBeLessThan(geometry.body.left);
  expect(geometry.body.width).toBeGreaterThanOrEqual(760);
  expect(geometry.body.width).toBeLessThanOrEqual(820);
  expect(geometry.body.right).toBeLessThan(geometry.rail.left);
  await expect(page.locator(".article-reading-rail")).toContainText("已读");
  await expect(page.locator(".article-toc-list a[aria-current='location']")).toContainText("从一条熟悉的路开始");
  await expect(page.locator(".article-reading-companion")).toContainText("慢慢读");
  await expect(page.locator(".article-reading-cat-runner")).toHaveAttribute("data-direction", "right");
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("reading-desktop.png"), fullPage: true });

  const catStart = await page.locator(".article-reading-cat-runner").boundingBox();
  await page.evaluate(() => {
    const column = document.querySelector(".article-reading-content");
    const top = column.getBoundingClientRect().top + window.scrollY;
    const range = Math.max(0, column.scrollHeight - window.innerHeight);
    window.scrollTo(0, top + range * .72);
  });
  await expect.poll(async () => Number.parseInt(await page.locator(".article-reading-rail-value strong").textContent(), 10)).toBeGreaterThan(50);
  await expect(page.locator(".article-reading-cat-runner")).toHaveAttribute("data-running", "false");
  const catLater = await page.locator(".article-reading-cat-runner").boundingBox();
  expect(catLater.x).toBeGreaterThan(catStart.x + 24);
  await page.screenshot({ path: testInfo.outputPath("reading-companion-desktop.png") });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileOrder = await page.evaluate(() => {
    const top = (selector) => document.querySelector(selector).getBoundingClientRect().top;
    return [top(".article-toc"), top(".article-detail-heading"), top(".article-detail-cover-frame"), top(".article-reading-column .prose")];
  });
  expect(mobileOrder).toEqual([...mobileOrder].sort((a, b) => a - b));
  await expect(page.getByRole("button", { name: /文章目录/ })).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("reading-mobile.png"), fullPage: true });

  for (const width of [320, 390, 768, 1024, 1101, 1199, 1200, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoOverflow(page);
  }
});

test("reading panels resize from both edges, enforce minimums and remember widths", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/articles/reading-layout-e2e");
  const left = page.getByRole("separator", { name: "调整目录与正文宽度" });
  const right = page.getByRole("separator", { name: "调整正文与阅读进度宽度" });
  const widths = () => page.evaluate(() => Object.fromEntries([
    ["toc", ".article-toc"], ["content", ".article-reading-column"], ["rail", ".article-reading-rail"],
  ].map(([key, selector]) => [key, document.querySelector(selector).getBoundingClientRect().width])));
  async function drag(handle, delta) {
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, Math.max(120, box.y + 80));
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + delta, Math.max(120, box.y + 80), { steps: 8 });
    await page.mouse.up();
  }
  await expect(left).toBeVisible();
  const initial = await widths();
  await drag(left, 80);
  expect((await widths()).toc).toBeCloseTo(initial.toc + 80, 0);
  expect((await widths()).content).toBeCloseTo(initial.content - 80, 0);
  await drag(right, -60);
  expect((await widths()).rail).toBeCloseTo(initial.rail + 60, 0);
  await drag(left, 1200);
  expect((await widths()).content).toBeCloseTo(480, 0);
  await drag(right, 1200);
  expect((await widths()).rail).toBeCloseTo(160, 0);
  await drag(left, -1200);
  expect((await widths()).toc).toBeCloseTo(180, 0);
  await left.focus();
  await page.keyboard.press("ArrowRight");
  expect((await widths()).toc).toBeCloseTo(190, 0);
  const saved = await widths();
  await page.reload();
  await expect(left).toBeVisible();
  expect((await widths()).toc).toBeCloseTo(saved.toc, 0);
  expect((await widths()).rail).toBeCloseTo(saved.rail, 0);
  await left.focus();
  await page.keyboard.press("End");
  await right.focus();
  await page.keyboard.press("End");
  await page.setViewportSize({ width: 1920, height: 1000 });
  await left.focus();
  await page.keyboard.press("End");
  await page.setViewportSize({ width: 1360, height: 1000 });
  await expect.poll(async () => (await widths()).content).toBeGreaterThanOrEqual(479.9);
  expect((await widths()).toc).toBeGreaterThanOrEqual(179.9);
  expect((await widths()).rail).toBeGreaterThanOrEqual(159.9);
  await expectNoOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(left).toBeHidden();
  await expect(right).toBeHidden();
  await expect(page.getByRole("button", { name: /文章目录/ })).toBeVisible();
  await expectNoOverflow(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await left.scrollIntoViewIfNeeded();
  await left.dblclick({ position: { x: 8, y: 80 } });
  await expect.poll(async () => (await widths()).toc).toBeCloseTo(initial.toc, 0);
  expect((await widths()).content).toBeCloseTo(initial.content, 0);
  expect((await widths()).rail).toBeCloseTo(initial.rail, 0);
});

test("articles without a table of contents can still resize the right panel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.route("**/api/v1/posts/slug/reading-layout-no-cover-e2e", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.outline = [];
    await route.fulfill({ response, json: body });
  });
  await page.goto("/articles/reading-layout-no-cover-e2e");
  await expect(page.locator(".article-toc")).toHaveCount(0);
  const right = page.getByRole("separator", { name: "调整正文与阅读进度宽度" });
  await expect(right).toBeVisible();
  await right.focus();
  await page.keyboard.press("Home");
  await expect(right).toHaveAttribute("aria-valuenow", "160");
  await expectNoOverflow(page);
});

test("quiet reading preserves deep headings, favorite state, font preferences and the original cat", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("yingmo_theme", "system"));
  await page.setViewportSize({ width: 1680, height: 1120 });
  await login(page);
  await page.goto("/articles/reading-quiet-e2e");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(quietTitle);
  await page.mouse.move(0, 0);
  for (const indicator of await page.locator(".article-panel-divider > span").all()) await expect(indicator).toHaveCSS("opacity", "0");
  const links = page.locator(".article-toc-list a:visible");
  await expect(links).toHaveCount(4);
  await page.getByRole("button", { name: "展开子标题" }).click();
  await expect(links).toHaveCount(7);
  const child = page.getByRole("navigation", { name: "正文目录" }).getByRole("link", { name: "定义", exact: true });
  const href = await child.getAttribute("href");
  await child.click();
  await expect(page).toHaveURL((url) => url.hash === href);
  await expect(child).toHaveAttribute("aria-current", "location");
  await page.getByRole("button", { name: "收起子标题" }).click();
  await expect(page.locator(".article-toc-list a[aria-current='location']")).toHaveText("2. 训练集（Training Set）");
  await page.reload();
  await expect(page.getByRole("heading", { name: "定义", exact: true })).toBeInViewport();

  const favorite = page.locator(".article-reading-favorite");
  await expect(favorite).toBeEnabled();
  await favorite.click();
  await expect(favorite).toHaveAttribute("aria-pressed", "true");
  const footerFavorite = page.locator(".interaction-favorite-row button");
  await expect(footerFavorite).toHaveAttribute("aria-pressed", "true");
  await footerFavorite.click();
  await expect(favorite).toHaveAttribute("aria-pressed", "false");
  const settings = page.locator(".article-reading-settings > summary");
  await settings.click();
  await page.getByRole("button", { name: "增大阅读字号", exact: true }).click();
  await expect(page.locator(".article-reading-column .prose")).toHaveCSS("font-size", "20px");
  await page.reload();
  await expect(page.locator(".article-reading-column .prose")).toHaveCSS("font-size", "20px");
  await settings.click();
  await page.getByRole("button", { name: "恢复默认字号" }).click();
  await expect(page.locator(".article-reading-column .prose")).toHaveCSS("font-size", "19px");
  await page.getByRole("button", { name: "换成深色纸" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "换成浅色纸" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "回到篇首" }).click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: testInfo.outputPath("reading-quiet-fullpage.png"), fullPage: true });
  await page.evaluate(() => {
    const layout = document.querySelector(".article-reading-layout");
    const header = document.querySelector(".app-header");
    window.scrollTo({ top: Math.max(0, layout.getBoundingClientRect().top + scrollY - header.offsetHeight - 32), behavior: "instant" });
  });
  await page.screenshot({ path: testInfo.outputPath("reading-quiet-desktop.png") });
  const cat = page.locator(".article-reading-cat-runner");
  await expect(cat.locator(".bookroom-cat")).toHaveCount(1);
  await expect(cat).toHaveCSS("position", "absolute");
  await expect(cat).toHaveCSS("width", "104px");
  await expect(cat).toHaveCSS("height", "64px");
  await expect(cat.locator(".archive-cat-outline").first()).toHaveCSS("fill", "none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(cat.locator(".archive-cat-pose").first()).toHaveCSS("animation-name", "none");
  for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width: 1680, height: 1000 });
    if (await page.locator("html").getAttribute("data-theme") !== theme) {
      await settings.click();
      await page.getByRole("button", { name: theme === "dark" ? "换成深色纸" : "换成浅色纸" }).click();
      await page.keyboard.press("Escape");
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (const width of [1680, 1440, 1360, 1200, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectNoOverflow(page);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByRole("button", { name: /文章目录/ }).click();
  await expect(links).toHaveCount(4);
  await page.getByRole("button", { name: "展开子标题" }).click();
  await child.click();
  await expect(page).toHaveURL((url) => url.hash === href);
  await expect(page.locator(".article-toc-list")).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("reading-quiet-mobile-dark.png"), fullPage: true, style: ".app-header, .mobile-bottom-nav { visibility: hidden !important; }" });
  const reloaded = page.waitForResponse((response) => response.url().includes("/posts/slug/reading-quiet-e2e") && response.request().method() === "GET");
  await page.reload();
  const response = await reloaded;
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).data.body).toContain(`# ${quietTitle}`);
});

import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const account = { username: "reading_layout_e2e", password: "password123" };
const coverPath = fileURLToPath(new URL("../public/pwa-192.png", import.meta.url));

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
});

test("long title without a cover remains in the main reading column", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/articles/reading-layout-no-cover-e2e");

  await expect(page.getByRole("heading", { level: 1, name: "关于一次临时起意的出发（29）" })).toBeVisible();
  await expect(page.locator(".article-detail-cover-frame")).toHaveCount(0);
  const desktop = await page.evaluate(() => {
    const heading = document.querySelector(".article-detail-heading").getBoundingClientRect();
    const margin = document.querySelector(".article-detail-margin").getBoundingClientRect();
    const title = document.querySelector(".article-detail-heading h1").getBoundingClientRect();
    return { heading, margin, title };
  });
  expect(desktop.heading.left).toBeGreaterThan(desktop.margin.right);
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
  await expect(page.locator(".article-reading-start")).toContainText("READ FROM HERE");
  const geometry = await page.evaluate(() => {
    const cover = document.querySelector(".article-detail-cover-frame").getBoundingClientRect();
    const heading = document.querySelector(".article-detail-heading").getBoundingClientRect();
    const toc = document.querySelector(".article-toc").getBoundingClientRect();
    const body = document.querySelector(".article-reading-column").getBoundingClientRect();
    const rail = document.querySelector(".article-reading-rail").getBoundingClientRect();
    return { cover, heading, toc, body, rail };
  });
  expect(geometry.cover.width).toBeGreaterThan(geometry.heading.width);
  expect(geometry.cover.top).toBeGreaterThan(geometry.heading.bottom);
  expect(geometry.toc.right).toBeLessThan(geometry.body.left);
  expect(geometry.body.width).toBeGreaterThanOrEqual(760);
  expect(geometry.body.width).toBeLessThanOrEqual(820);
  expect(geometry.body.right).toBeLessThan(geometry.rail.left);
  await expect(page.locator(".article-reading-rail")).toContainText("已读");
  await expect(page.locator(".article-reading-rail-current")).toContainText("从一条熟悉的路开始");
  await expect(page.locator(".article-reading-companion")).toContainText("慢慢读");
  await expect(page.locator(".article-reading-cat-runner")).toHaveAttribute("data-direction", "right");
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("reading-desktop.png"), fullPage: true });

  const catStart = await page.locator(".article-reading-cat-runner").boundingBox();
  await page.evaluate(() => {
    const column = document.querySelector(".article-reading-column");
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
    return [top(".article-detail-heading"), top(".article-detail-cover-frame"), top(".article-toc"), top(".article-reading-column")];
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

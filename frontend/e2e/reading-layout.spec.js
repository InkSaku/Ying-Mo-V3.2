import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const account = { username: "reading_layout_e2e", password: "password123" };
const coverPath = fileURLToPath(new URL("../public/pwa-192.png", import.meta.url));

async function login(page) {
  await page.goto("/login");
  await page.getByPlaceholder("请输入用户名或邮箱").fill(account.username);
  await page.getByPlaceholder("请输入密码").fill(account.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
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
});

test("reading page keeps the cover, title, contents and body on one editorial grid", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/articles/reading-layout-e2e");

  await expect(page.locator(".article-detail-cover-frame img")).toBeVisible();
  await expect(page.locator(".article-toc-list a")).toHaveCount(4);
  const geometry = await page.evaluate(() => {
    const cover = document.querySelector(".article-detail-cover-frame").getBoundingClientRect();
    const heading = document.querySelector(".article-detail-heading").getBoundingClientRect();
    const toc = document.querySelector(".article-toc").getBoundingClientRect();
    const body = document.querySelector(".article-reading-column").getBoundingClientRect();
    return { cover, heading, toc, body };
  });
  expect(geometry.cover.right).toBeLessThan(geometry.heading.left);
  expect(geometry.toc.right).toBeLessThan(geometry.body.left);
  expect(Math.abs(geometry.heading.left - geometry.body.left)).toBeLessThan(2);
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("reading-desktop.png"), fullPage: true });

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

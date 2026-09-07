import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const account = { username: "articles_layout_e2e", password: "password123" };
const coverPaths = ["coast.jpg", "train.jpg", "desk.jpg"].map((name) => (
  fileURLToPath(new URL(`../src/assets/home/${name}`, import.meta.url))
));

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
    nickname: "文章目录验收",
    email: "articles-layout@example.com",
    invite_code: "e2e-invite",
  } });
  expect(registered.status()).toBe(201);
  const { access_token: token } = (await registered.json()).data;
  const headers = { Authorization: `Bearer ${token}` };
  const covers = [];
  for (const [index, path] of coverPaths.entries()) {
    const uploaded = await request.post("/api/v1/uploads/images", {
      headers,
      multipart: {
        file: { name: `article-cover-${index}.jpg`, mimeType: "image/jpeg", buffer: await readFile(path) },
      },
    });
    expect(uploaded.status()).toBe(201);
    covers.push((await uploaded.json()).data);
  }

  const titles = [
    "在海风抵达以前，重新整理生活的次序",
    "把漫长的通勤变成一段可以阅读的时间",
    "书桌旁的下午，以及那些没有完成的计划",
    "沿着旧地图寻找一条正在消失的街道",
    "慢下来以后，日常才重新显出纹理",
    "关于记录、遗忘与再次返回",
    "雨夜里的书店仍然亮着灯",
    "从一封旧信开始理解时间",
    "散步是城市给予人的另一种阅读",
    "留一点空白，让生活自己发生",
    "我们如何记住一段共同经历",
    "写在季节转换的那一天",
  ];
  for (const [index, title] of titles.entries()) {
    const draft = await request.post("/api/v1/posts", { headers, data: {
      post_type: "article",
      visibility: "login_only",
      title,
      summary: "记录具体的感受、道路与光线，让一次普通的阅读成为可以返回的生活坐标。",
      body: "## 从这里开始\n\n生活的层次常常藏在被速度忽略的地方。\n\n## 继续阅读\n\n慢一点，也许就能看见更多。",
      ...(covers[index - 9] ? { cover_media_id: covers[index - 9].id } : {}),
    } });
    expect(draft.status()).toBe(201);
    const { id } = (await draft.json()).data;
    const published = await request.post(`/api/v1/posts/${id}/publish`, {
      headers,
      data: { slug: `articles-layout-${index}` },
    });
    expect(published.ok()).toBeTruthy();
  }
});

test("Articles presents a clear opening story, recommendation rail and readable index", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page);
  await page.goto("/articles");

  await expect(page.getByRole("heading", { name: /文章/ }).first()).toBeVisible();
  await expect(page.locator(".article-magazine-opening-label")).toContainText("本页首篇");
  await expect(page.locator(".articles-lead-story")).toHaveCount(1);
  await expect(page.locator(".articles-margin-story")).toHaveCount(2);
  await expect(page.locator(".articles-index-row")).toHaveCount(9);
  await expect(page.locator(".articles-lead-visual .card-cover")).toBeVisible();
  await expect(page.locator(".article-magazine-grid .post-card")).toHaveCount(0);

  const layout = await page.evaluate(() => {
    const lead = document.querySelector(".article-magazine-opening-main").getBoundingClientRect();
    const rail = document.querySelector(".article-magazine-rail").getBoundingClientRect();
    const pageBox = document.querySelector(".browse-page-article").getBoundingClientRect();
    return { lead, rail, pageBox };
  });
  expect(layout.lead.right).toBeLessThan(layout.rail.left);
  expect(layout.pageBox.width).toBeLessThanOrEqual(1120);
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("articles-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: /展开/ })).toBeVisible();
  await page.getByRole("button", { name: /展开/ }).click();
  await expect(page.locator(".post-filters-controls")).toHaveClass(/is-open/);
  const mobileOrder = await page.evaluate(() => {
    const lead = document.querySelector(".article-magazine-opening-main").getBoundingClientRect();
    const rail = document.querySelector(".article-magazine-rail").getBoundingClientRect();
    return { lead, rail };
  });
  expect(mobileOrder.lead.bottom).toBeLessThanOrEqual(mobileOrder.rail.top);
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("articles-mobile.png"), fullPage: true });

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoOverflow(page);
  }
});

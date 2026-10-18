import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const runId = Date.now().toString(36);
const account = { username: `paper_motion_${runId}`, password: "password123" };
let creator;

async function login(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill(account.username);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
  await page.emulateMedia({ reducedMotion: "no-preference" });
}

async function recordMotion(page) {
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    window.paperMotions = [];
    Element.prototype.animate = function (frames, options) {
      window.paperMotions.push({ className: this.className, frames, duration: options?.duration });
      return animate.call(this, frames, options);
    };
  });
}

async function mockCollection(page, { fail = false, delay = 0 } = {}) {
  const book = { id: 991, slug: "paper-book", name: "海边手册", description: "一起留下的海边片段。", creator,
    members: [], posts: [], highlights: [], member_count: 1, updated_at: "2026-09-08T08:00:00Z" };
  await page.route("**/api/v1/collections?*", (route) => route.fulfill({ json: { data: [book], meta: { pagination: { page: 1, total: 1, total_pages: 1, page_size: 20 } } } }));
  await page.route("**/api/v1/collections/paper-book", async (route) => {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    await route.fulfill(fail ? { status: 500, json: { error: { message: "暂时无法打开这一本" } } } : { json: { data: book } });
  });
  await page.route("**/api/v1/collections/paper-book/timeline?*", (route) => route.fulfill({ json: { data: { items: [] }, meta: {} } }));
  await page.route("**/api/v1/collections/991/notification-preference", (route) => route.fulfill({ json: { data: { level: "all" } } }));
}

test.beforeAll(async ({ request }) => {
  const registered = await request.post("/api/v1/auth/register", { data: {
    ...account, nickname: "纸上动作验收", email: `${account.username}@example.com`, invite_code: "e2e-invite",
  } });
  expect(registered.status()).toBe(201);
  const data = (await registered.json()).data;
  creator = data.user;
  for (const name of ["train.jpg", "coast.jpg"]) {
    const upload = await request.post("/api/v1/uploads/images", { headers: { Authorization: `Bearer ${data.access_token}` }, multipart: {
      file: { name, mimeType: "image/jpeg", buffer: await readFile(new URL(`../src/assets/home/${name}`, import.meta.url)) },
    } });
    expect(upload.status()).toBe(201);
  }
});

test("collection opening follows the selected book and cleans up on completion, interruption and errors", async ({ page }) => {
  await recordMotion(page);
  await login(page);
  await mockCollection(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/collections");
    await page.getByRole("link", { name: "打开合集：海边手册" }).click();
    await expect(page.getByRole("heading", { name: "海边手册", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.paperMotions.filter((item) => item.className === "paper-opening-cover").length)).toBeGreaterThan(0);
    await expect(page.locator(".paper-motion-layer")).toHaveCount(0);
    expect(await page.locator("#root").getAttribute("inert")).toBeNull();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  await page.goto("/collections");
  await page.getByRole("link", { name: "海边手册", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".paper-motion-layer")).toHaveCount(0);
  await page.goto("/collections");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("link", { name: "打开合集：海边手册" }).click();
  await expect(page.getByRole("heading", { name: "海边手册", exact: true })).toBeVisible();
  await expect(page.locator(".paper-motion-layer")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await mockCollection(page, { fail: true });
  await page.goto("/collections");
  await page.getByRole("link", { name: "打开合集：海边手册" }).click();
  await expect(page.getByRole("button", { name: "重新加载" })).toBeVisible();
  await expect(page.locator(".paper-motion-layer")).toHaveCount(0);
});

test("photos lift without distortion, return to the current thumbnail and restore keyboard focus", async ({ page }) => {
  await recordMotion(page);
  await login(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/me/media");
    const thumbs = page.locator(".media-library-grid .media-lightbox-trigger");
    await expect(thumbs).toHaveCount(2);
    await thumbs.first().locator("img").evaluate((image) => image.decode());
    await thumbs.first().click();
    await expect(page.locator(".media-lightbox-slide-current img")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.paperMotions.filter((item) => item.className === "paper-moving-photo").length)).toBeGreaterThan(0);
    await expect(page.locator(".paper-motion-layer")).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".media-lightbox-toolbar p")).toHaveText("2 / 2");
    await page.locator(".media-lightbox-slide-current img").evaluate((image) => image.decode());
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "媒体灯箱" })).toHaveCount(0);
    await expect(thumbs.first()).toBeFocused();
    await expect(page.locator(".paper-motion-layer")).toHaveCount(0);
    await expect(page.locator("#root")).not.toHaveAttribute("inert");
    await expect(thumbs.nth(1).locator("img")).toHaveCSS("visibility", "visible");
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    const photoFrames = await page.evaluate(() => window.paperMotions.filter((item) => item.className === "paper-moving-photo").flatMap((item) => item.frames));
    expect(photoFrames.every((frame) => !frame.transform.match(/scale\([^)]*,/))).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".media-library-grid .media-lightbox-trigger").first().click();
  await expect(page.getByRole("dialog", { name: "媒体灯箱" })).toBeVisible();
  await expect(page.locator(".paper-motion-layer")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "媒体灯箱" })).toHaveCount(0);
});

test("the home note unfolds, retains drafts, reports failure and settles into the feed only after publication", async ({ page }) => {
  await recordMotion(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const prompt = page.locator(".home-prompt-activate");
  await prompt.click();
  const input = page.getByRole("textbox", { name: "快速随记正文" });
  await expect(input).toBeFocused();
  const body = `便笺展开与收起仍保留文字 ${Date.now()}`;
  await input.fill(body);
  await page.getByRole("button", { name: "收起", exact: true }).click();
  await expect(prompt).toBeFocused();
  await expect(prompt).toContainText("继续写");
  await prompt.click();
  await expect(input).toHaveValue(body);
  await page.route("**/api/v1/posts/*/publish", (route) => route.fulfill({ status: 500, json: { error: { message: "发布失败，请重试" } } }));
  await page.getByRole("button", { name: "发布随记", exact: true }).click();
  await expect(page.locator(".quick-note-status [role=alert]")).toBeVisible();
  await expect(input).toHaveValue(body);
  await expect(page.locator(".home-feed")).not.toContainText(body);
  await page.unroute("**/api/v1/posts/*/publish");
  await page.getByRole("button", { name: "发布随记", exact: true }).click();
  await expect(prompt).toBeFocused();
  await expect(page.locator(".home-feed-entry").first()).toContainText(body);
  await expect(page.getByRole("status").filter({ hasText: "随记已发布" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => window.paperMotions.some((item) => String(item.className).includes("quick-note-composer")))).toBe(true);
});

test("the review page supports both themes and narrow layouts with replayable real motion", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("yingmo_theme", "light");
    const original = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const animation = original.call(this, frames, options);
      if (window.freezePaperMotion && this.closest(".paper-motion-layer")) { animation.pause(); animation.currentTime = 80; }
      return animation;
    };
  });
  await page.goto("/dev/paper-motion");
  await expect(page.getByRole("heading", { name: "把动作，留在纸上。" })).toBeVisible();
  const finishCopies = () => page.evaluate(() => {
    window.freezePaperMotion = false;
    document.getAnimations().filter((animation) => animation.effect?.target?.closest?.(".paper-motion-layer")).forEach((animation) => animation.finish());
  });
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") {
      await page.getByRole("button", { name: /当前主题/ }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(page.locator("html")).not.toHaveAttribute("data-theme-ink");
    }
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      if (width === 1440 || width === 390) {
        await page.screenshot({ path: testInfo.outputPath(`paper-motion-${theme}-${width}.png`), fullPage: true });
        await page.getByRole("button", { name: "打开示例合集" }).scrollIntoViewIfNeeded();
        await page.evaluate(() => { window.freezePaperMotion = true; });
        await page.getByRole("button", { name: "打开示例合集" }).click();
        await expect(page.locator(".paper-opening-cover")).toHaveCount(1);
        await page.screenshot({ path: testInfo.outputPath(`book-opening-${theme}-${width}.png`) });
        await finishCopies();
        await page.getByRole("button", { name: "放回书架" }).click();
        await page.getByRole("button", { name: "拿起示例照片" }).scrollIntoViewIfNeeded();
        await page.evaluate(() => { window.freezePaperMotion = true; });
        await page.getByRole("button", { name: "拿起示例照片" }).click();
        await expect(page.locator(".paper-moving-photo")).toHaveCount(1);
        await page.screenshot({ path: testInfo.outputPath(`photo-lift-${theme}-${width}.png`) });
        await finishCopies();
        await page.getByRole("button", { name: "放回原处 ↙" }).click();
        await expect(page.locator(".paper-motion-layer")).toHaveCount(0);
        await page.getByRole("button", { name: /今天想记住什么/ }).click();
        const writing = page.getByRole("textbox", { name: "写随记" });
        await expect(writing).toBeFocused();
        await writing.fill("写下的这一点，收起后也在。" );
        await page.screenshot({ path: testInfo.outputPath(`note-open-${theme}-${width}.png`) });
        await page.getByRole("button", { name: "收起", exact: true }).click();
        await page.evaluate(() => window.scrollTo(0, 0));
      }
    }
  }
});

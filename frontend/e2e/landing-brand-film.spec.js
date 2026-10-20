import { expect, test } from "@playwright/test";

const filmPath = "/brand-film/yingmo-brand-film-web.mp4";

test("film loads only on a keyboard gesture and plays inline with native controls", async ({ page }, testInfo) => {
  const requests = [];
  page.on("request", (request) => { if (request.url().includes(filmPath)) requests.push(request.url()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /让记忆，\s*慢慢展开。/ })).toBeVisible();
  const video = page.locator(".landing-film-video");
  await expect(video).not.toHaveAttribute("src");
  await expect(video).toHaveAttribute("preload", "none");
  await expect(video).toHaveAttribute("playsinline", "");
  expect(requests).toHaveLength(0);
  await expect(page.locator(".landing-details + .landing-film + .landing-colophon")).toHaveCount(1);
  const play = page.getByRole("button", { name: "播放影片", exact: true });
  await page.evaluate(() => {
    document.querySelector(".landing-film-play").addEventListener("click", () => { window.filmClickedAt = performance.now(); }, { once: true });
    document.querySelector("video").addEventListener("playing", () => { window.filmPlayingAt = performance.now(); }, { once: true });
  });
  await play.focus();
  await page.keyboard.press("Enter");
  await expect(video).toHaveJSProperty("paused", false);
  await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(.1);
  await expect(video).toHaveJSProperty("controls", true);
  await expect(video).toHaveJSProperty("loop", false);
  await expect(video).toBeFocused();
  expect(requests.length).toBeGreaterThan(0);
  await video.evaluate((element) => element.pause());
  await expect(video).toHaveJSProperty("paused", true);
  await video.evaluate((element) => element.requestFullscreen());
  await expect.poll(() => video.evaluate((element) => document.fullscreenElement === element)).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await video.evaluate((element) => { element.currentTime = 9.3; });
  await expect.poll(() => video.evaluate((element) => element.seeking)).toBe(false);
  expect(await video.evaluate((element) => element.videoWidth / element.videoHeight)).toBeCloseTo(1.25);
  await video.evaluate((element) => { element.currentTime = element.duration - .12; return element.play(); });
  await expect.poll(() => video.evaluate((element) => element.ended)).toBe(true);
  await expect(video).toHaveJSProperty("paused", true);
  const performanceResult = await page.evaluate(() => ({
    clickToPlayingMs: window.filmPlayingAt - window.filmClickedAt,
    mediaResources: performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/brand-film/")).map((entry) => ({ name: new URL(entry.name).pathname, durationMs: entry.duration, transferBytes: entry.transferSize })),
    frameQuality: document.querySelector("video").getVideoPlaybackQuality().toJSON?.() || { totalFrames: document.querySelector("video").getVideoPlaybackQuality().totalVideoFrames, droppedFrames: document.querySelector("video").getVideoPlaybackQuality().droppedVideoFrames },
  }));
  await testInfo.attach("playback-performance", { body: JSON.stringify(performanceResult, null, 2), contentType: "application/json" });
  await page.getByRole("link", { name: "进入映墨", exact: true }).click();
  await expect(page.getByLabel("用户名或邮箱")).toBeVisible();
});

test("a failed film offers retry and leaves invitation registration usable", async ({ page }) => {
  let fail = true;
  await page.route(`**${filmPath}`, (route) => fail ? route.abort() : route.continue());
  await page.goto("/");
  await page.getByRole("button", { name: "播放影片", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("影片暂时无法播放");
  fail = false;
  await page.getByRole("button", { name: "重新载入影片", exact: true }).click();
  await expect.poll(() => page.locator("video").evaluate((element) => element.currentTime)).toBeGreaterThan(.1);
  await page.getByRole("link", { name: "加入我们", exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByLabel("邀请码")).toBeVisible();
});

test("touch layouts preserve the complete frame and reduced motion still waits for a gesture", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce", colorScheme: "dark" });
  const page = await context.newPage();
  let requests = 0;
  page.on("request", (request) => { if (request.url().includes(filmPath)) requests += 1; });
  await page.goto("/");
  const video = page.locator("video");
  const box = await video.boundingBox();
  expect(box.width / box.height).toBeCloseTo(1.25, 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "播放影片", exact: true }).tap();
  await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(.1);
  await expect(page.locator(".landing-film")).toBeVisible();
  await expect(video).toHaveAttribute("playsinline", "");
  await context.close();
});


test("the invitation registration reached from welcome still rejects a wrong code and registers normally", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "加入我们", exact: true }).click();
  const name = `film_check_${Date.now()}`;
  await page.getByPlaceholder("例如 icesakura").fill(name);
  await page.getByPlaceholder("希望朋友怎样称呼你").fill("影片回归演示");
  await page.getByPlaceholder("name@example.com").fill(`${name}@example.com`);
  await page.getByPlaceholder("至少 8 个字符").fill("test-film-registration-123");
  await page.getByPlaceholder("请输入朋友给你的邀请码").fill("invalid-film-invite");
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/register$/);
  await page.getByPlaceholder("请输入朋友给你的邀请码").fill("e2e-invite");
  const registered = page.waitForResponse((response) => response.url().endsWith("/auth/register") && response.request().method() === "POST");
  await page.getByRole("button", { name: "注册", exact: true }).click();
  expect((await registered).status()).toBe(201);
  await expect(page).toHaveURL(/\/(?:verify-email\?registered=1|home)$/);
});

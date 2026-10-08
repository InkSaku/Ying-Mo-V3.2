import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const runId = Date.now().toString(36);
const account = { username: `lightbox_gestures_${runId}`, password: "password123" };
const imagePaths = ["coast.jpg", "train.jpg"].map((name) => fileURLToPath(new URL(`../src/assets/home/${name}`, import.meta.url)));

async function login(page) {
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill(account.username);
  await page.getByLabel("密码").fill(account.password);
  await page.getByRole("button", { name: /登录，继续书写/ }).click();
  await expect(page).toHaveURL(/\/home/);
}

async function openMedia(page) {
  await page.goto("/me/media");
  const thumbnails = page.locator(".media-library-grid .media-lightbox-trigger");
  await expect(thumbnails).toHaveCount(2);
  await thumbnails.first().click();
  await expect(page.getByRole("dialog", { name: "媒体灯箱" })).toBeVisible();
  await expect(page.locator(".media-lightbox-slide-current img")).toBeVisible();
}

test.beforeAll(async ({ request }) => {
  const registered = await request.post("/api/v1/auth/register", { data: {
    ...account,
    nickname: "图片手势验收",
    email: `lightbox-gestures-${runId}@example.com`,
    invite_code: "e2e-invite",
  } });
  expect(registered.status()).toBe(201);
  const { access_token: token } = (await registered.json()).data;
  for (const [index, path] of imagePaths.entries()) {
    const uploaded = await request.post("/api/v1/uploads/images", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { file: { name: `lightbox-${index}.jpg`, mimeType: "image/jpeg", buffer: await readFile(path) } },
    });
    expect(uploaded.status()).toBe(201);
  }
});

test("drag follows the pointer, settles back, changes image and dismisses", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 850 });
  await login(page);
  await openMedia(page);
  const viewport = page.locator(".media-lightbox-viewport");
  const track = page.locator(".media-lightbox-track");
  const box = await viewport.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const startMedia = new URL(page.url()).searchParams.get("media");

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 48, y, { steps: 4 });
  expect(await track.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m41)).toBeLessThan(-35);
  await page.waitForTimeout(120);
  await page.mouse.up();
  await expect.poll(async () => track.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m41)).toBe(0);
  expect(new URL(page.url()).searchParams.get("media")).toBe(startMedia);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - box.width * 0.4, y, { steps: 5 });
  expect(await track.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m41)).toBeLessThan(-box.width * 0.25);
  await page.screenshot({ path: testInfo.outputPath("lightbox-drag.png") });
  await page.mouse.up();
  await expect.poll(() => new URL(page.url()).searchParams.get("media")).not.toBe(startMedia);
  await expect(page.locator(".media-lightbox-toolbar p")).toHaveText("2 / 2");

  const image = page.locator(".media-lightbox-slide-current img");
  await image.dblclick();
  await expect(viewport).toHaveAttribute("data-zoomed", "true");
  const before = await image.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m41);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 70, y, { steps: 4 });
  const after = await image.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m41);
  expect(after).toBeGreaterThan(before + 20);
  await page.mouse.up();
  await image.dblclick();
  await expect(viewport).toHaveAttribute("data-zoomed", "false");

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + box.height * 0.35, { steps: 5 });
  expect(await track.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m42)).toBeGreaterThan(box.height * 0.2);
  expect(await page.locator(".media-lightbox-backdrop").evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe("rgba(9, 10, 12, 0.96)");
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "媒体灯箱" })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("media")).toBe(false);
});

test("touch pinch zooms around the fingers and reduced motion avoids settling animation", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "touch event injection uses Chromium CDP");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  await openMedia(page);
  const viewport = page.locator(".media-lightbox-viewport");
  const box = await viewport.boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  await touch("touchStart", [[cx - 30, cy], [cx + 30, cy]]);
  await touch("touchMove", [[cx - 100, cy], [cx + 100, cy]]);
  await expect(viewport).toHaveAttribute("data-zoomed", "true");
  const scale = await page.locator(".media-lightbox-slide-current img").evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).a);
  expect(scale).toBeGreaterThan(2);
  await touch("touchEnd", []);
  await page.locator(".media-lightbox-slide-current img").dblclick();
  await expect(viewport).toHaveAttribute("data-zoomed", "false");
  await touch("touchStart", [[cx, cy]]);
  await touch("touchEnd", []);
  await touch("touchStart", [[cx, cy]]);
  await touch("touchEnd", []);
  await expect(viewport).toHaveAttribute("data-zoomed", "true");
  await touch("touchStart", [[cx, cy]]);
  await touch("touchEnd", []);
  await touch("touchStart", [[cx, cy]]);
  await touch("touchEnd", []);
  await expect(viewport).toHaveAttribute("data-zoomed", "false");
  const track = page.locator(".media-lightbox-track");
  await touch("touchStart", [[cx, cy]]);
  await touch("touchMove", [[cx - 35, cy]]);
  expect(await track.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m41)).toBeLessThan(-25);
  await touch("touchEnd", []);
  await expect.poll(async () => track.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m41)).toBe(0);
  expect(await viewport.evaluate((node) => Number.parseFloat(getComputedStyle(node.querySelector(".media-lightbox-track")).transitionDuration))).toBeLessThan(0.001);
});

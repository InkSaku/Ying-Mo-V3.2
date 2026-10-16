import { expect, test } from "@playwright/test";

test("personal avatar stays square through loading, image and fallback states", async ({ page }, testInfo) => {
  let avatarPath = "/api/v1/uploads/avatar-layout/thumbnail";
  let releaseImage;
  const ready = new Promise((resolve) => { releaseImage = resolve; });
  await page.route("**/api/v1/users/me/overview", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.data.user.avatar_media = avatarPath ? { thumbnail_path: avatarPath } : null;
    await route.fulfill({ response, json });
  });
  await page.route("**/api/v1/uploads/avatar-layout/thumbnail", async (route) => {
    await ready;
    await route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect width="300" height="180" fill="#ece9df"/><circle cx="150" cy="90" r="50" fill="#334b76"/></svg>' });
  });
  await page.route("**/api/v1/uploads/avatar-unavailable/thumbnail", (route) => route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "图片不可用" } } }));
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill("editor_e2e");
  await page.getByLabel("密码", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/home/);
  await page.goto("/me");

  const frame = page.locator(".me-avatar");
  async function checkSizes() {
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const box = await frame.boundingBox();
      const size = width <= 767 ? 72 : 96;
      expect(box.width).toBe(size);
      expect(box.height).toBe(size);
      const content = await frame.locator(":scope > *").boundingBox();
      expect(content.width).toBe(size - 2);
      expect(content.height).toBe(size - 2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
  }
  await expect(frame.getByRole("status")).toBeVisible();
  await checkSizes();
  releaseImage();
  const image = frame.locator("img");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBe(300);
  expect(await image.evaluate((element) => getComputedStyle(element).objectFit)).toBe("cover");
  await checkSizes();
  await page.screenshot({ path: testInfo.outputPath("me-avatar-mobile.png"), fullPage: true });

  avatarPath = "/api/v1/uploads/avatar-unavailable/thumbnail";
  await page.reload();
  await expect(frame.locator(".profile-monogram")).toBeVisible();
  await checkSizes();
  avatarPath = null;
  await page.reload();
  await expect(frame.locator(".profile-monogram")).toBeVisible();
  await checkSizes();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: testInfo.outputPath("me-avatar-desktop.png"), fullPage: true });
});

import { expect, test } from "@playwright/test";

async function login(page, username = "editor_e2e") {
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill(username);
  await page.getByLabel("密码", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "登录，继续书写", exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
}

const notice = (page) => page.getByRole("dialog", { name: /续火花之前，\s*先读这一页。/ });

test("risk notice keeps the warning readable across themes and sizes and repeats without opt-out", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/tools/spark");
  const dialog = notice(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("本功能纯属作者自娱自乐，违反抖音社区公约，有封号风险，望知悉。");
  await expect(dialog.getByRole("button", { name: "我已知悉", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "关闭提示" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "我已知悉", exact: true })).toBeFocused();
  await expect(dialog.getByRole("checkbox", { name: "不再提示", exact: true })).not.toBeChecked();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const contrast = await dialog.getByRole("button", { name: "我已知悉", exact: true }).evaluate((el) => {
      const style = getComputedStyle(el);
      const luminance = (color) => {
        const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
          const s = v / 255;
          return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
        });
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      };
      const text = luminance(style.webkitTextFillColor || style.color);
      const background = luminance(style.backgroundColor);
      return (Math.max(text, background) + .05) / (Math.min(text, background) + .05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const bounds = await dialog.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`spark-risk-${theme}-${width}.png`) });
    }
  }
  await page.setViewportSize({ width: 320, height: 480 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await dialog.evaluate((el) => {
    el.querySelector("h2").style.fontSize = "56px";
    el.querySelector(".spark-risk-description").style.fontSize = "32px";
  });
  await dialog.getByRole("button", { name: "我已知悉", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(notice(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(notice(page)).toHaveCount(0);
  await page.reload();
  await expect(notice(page)).toBeVisible();
});

test("remembered acknowledgement survives reloads and navigation but belongs to the current account", async ({ page, request }) => {
  await login(page);
  await page.goto("/tools/spark");
  await notice(page).getByRole("checkbox", { name: "不再提示", exact: true }).check();
  await notice(page).getByRole("button", { name: "我已知悉", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: /让火花继续/ })).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
  await page.goto("/home");
  await expect(page.getByRole("link", { name: "进入续火花助手" })).toBeVisible();
  await page.goto("/tools/spark");
  await expect(page.getByRole("heading", { name: /让火花继续/ })).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
  const username = `risk_${Date.now().toString(36)}`;
  const registered = await request.post("/api/v1/auth/register", { data: {
    username, nickname: "风险提示验收", password: "password123", email: `${username}@example.com`, invite_code: "e2e-invite",
  } });
  expect(registered.status()).toBe(201);
  await page.locator(".account-menu > summary").click();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await login(page, username);
  await page.goto("/tools/spark");
  await expect(notice(page)).toBeVisible();
});

test("risk notice is available when the API fails and local storage is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key.startsWith("yingmo:spark-risk-notice:")) throw new Error("storage unavailable");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("yingmo:spark-risk-notice:")) throw new Error("storage unavailable");
      return set.call(this, key, value);
    };
  });
  await login(page);
  await page.route("**/api/v1/spark", (route) => route.fulfill({ status: 503, json: { ok: false, error: { message: "服务暂不可用" } } }));
  await page.goto("/tools/spark");
  await expect(notice(page)).toBeVisible();
  await notice(page).getByRole("checkbox", { name: "不再提示", exact: true }).check();
  await notice(page).getByRole("button", { name: "我已知悉", exact: true }).click();
  await expect(notice(page)).toHaveCount(0);
  await page.reload();
  await expect(notice(page)).toBeVisible();
});

import { expect, test } from "@playwright/test";

async function topmost(locator) {
  expect(await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
}

test("theme icon persists and header menus cover editor actions across sizes", async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/about");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const button = page.locator(".theme-toggle:visible");
    await expect(button).toHaveCount(1);
    await expect(button).toHaveAccessibleName(/当前主题：跟随系统/);
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAccessibleName(/当前主题：浅色/);
    await button.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(button).toHaveAccessibleName(/当前主题：深色/);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await button.click();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill("editor_e2e");
  await page.getByLabel("密码", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
  await page.goto("/write?type=article");
  await expect(page.getByPlaceholder("文章标题（必填）")).toBeVisible();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const button = page.locator(".theme-toggle:visible");
    await expect(button).toHaveCount(1);
    await topmost(button);
    await button.click();
    await button.click();
    await button.click();
    const summary = page.locator(width >= 980 ? ".discover-menu > summary" : ".mobile-menu > summary");
    const panel = page.locator(width >= 980 ? ".discover-menu-panel" : ".mobile-menu-panel");
    await summary.click();
    await expect(panel).toBeVisible();
    for (const link of await panel.locator("nav a").all()) await topmost(link);
    if (width === 1440 || width === 390) await page.screenshot({ path: testInfo.outputPath(`header-${width}.png`) });
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(summary).toBeFocused();
    await page.getByRole("button", { name: "文稿信息", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "文稿信息", exact: true })).toBeVisible();
    await topmost(page.getByRole("dialog", { name: "文稿信息", exact: true }).getByRole("button", { name: "关闭文稿信息", exact: true }));
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
});

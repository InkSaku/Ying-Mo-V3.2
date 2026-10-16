import { expect, test } from "@playwright/test";

test("quiet canvas keeps settings, advanced formatting and draft text accessible", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("yingmo_theme", "system"));
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill("editor_e2e");
  await page.getByLabel("密码", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/home/);
  await page.goto("/write?type=article");
  await page.getByPlaceholder("文章标题（必填）").fill("给日常留一点空白");
  const body = page.locator(".editor-body-visual .rich-markdown-content").first();
  await body.fill("窗外的雨刚停，书桌上还放着一杯没喝完的茶。");
  await body.press("Enter");
  await page.keyboard.insertText("不急着写出一个结论。先把看到的、想到的，慢慢记下来。让句子有一点自己的节奏，也让空白留在它该在的地方。");
  await body.press("Enter");
  await page.keyboard.insertText("今天就从这里开始。");
  await expect(page.getByText(/已自动保存/).first()).toBeVisible({ timeout: 12_000 });
  const draftUrl = page.url();
  const panel = page.getByRole("dialog", { name: "文稿信息", exact: true });
  const trigger = page.getByRole("button", { name: "文稿信息", exact: true });

  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(panel).toBeHidden();
      await expect(trigger).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const box = await page.locator(".editor-main").boundingBox();
      expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThanOrEqual(1);
      if (theme === "light" && width === 1440 || theme === "dark" && width === 390) {
        await body.focus();
        await page.screenshot({ path: testInfo.outputPath(`writing-quiet-${theme}-${width}.png`), fullPage: true, style: ".app-header { visibility: hidden !important; }" });
      }
      await trigger.click();
      await expect(panel).toBeVisible();
      const close = panel.getByRole("button", { name: "关闭文稿信息", exact: true });
      await expect(close).toBeFocused();
      await expect(panel.getByRole("textbox", { name: "文章网址", exact: true })).toHaveValue("gei-ri-chang-liu-yi-dian-kong-bai");
      await page.keyboard.press("Shift+Tab");
      await expect(panel.getByRole("button", { name: "设置封面", exact: true })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(body).toContainText("今天就从这里开始。");
    }
  }
  await trigger.click();
  await panel.getByRole("button", { name: "设置封面", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(page.locator(".editor-media-drawer")).toHaveAttribute("open");
  await expect(page.locator(".editor-media-drawer > summary")).toBeFocused();
  await body.click();
  await page.locator(".editor-more-formats > summary").click();
  const menu = await page.locator(".editor-more-formats > div").boundingBox();
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(320);
  await page.getByRole("button", { name: "代码：插入代码块", exact: true }).click();
  await expect(body.locator("pre")).toBeVisible();
  await expect(page.locator(".editor-more-formats")).not.toHaveAttribute("open");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.getByText("修改已保存。", { exact: true })).toBeVisible();
  await page.goto(draftUrl);
  await expect(body).toContainText("窗外的雨刚停");
});

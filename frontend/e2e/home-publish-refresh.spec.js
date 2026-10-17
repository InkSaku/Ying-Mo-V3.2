import { expect, test } from "@playwright/test";

test("publishing in the full editor refreshes cached home feeds without a browser reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill("editor_e2e");
  await page.getByLabel("密码", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
  await expect(page.locator(".home-feed")).not.toHaveAttribute("aria-busy", "true");
  const nav = page.getByRole("navigation", { name: "成员导航", exact: true });
  for (const type of ["article", "note"]) {
    const filter = type === "article" ? "文章" : "随记";
    await page.locator(".home-feed-filters").getByRole("button", { name: filter, exact: true }).click();
    await expect(page.locator(".home-feed")).not.toHaveAttribute("aria-busy", "true");
    await page.locator(".home-feed-filters").getByRole("button", { name: "全部", exact: true }).click();
    await page.locator(".header-actions").getByRole("link", { name: "写作", exact: true }).click();
    await expect(page.getByPlaceholder("文章标题（必填）")).toBeVisible();
    if (type === "note") await page.locator(".editor-type-switch").getByText("随记", { exact: true }).click();
    const content = `首页应立即展示的新${type} ${Date.now()}`;
    if (type === "article") await page.getByPlaceholder("文章标题（必填）").fill(content);
    await page.locator(".editor-body-visual .rich-markdown-content").first().fill(content);
    await page.getByRole("button", { name: "发布", exact: true }).click();
    await page.getByRole("button", { name: "确认发布", exact: true }).click();
    await expect(page).toHaveURL(type === "article" ? /\/articles\// : /\/notes\//);
    await nav.getByRole("link", { name: "首页", exact: true }).click();
    await expect(page.locator(".home-feed-stream")).toContainText(content);
    await page.locator(".home-feed-filters").getByRole("button", { name: filter, exact: true }).click();
    await expect(page.locator(".home-feed-stream")).toContainText(content);
    await nav.getByRole("link", { name: "首页", exact: true }).click();
  }
});

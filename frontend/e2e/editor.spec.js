import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const fixturePng = fileURLToPath(new URL("../public/pwa-192.png", import.meta.url));

async function login(page) {
  await page.goto("/login");
  await page.getByPlaceholder("请输入用户名或邮箱").fill("editor_e2e");
  await page.getByPlaceholder("请输入密码").fill("password123");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
}

async function uploadInlineImage(page) {
  const uploaded = page.waitForResponse((response) => (
    response.request().method() === "POST"
      && response.url().includes("/api/v1/uploads/images")
      && response.status() === 201
  ));
  await page.locator("input.editor-inline-file-input").setInputFiles(fixturePng);
  await uploaded;
}

test("visual editor autosaves, inserts and arranges real image blocks", async ({ page }) => {
  const consoleErrors = [];
  await login(page);
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/write?type=article");

  await page.getByPlaceholder("写下值得被慢慢读完的事").fill("编辑器端到端验收");
  const body = page.locator(".editor-body-visual .visual-markdown-text-block").first();
  await body.fill("第一段\n\n第二段");
  await expect(page.getByText(/已自动保存/).first()).toBeVisible({ timeout: 12_000 });
  await expect(page).toHaveURL(/\/write\/\d+/);

  await body.evaluate((element) => {
    element.focus();
    element.setSelectionRange(4, 4);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await uploadInlineImage(page);
  await expect(page.locator(".editor-body-visual .visual-media-block")).toHaveCount(1);
  await expect(page.locator(".editor-body-visual")).not.toContainText("[[ym-media:");
  await expect(page.locator(".editor-body-visual img.visual-media-block-image")).toHaveCount(1);

  const firstBlock = page.locator(".editor-body-visual .visual-media-block").first();
  await firstBlock.getByRole("button", { name: "图片设置" }).click();
  await firstBlock.getByPlaceholder("描述图片内容，供读屏软件使用").fill("绿色像素示例");
  await firstBlock.getByPlaceholder("显示在图片下方，可留空").fill("插入位置与图注验收");
  await firstBlock.getByRole("button", { name: "大", exact: true }).click();
  await firstBlock.getByRole("button", { name: "左", exact: true }).click();
  await firstBlock.getByRole("button", { name: "保存图片设置" }).click();
  await expect(firstBlock.getByText("插入位置与图注验收", { exact: true })).toBeVisible();
  await expect(firstBlock).toHaveClass(/media-size-large/);
  await expect(firstBlock).toHaveClass(/media-align-left/);

  await uploadInlineImage(page);
  await expect(page.locator(".editor-body-visual .visual-media-block")).toHaveCount(2);
  const sourceButton = page.locator(".editor-body-visual").getByRole("button", { name: "Markdown 源码" });
  await sourceButton.click();
  const source = page.locator(".editor-body-visual .visual-markdown-source");
  const before = await source.inputValue();
  const beforeIds = [...before.matchAll(/\[\[ym-media:(\d+)\]\]/g)].map((match) => match[1]);
  expect(beforeIds).toHaveLength(2);

  await page.locator(".editor-body-visual").getByRole("button", { name: "可视编辑" }).click();
  await page.locator(".editor-body-visual .visual-media-block").last().getByRole("button", { name: "上移" }).click();
  await sourceButton.click();
  const after = await source.inputValue();
  const afterIds = [...after.matchAll(/\[\[ym-media:(\d+)\]\]/g)].map((match) => match[1]);
  expect(afterIds).toEqual([...beforeIds].reverse());

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".editor-body-visual").getByRole("button", { name: "可视编辑" }).click();
  const imageButton = page.getByRole("button", { name: "图片", exact: true });
  await expect(imageButton).toBeVisible();
  await expect(page.locator(".editor-body-visual .visual-markdown-text-block").first()).toHaveCSS("font-size", "16px");
  const mobileMediaWidths = await page.locator(".editor-body-visual .visual-media-block").first().evaluate((element) => ({
    media: element.getBoundingClientRect().width,
    editor: element.parentElement.getBoundingClientRect().width,
  }));
  expect(mobileMediaWidths.media / mobileMediaWidths.editor).toBeGreaterThan(0.94);

  expect(consoleErrors).toEqual([]);
});

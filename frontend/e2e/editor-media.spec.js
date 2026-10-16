import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const photo = fileURLToPath(new URL("../src/assets/home/coast.jpg", import.meta.url));
const editor = (page) => page.locator(".editor-body-visual .rich-markdown-content");
const images = (page) => editor(page).locator(".visual-media-block");
const mode = (page, name) => page.locator(".editor-body-visual").getByRole("button", { name, exact: true });
const source = (page) => page.locator(".editor-body-visual .visual-markdown-source");
async function readSource(page) {
  await mode(page, "Markdown 源码").click();
  const value = await source(page).inputValue();
  await mode(page, "可视编辑").click();
  return value;
}
async function selectImage(page, index = 0) {
  await images(page).nth(index).locator(".visual-media-block-surface").click();
  await expect(images(page).nth(index)).toHaveClass(/is-selected/);
}

test("images flow with text and support native selection, deletion, line breaks and clipboard", async ({ page, context }, testInfo) => {
  test.setTimeout(90_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill("editor_e2e");
  await page.getByLabel("密码", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
  await page.goto("/write?type=article");
  await page.getByPlaceholder("文章标题（必填）").fill("让文字和照片自然相接");
  await editor(page).fill("今天走到海边，想把这一刻留下来。");
  for (let i = 0; i < 2; i++) {
    await page.locator("input.editor-inline-file-input").setInputFiles(photo);
    await expect(images(page)).toHaveCount(i + 1);
    await expect(page.getByText("图片已插入正文并保存。", { exact: true }).first()).toBeVisible();
  }
  const uploaded = await readSource(page);
  const ids = [...uploaded.matchAll(/\[\[ym-media:(\d+)\]\]/g)].map((match) => match[1]);
  const original = `今天走到海边，想把这一刻留下来。\n\n[[ym-media:${ids[0]}]]\n\n[[ym-media:${ids[1]}]]\n\n照片之后，接着写今天的故事。`;
  await mode(page, "Markdown 源码").click();
  await source(page).fill(original);
  await mode(page, "可视编辑").click();
  await expect(editor(page)).toHaveCount(1);
  await expect(images(page).locator("img")).toHaveCount(2);
  const spacing = await editor(page).evaluate((element) => {
    const paragraph = element.querySelector("p").getBoundingClientRect();
    const photos = [...element.querySelectorAll(".visual-media-block img")].map((image) => image.getBoundingClientRect());
    return { text: photos[0].top - paragraph.bottom, photos: photos[1].top - photos[0].bottom };
  });
  expect(spacing.text).toBeLessThan(64);
  expect(spacing.photos).toBeLessThanOrEqual(48);
  await page.mouse.move(0, 0);
  await expect(images(page).first().locator(".visual-media-block-toolbar")).toHaveCSS("opacity", "0");
  await page.screenshot({ path: testInfo.outputPath("media-flow-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await selectImage(page);
  await page.screenshot({ path: testInfo.outputPath("media-selected-mobile.png"), fullPage: true });
  // Keep both endpoints visible so scrolling during Playwright's mouse gesture
  // does not move the source before the browser starts the native drag.
  await page.setViewportSize({ width: 1280, height: 2000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await images(page).last().locator(".visual-media-block-surface").dragTo(editor(page).locator(":scope > p").first(), {
    targetPosition: { x: 1, y: 4 },
  });
  const moved = await readSource(page);
  expect(moved.indexOf(`[[ym-media:${ids[1]}]]`)).toBeLessThan(moved.indexOf("今天走到海边"));
  await editor(page).locator(":scope > p").first().click();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await readSource(page)).toBe(original);
  await page.setViewportSize({ width: 1280, height: 900 });

  await selectImage(page);
  await page.keyboard.press("Delete");
  await expect(images(page)).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(images(page)).toHaveCount(2);
  await expect(editor(page)).toContainText("照片之后，接着写今天的故事。");
  await selectImage(page);
  await page.keyboard.press("Backspace");
  await expect(images(page)).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(images(page)).toHaveCount(2);

  await selectImage(page);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("在第一张图片下方继续写。");
  let value = await readSource(page);
  expect(value.indexOf("在第一张图片下方继续写。")).toBeGreaterThan(value.indexOf(`[[ym-media:${ids[0]}]]`));
  expect(value.indexOf("在第一张图片下方继续写。")).toBeLessThan(value.indexOf(`[[ym-media:${ids[1]}]]`));
  await selectImage(page);
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.insertText("在图片上方补一句。");
  value = await readSource(page);
  expect(value.indexOf("在图片上方补一句。")).toBeLessThan(value.indexOf(`[[ym-media:${ids[0]}]]`));

  await selectImage(page);
  await page.keyboard.press("ControlOrMeta+c");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`[[ym-media:${ids[0]}]]`);
  await editor(page).locator(":scope > p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(images(page)).toHaveCount(3);
  await expect(images(page).last().locator("img")).toBeVisible();

  await selectImage(page, 2);
  await page.keyboard.press("ControlOrMeta+x");
  await expect(images(page)).toHaveCount(2);
  await editor(page).locator(":scope > p").first().click();
  await page.keyboard.press("Home");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(images(page)).toHaveCount(3);
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+x");
  await expect(images(page)).toHaveCount(0);
  expect(await page.evaluate(() => navigator.clipboard.readText())).not.toContain("图片设置");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(images(page)).toHaveCount(3);
  await expect(editor(page)).toContainText("在第一张图片下方继续写。");
  await expect(editor(page)).toContainText("照片之后，接着写今天的故事。");
  await page.evaluate((text) => navigator.clipboard.writeText(text), `[[ym-media:${ids[0]}]]`);
  await editor(page).locator(":scope > p").last().click();
  await page.keyboard.press("ControlOrMeta+v");
  await expect(images(page)).toHaveCount(4);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(images(page)).toHaveCount(3);
  const final = await readSource(page);
  await expect(page.getByText(/已自动保存/).first()).toBeVisible({ timeout: 12_000 });
  await page.reload();
  await expect(images(page)).toHaveCount(3);
  expect(await readSource(page)).toBe(final);
  expect(errors).toEqual([]);
});

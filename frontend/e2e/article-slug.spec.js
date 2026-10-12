import { expect, test } from "@playwright/test";

async function login(page) {
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill("editor_e2e");
  await page.getByLabel("密码", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "登录，继续书写" }).click();
  await expect(page).toHaveURL(/\/home/);
}

const titleInput = (page) => page.getByPlaceholder("写下值得被慢慢读完的事");
const slugInput = (page) => page.getByRole("textbox", { name: "文章网址", exact: true, includeHidden: true });
async function waitForSaved(page) {
  await expect(page.getByText(/已自动保存/).first()).toBeVisible({ timeout: 12_000 });
  await expect(page).toHaveURL(/\/write\/\d+/);
}

test("title generates an address, manual changes survive reload and published links stay stable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/write?type=article");
  await titleInput(page).fill("在海边慢慢读书");
  await expect(slugInput(page)).toHaveValue("zai-hai-bian-man-man-du-shu");
  await page.locator(".editor-body-visual .rich-markdown-content").first().fill("写下一段值得留住的日常。");
  await waitForSaved(page);
  const editUrl = page.url();
  await titleInput(page).fill("Vue 3 入门");
  await expect(slugInput(page)).toHaveValue("vue-3-ru-men");
  await page.getByRole("button", { name: "文稿信息", exact: true }).click();
  await expect(slugInput(page)).toBeVisible();
  await slugInput(page).fill("my-reading-note");
  await page.getByRole("dialog", { name: "文稿信息", exact: true }).getByRole("button", { name: "关闭文稿信息" }).click();
  await titleInput(page).fill("新的阅读笔记");
  await expect(slugInput(page)).toHaveValue("my-reading-note");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.getByText("修改已保存。", { exact: true })).toBeVisible();
  await page.reload();
  await expect(slugInput(page)).toHaveValue("my-reading-note");
  await titleInput(page).fill("再次修改标题");
  await expect(slugInput(page)).toHaveValue("my-reading-note");
  await page.getByRole("button", { name: "文稿信息", exact: true }).click();
  await page.getByRole("button", { name: "按标题重新生成", exact: true }).click();
  await page.getByRole("dialog", { name: "文稿信息", exact: true }).getByRole("button", { name: "关闭文稿信息" }).click();
  await expect(slugInput(page)).toHaveValue("zai-ci-xiu-gai-biao-ti");
  await titleInput(page).fill("今天的阅读");
  await expect(slugInput(page)).toHaveValue("jin-tian-de-yue-du");
  await page.getByRole("button", { name: "发布", exact: true }).click();
    await page.getByRole("button", { name: "确认发布", exact: true }).click();
  await expect(page).toHaveURL(/\/articles\/jin-tian-de-yue-du$/);
  await page.goto(editUrl);
  await expect(slugInput(page)).toHaveValue("jin-tian-de-yue-du");
  await titleInput(page).fill("发布以后改标题");
  await expect(slugInput(page)).toHaveValue("jin-tian-de-yue-du");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.getByText("修改已保存。", { exact: true })).toBeVisible();
  await page.goto("/articles/jin-tian-de-yue-du");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("发布以后改标题");
});

test("two articles with the same generated title address both publish without manual input", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const addresses = [];
  for (let index = 0; index < 2; index += 1) {
    await page.goto("/write?type=article");
    await titleInput(page).fill("雨后的散步");
    await expect(slugInput(page)).toHaveValue("yu-hou-de-san-bu");
    await page.locator(".editor-body-visual .rich-markdown-content").first().fill(`同名记录，第 ${index + 1} 篇。`);
    await waitForSaved(page);
    await page.getByRole("button", { name: "发布", exact: true }).click();
    await page.getByRole("button", { name: "确认发布", exact: true }).click();
    await expect(page).toHaveURL(/\/articles\/yu-hou-de-san-bu(?:-\d+)?$/);
    addresses.push(page.url());
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("雨后的散步");
  }
  expect(addresses[0]).not.toBe(addresses[1]);
  await page.goto(addresses[0]);
  await expect(page.locator(".article-reading-column .prose")).toContainText("第 1 篇");
});

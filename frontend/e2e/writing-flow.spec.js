import { expect, test } from "@playwright/test";

const account = { username: "writing_flow_e2e", password: "password123" };
let token; let collection;
async function login(page) {
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill(account.username);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/home/);
}
const editor = (page) => page.locator(".editor-body-visual .rich-markdown-content").first();
const mode = (page, name) => page.locator(".editor-body-visual").getByRole("button", { name, exact: true });
async function startArticle(page, title) {
  await page.goto("/write?type=article");
  await page.getByPlaceholder("文章标题（必填）").fill(title);
  await expect(editor(page)).toBeVisible();
}
async function openPublish(page) {
  await page.getByRole("button", { name: "发布", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "确认发布", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeAll(async ({ request }) => {
  account.username = `writing_flow_${Date.now().toString(36)}`;
  const response = await request.post("/api/v1/auth/register", { data: { ...account, nickname: "写作流程验收", email: `${account.username}@example.com`, invite_code: "e2e-invite" } });
  expect(response.status()).toBe(201);
  token = (await response.json()).data.access_token;
  const headers = { Authorization: `Bearer ${token}` };
  const created = await request.post("/api/v1/collections", { headers, data: { name: "一起走过的四季", slug: `writing-flow-book-${account.username.replaceAll("_", "-")}`, description: "把共同走过的日子，收进这一册。", member_ids: [] } });
  expect(created.status()).toBe(201); collection = (await created.json()).data;
  for (const name of ["Python", "日常", "阅读", "旅行", "散步", "学习", "随想", "摄影", "音乐", "城市", "海边", "冷门主题"]) {
    const post = await request.post("/api/v1/posts", { headers, data: { post_type: "note", body: `主题 ${name}`, visibility: "login_only", tag_names: [name] } });
    expect(post.status()).toBe(201);
    expect((await request.post(`/api/v1/posts/${(await post.json()).data.id}/publish`, { headers, data: {} })).ok()).toBeTruthy();
  }
});

test("visual Markdown renders real headings, shares exact source and preserves advanced content", async ({ page }, testInfo) => {
  await login(page); await startArticle(page, "可视编辑验收");
  await editor(page).click();
  await page.keyboard.type("# ");
  await page.keyboard.insertText("test");
  await expect(editor(page).locator("h1")).toHaveText("test");
  await editor(page).press("Enter");
  await page.keyboard.insertText("这是正文。");
  await page.getByRole("button", { name: /B：加粗/ }).click();
  await page.keyboard.insertText("加粗内容");
  await expect(editor(page).locator("strong")).toHaveText("加粗内容");
  await page.getByRole("button", { name: "撤销正文修改" }).click();
  await expect(editor(page)).not.toContainText("加粗内容");
  await page.getByRole("button", { name: "重做正文修改" }).click();
  await expect(editor(page)).toContainText("加粗内容");
  await mode(page, "Markdown 源码").click();
  const source = page.locator(".editor-body-visual .visual-markdown-source");
  await expect(source).toHaveValue(/# test/);
  const advanced = "# test\n\n**加粗** 与 *倾斜*\n\n- 第一项\n- 第二项\n\n> 引用\n\n```js\nconst x = 1;\n// [[ym-media:999]]\n```\n\n| 名称 | 数量 |\n| --- | --- |\n| 书 | 2 |\n\n正文 $E=mc^2$ 和注释[^1]。\n\n$$\n\\frac{a}{b}\n$$\n\n[^1]: 保留这段脚注。\n\n<div data-test=\"keep\">原始 HTML</div>";
  await source.fill(advanced);
  await expect(page.getByRole("region", { name: "Markdown 实时预览" }).getByRole("heading", { name: "test", exact: true })).toBeVisible();
  await mode(page, "可视编辑").click();
  await expect(editor(page).locator("h1")).toHaveText("test");
  await expect(editor(page).locator("ul:not([data-type]) li")).toHaveCount(2);
  await expect(editor(page).locator("blockquote")).toContainText("引用");
  await expect(editor(page).locator("table")).toContainText("名称");
  await expect(page.locator(".visual-media-block")).toHaveCount(0);
  await mode(page, "Markdown 源码").click(); await expect(source).toHaveValue(advanced);
  await mode(page, "可视编辑").click();
  await editor(page).locator("h1").click(); await page.keyboard.press("End"); await page.keyboard.insertText(" 修改");
  await mode(page, "Markdown 源码").click();
  for (const text of ["# test 修改", "$E=mc^2$", "[^1]: 保留这段脚注。", "\\frac{a}{b}", '<div data-test="keep">原始 HTML</div>', "// [[ym-media:999]]"]) expect(await source.inputValue()).toContain(text);
  await expect(page.getByText(/已自动保存/).first()).toBeVisible({ timeout: 12_000 });
  await page.screenshot({ path: testInfo.outputPath("markdown-source-preview.png"), fullPage: true });
  await page.reload(); await expect(editor(page).locator("h1")).toContainText("test 修改");
  await page.screenshot({ path: testInfo.outputPath("rich-markdown-desktop.png"), fullPage: true });
});

test("publish confirms collection and tags, reuses names, retains choices and retries a failure", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page); await startArticle(page, "发布确认完整验收");
  await editor(page).fill("合集、标签与失败重试，一次完成。");
  let dialog = await openPublish(page);
  await expect(dialog.locator(".tag-picker-option")).toHaveCount(10);
  await dialog.getByRole("button", { name: /一起走过的四季/ }).click();
  await expect(dialog.locator(".publish-scope")).toContainText("仅合集成员可见");
  const search = dialog.getByRole("textbox", { name: "搜索或新建标签" });
  await search.fill("pYTHON");
  await expect(dialog.locator(".tag-picker-hint")).toContainText(/已有标签 · \d+ 篇引用/);
  await dialog.getByRole("button", { name: "选择已有标签", exact: true }).click();
  await search.fill("冷门主题"); await expect(dialog.locator(".tag-picker-option")).toHaveCount(1);
  const partition = dialog.getByRole("link", { name: "查看冷门主题标签分区" });
  await expect(partition).toHaveAttribute("target", "_blank");
  const popupPromise = page.waitForEvent("popup"); await partition.click(); const popup = await popupPromise;
  await expect(popup.getByRole("heading", { level: 1, name: "#冷门主题" })).toBeVisible();
  await popup.getByRole("button", { name: "文章", exact: true }).click();
  await expect(popup.getByText("这个主题下还没有可见内容", { exact: true })).toBeVisible();
  await popup.getByRole("button", { name: "随记", exact: true }).click();
  await expect(popup.locator(".taxonomy-reading-entry")).toHaveCount(1);
  await popup.screenshot({ path: testInfo.outputPath("tag-detail-desktop.png"), fullPage: true });
  await popup.close();
  await dialog.getByRole("button", { name: "选择已有标签", exact: true }).click();
  await search.fill("海风来信"); await dialog.getByRole("button", { name: "＋ 创建「海风来信」", exact: true }).click();
  await search.fill("城市，路线"); await dialog.getByRole("button", { name: "＋ 创建「城市，路线」", exact: true }).click();
  await expect(dialog.locator(".tag-picker-chosen")).toContainText("已选 4");
  await dialog.screenshot({ path: testInfo.outputPath("publish-desktop.png") });
  await dialog.getByRole("button", { name: "继续写作", exact: true }).click();
  await expect(dialog).toBeHidden(); dialog = await openPublish(page);
  await expect(dialog.locator(".tag-picker-chosen")).toContainText("海风来信");
  await expect(dialog.getByRole("button", { name: /一起走过的四季/ })).toHaveAttribute("aria-pressed", "true");
  let fail = true;
  await page.route("**/api/v1/posts/*/publish", (route) => fail ? route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "测试发布失败，请重试。" } } }) : route.continue());
  await dialog.getByRole("button", { name: "确认发布", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("测试发布失败");
  await expect(dialog.locator(".tag-picker-chosen")).toContainText("海风来信");
  fail = false; await dialog.getByRole("button", { name: "确认发布", exact: true }).click();
  await expect(page).toHaveURL(/\/articles\//);
  const result = await page.request.get(`/api/v1/posts/slug/${page.url().split("/").at(-1)}`, { headers: { Authorization: `Bearer ${token}` } });
  const post = (await result.json()).data;
  expect(post.collection_id).toBe(collection.id);
  expect(post.visibility).toBe("private");
  expect(post.tags.map((tag) => tag.name).sort()).toEqual(["Python", "冷门主题", "海风来信", "城市，路线"].sort());
  await page.goto("/tags");
  await expect(page.getByRole("heading", { level: 1, name: "标签" })).toBeVisible();
  await page.getByRole("textbox", { name: "搜索主题" }).fill("海风来信");
  await expect(page.locator(".taxonomy-tag-entry")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("tag-index-desktop.png"), fullPage: true });
  const editUrl = `/write/${post.id}`;
  await page.goto(editUrl);
  await page.getByRole("button", { name: "保存并发布", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".tag-picker-chosen")).toContainText("城市，路线");
  await expect(page.getByRole("dialog").locator(".tag-picker-chosen")).toContainText("已选 4");
  await page.getByRole("button", { name: "继续写作", exact: true }).click();
});

test("mobile publish can leave collection and tags empty and keeps access choices clear", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page); await startArticle(page, "手机发布验收"); await editor(page).fill("小屏也能清楚完成发布。");
  const dialog = await openPublish(page);
  await dialog.getByRole("button", { name: /不加入合集/ }).click();
  await dialog.getByLabel("登录成员", { exact: true }).check();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await expect(dialog.getByRole("button", { name: "确认发布", exact: true })).toBeInViewport();
    expect((await dialog.getByLabel("登录成员", { exact: true }).boundingBox()).width).toBeLessThanOrEqual(20);
  }
  const search = dialog.getByRole("textbox", { name: "搜索或新建标签" });
  await search.scrollIntoViewIfNeeded();
  await expect(search).toBeInViewport();
  await search.fill("阅读");
  await dialog.getByRole("button", { name: "选择已有标签", exact: true }).click();
  await expect(dialog.locator(".tag-picker-chosen")).toContainText("#阅读");
  await dialog.getByRole("button", { name: "移除标签阅读", exact: true }).click();
  await expect(dialog.locator(".tag-picker-chosen")).toContainText("已选 0");
  await dialog.evaluate((element) => { element.scrollTop = 0; });
  await page.emulateMedia({ colorScheme: "dark" });
  await dialog.screenshot({ path: testInfo.outputPath("publish-mobile-dark.png") });
  await dialog.getByRole("button", { name: "确认发布", exact: true }).click(); await expect(page).toHaveURL(/\/articles\//);
});

test("immersive writing shares formatted content with the main canvas and saves it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page); await startArticle(page, "沉浸写作验收");
  await editor(page).fill("保留主画布中的正文。");
  await page.getByRole("button", { name: /进入沉浸写作/ }).click();
  const dialog = page.getByRole("dialog", { name: "Markdown 正文", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".rich-markdown-content").first()).toContainText("保留主画布中的正文。");
  await dialog.getByRole("button", { name: "Markdown 源码", exact: true }).click();
  await dialog.locator(".visual-markdown-source").fill("# 沉浸标题\n\n**保留主画布中的正文。**\n\n- 新增一项");
  await dialog.getByRole("button", { name: "可视编辑", exact: true }).click();
  await expect(dialog.locator(".rich-markdown-content h1")).toHaveText("沉浸标题");
  await expect(dialog.locator(".rich-markdown-content strong")).toHaveText("保留主画布中的正文。");
  await dialog.getByRole("button", { name: "保存并关闭", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(editor(page).locator("h1")).toHaveText("沉浸标题");
  await page.reload();
  await expect(editor(page).locator("h1")).toHaveText("沉浸标题");
  await expect(editor(page).locator("li")).toContainText("新增一项");
});

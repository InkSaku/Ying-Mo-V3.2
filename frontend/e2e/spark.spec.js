import { expect, test } from "@playwright/test";

async function login(page, account) {
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill(account.username);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录，继续书写", exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
}

test("spark integrates login, import, contacts, plan, simulation, queue and unbind", async ({ page, request }, testInfo) => {
  const username = `spark_e2e_${Date.now().toString(36)}`;
  const account = { username, password: "password123" };
  const registered = await request.post("/api/v1/auth/register", { data: {
    ...account, nickname: "火花验收", email: `${username}@example.com`, invite_code: "e2e-invite",
  } });
  expect(registered.status()).toBe(201);
  await login(page, account);
  await page.goto("/tools/spark");
  await expect(page.getByRole("heading", { name: /让火花继续/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "立即续火花", exact: true })).toBeDisabled();
  await page.getByText("备用方式：电脑脚本导出并上传登录态", { exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: "state.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ cookies: [
    { name: "sessionid", value: "offline-e2e-session", domain: ".douyin.com", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" },
  ], origins: [] })) });
  await expect(page.getByRole("status")).toContainText("登录态已导入");
  await page.getByRole("button", { name: "同步联系人", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /小林/ })).toBeVisible();
  await page.getByRole("checkbox", { name: /小林/ }).check();
  await page.getByRole("button", { name: "保存好友选择" }).click();
  await expect(page.getByRole("status")).toContainText("好友选择已保存");
  await page.getByLabel("每天发送时间").fill("22:15");
  await page.getByLabel("消息模板（每行一条）").fill("愿你今天开心\n明天见");
  await page.getByRole("button", { name: "保存每日计划" }).click();
  await expect(page.getByRole("status")).toContainText("每日计划已保存");
  await page.getByRole("button", { name: "模拟运行", exact: true }).click();
  await expect(page.locator(".spark-run").filter({ hasText: "模拟运行" }).first()).toContainText("已完成", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "开启每日自动续火花" })).toBeEnabled();
  await page.getByRole("button", { name: "立即续火花", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "确认发送", exact: true }).click();
  await expect(page.locator(".spark-run").filter({ hasText: "续火花" }).first()).toContainText("已完成", { timeout: 15_000 });
  await page.reload();
  await expect(page.getByLabel("每天发送时间")).toHaveValue("22:15");
  await expect(page.getByLabel("消息模板（每行一条）")).toHaveValue("愿你今天开心\n明天见");
  await expect(page.getByRole("checkbox", { name: /小林/ })).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath("spark-desktop.png"), fullPage: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("spark-mobile.png"), fullPage: true });
  await page.getByText("管理连接", { exact: true }).click();
  await page.getByRole("button", { name: "解绑并删除登录态" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "确认解绑" }).click();
  await expect(page.getByRole("status")).toContainText("已解绑");
  await expect(page.getByRole("button", { name: "立即续火花", exact: true })).toBeDisabled();
});

test("spark page requires login", async ({ page }) => {
  await page.goto("/tools/spark");
  await expect(page).toHaveURL(/\/login/);
});

test("spark QR connects through authenticated image, confirmation and four-step activation", async ({ page, request }, testInfo) => {
  const username = `spark_qr_${Date.now().toString(36)}`;
  const account = { username, password: "password123" };
  const response = await request.post("/api/v1/auth/register", { data: { ...account, nickname: "扫码验收", email: `${username}@example.com`, invite_code: "e2e-invite" } });
  expect(response.status()).toBe(201);
  await login(page, account);
  await page.goto("/tools/spark");
  await expect(page.getByRole("button", { name: "开启每日自动续火花" })).toBeDisabled();
  await page.getByRole("button", { name: "扫码连接抖音", exact: true }).click();
  const qr = page.getByRole("img", { name: "抖音登录二维码" });
  await expect(qr).toBeVisible({ timeout: 15_000 });
  await expect(qr).toHaveAttribute("src", /^blob:/);
  await page.screenshot({ path: testInfo.outputPath("spark-qr.png"), fullPage: true });
  await expect(page.getByRole("button", { name: "确认连接此账号" })).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await page.getByRole("button", { name: "确认连接此账号" }).click();
  await expect(page.getByRole("checkbox", { name: /小林/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("扫码验收（模拟）", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: /小林/ }).check();
  await page.getByRole("button", { name: "保存好友选择" }).click();
  await page.getByLabel("每天发送时间").fill("22:15");
  await page.getByLabel("消息模板（每行一条）").fill("愿你今天开心\n明天见");
  await page.getByRole("button", { name: "保存每日计划" }).click();
  await expect(page.getByRole("button", { name: "开启每日自动续火花" })).toBeDisabled();
  await page.getByRole("button", { name: "模拟运行", exact: true }).click();
  await expect(page.getByRole("button", { name: "开启每日自动续火花" })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole("button", { name: "开启每日自动续火花" }).click();
  await expect(page.getByRole("button", { name: "暂停每日计划" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "暂停每日计划" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("spark-phase-two-desktop.png"), fullPage: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("spark-phase-two-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "暂停每日计划" }).click();
  await expect(page.getByRole("button", { name: "开启每日自动续火花" })).toBeVisible();
});

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
  await page.getByRole("checkbox", { name: "不再提示", exact: true }).check();
  await page.getByRole("button", { name: "我已知悉", exact: true }).click();
  await expect(page.getByRole("heading", { name: /让火花继续/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "立即续火花", exact: true })).toBeDisabled();
  await page.getByText("备用登录方式", { exact: true }).click();
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
  await page.getByRole("checkbox", { name: "不再提示", exact: true }).check();
  await page.getByRole("button", { name: "我已知悉", exact: true }).click();
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

test("server login verification screen relays input and disappears after authentication", async ({ page, request }, testInfo) => {
  const username = `spark_remote_${Date.now().toString(36)}`;
  const account = { username, nickname: "远程登录验收", email: `${username}@example.com`, password: "password123", invite_code: "e2e-invite" };
  const registered = await request.post("/api/v1/auth/register", { data: account });
  expect(registered.status()).toBe(201);
  await login(page, account);
  let state;
  let sequence = 0;
  let complete = false;
  const actions = [];
  const official = await page.context().newPage();
  await official.setViewportSize({ width: 1366, height: 800 });
  await official.setContent(`<main style="font:20px sans-serif;padding:80px;background:#fff;height:700px">
    <h1>官方登录流程模拟（离线测试）</h1><p>扫码已确认，请继续完成登录</p>
    <button style="position:absolute;left:100px;top:250px;height:50px">选择验证方式</button>
    <input style="position:absolute;left:100px;top:350px;width:250px;height:40px" placeholder="验证码" />
    <button style="position:absolute;left:100px;top:430px;height:50px">完成登录</button></main>`);
  const png = await official.screenshot();
  await official.close();
  await page.route("**/api/v1/spark", async (route) => {
    if (!state) state = (await (await route.fetch()).json()).data;
    const session = complete ? { id: "remote-test", status: "awaiting_confirmation", has_qr: false, has_verification_preview: false,
      detected_account: { nickname: "远程登录验收（模拟）" }, identity_known: true } : {
      id: "remote-test", status: "verifying", reason: "请在下方官方页面继续完成登录。", has_qr: false,
      has_verification_preview: true, verification_revision: "test-revision", detected_account: {}, interaction_sequence: sequence,
    };
    await route.fulfill({ json: { ok: true, data: { ...state, login_session: session } } });
  });
  await page.route("**/login-sessions/remote-test/verification", (route) => route.fulfill({ contentType: "image/png", body: png,
    headers: { "X-Spark-Revision": "test-revision", "X-Spark-Input-Sequence": String(sequence), "X-Spark-Input-Pending": "0" } }));
  await page.route("**/login-sessions/remote-test/interaction", async (route) => {
    const data = route.request().postDataJSON();
    expect(data.revision).toBe("test-revision");
    expect(data.sequence).toBe(sequence);
    actions.push(data.action);
    sequence += 1;
    if (data.action.type === "key" && data.action.key === "Enter") complete = true;
    await route.fulfill({ status: 202, json: { ok: true, data: { sequence } } });
  });
  await page.goto("/tools/spark");
  await page.getByRole("checkbox", { name: "不再提示", exact: true }).check();
  await page.getByRole("button", { name: "我已知悉", exact: true }).click();
  const screen = page.getByRole("img", { name: "抖音官方登录页面实时画面" });
  await expect(screen).toBeVisible();
  const box = await screen.boundingBox();
  await screen.click({ position: { x: box.width * 150 / 1366, y: box.height * 375 / 800 } });
  await expect.poll(() => actions.length).toBe(1);
  expect(actions[0].type).toBe("click");
  expect(Math.abs(actions[0].x - 150)).toBeLessThanOrEqual(1);
  expect(Math.abs(actions[0].y - 375)).toBeLessThanOrEqual(1);
  const digits = page.getByLabel("验证码或手机号", { exact: true });
  await digits.fill("123456");
  const fill = page.getByRole("button", { name: "填入已选输入框", exact: true });
  await expect(fill).toBeEnabled();
  await fill.click();
  await expect.poll(() => actions.length).toBe(2);
  expect(actions[1]).toEqual({ type: "text", text: "123456" });
  await expect(digits).toHaveValue("");
  await page.locator(".spark-verification").screenshot({ path: testInfo.outputPath("spark-server-verification.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("spark-server-verification-mobile.png"), fullPage: true });
  const enter = page.getByRole("button", { name: "确认输入", exact: true });
  await expect(enter).toBeEnabled();
  await enter.click();
  await expect(page.getByRole("button", { name: "确认连接此账号", exact: true })).toBeVisible();
  await expect(screen).toHaveCount(0);
});

import { expect, test } from "@playwright/test";

test("spark history gives old failures usable recovery and guards uncertain sends", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill("editor_e2e");
  await page.getByLabel("密码", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/home/);

  let state;
  const submitted = [];
  const now = new Date().toISOString();
  const failure = { id: "legacy-sync", kind: "sync", source: "manual", status: "failed", scheduled_at: now,
    result: { message: "后台执行失败，请检查服务运行状态后重试" } };
  await page.route("**/api/v1/spark", async (route) => {
    if (!state) {
      const payload = await (await route.fetch()).json();
      state = { ...payload.data, bound: true, session_status: "ready", credential_storage_ready: true,
        account_profile: { nickname: "测试账号" }, login_session: null,
        worker: { online: true, heartbeat_at: now }, jobs: [failure] };
    }
    await route.fulfill({ json: { ok: true, data: state } });
  });
  await page.route("**/api/v1/spark/jobs", async (route) => {
    const body = route.request().postDataJSON();
    submitted.push(body);
    state.jobs.unshift({ ...failure, id: "new-sync", status: "queued", result: {}, created_at: now });
    await route.fulfill({ status: 202, json: { ok: true, data: { id: "new-sync" } } });
  });
  await page.goto("/tools/spark");
  await page.getByRole("button", { name: "我已知悉", exact: true }).click();
  const history = page.locator("#spark-history");
  const recovery = history.getByRole("group", { name: "同步联系人处理建议" });
  const retry = recovery.getByRole("button", { name: "重试同步联系人", exact: true });
  await expect(recovery).toContainText("联系人同步没有完成");
  await expect(recovery).toContainText("本次操作不会发送消息");
  await expect(recovery).toContainText("联系网站管理员并提供这条记录的时间");
  await expect(history).not.toContainText("检查服务运行状态");
  await expect(retry).toBeEnabled();

  // One visual inspection batch covers both device classes and themes.
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await history.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await history.screenshot({ path: testInfo.outputPath(`spark-recovery-${theme}-${width}.png`) });
    }
  }
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#spark-queue")).toBeVisible();
  await expect(retry).toBeDisabled();
  expect(submitted).toHaveLength(1);
  expect(submitted[0].kind).toBe("sync");
  await expect(recovery).toContainText("已有任务在进行");

  state.jobs = [failure];
  state.worker.online = false;
  await history.getByRole("button", { name: "刷新状态", exact: true }).click();
  await expect(retry).toBeDisabled();
  await expect(recovery).toContainText("服务恢复后即可重试");
  await expect(page.locator(".spark-page")).toContainText("若长时间未恢复，请联系网站管理员");

  state.worker.online = true;
  state.session_status = "expired";
  await history.getByRole("button", { name: "刷新状态", exact: true }).click();
  await expect(retry).toBeDisabled();
  await expect(recovery).toContainText("处理账号连接");

  for (const status of ["expired", "blocked"]) {
    state.jobs = [{ ...failure, status }];
    await history.getByRole("button", { name: "刷新状态", exact: true }).click();
    await expect(recovery.getByRole("button")).toHaveCount(0);
    const connection = recovery.getByRole("link");
    await expect(connection).toHaveAttribute("href", "#spark-step-1");
    await expect(recovery).toContainText(status === "expired" ? "重新扫码" : "手机抖音");
    await connection.click();
    await expect(page).toHaveURL(/#spark-step-1$/);
  }

  state.session_status = "ready";
  state.jobs = [{ ...failure, kind: "send", status: "unknown", result: { events: [{ name: "朋友", status: "unknown", reason: "发送结果未确认" }] } }];
  await history.getByRole("button", { name: "刷新状态", exact: true }).click();
  const uncertain = history.getByRole("group", { name: "续火花处理建议" });
  await expect(uncertain).toContainText("核对聊天记录");
  await expect(uncertain).toContainText("不会自动重发");
  await expect(uncertain.getByRole("button")).toHaveCount(0);
  await expect(uncertain.getByRole("link")).toHaveCount(0);
  expect(submitted).toHaveLength(1);

  state.jobs = [{ ...failure, kind: "dry_run", result: {} }];
  await history.getByRole("button", { name: "刷新状态", exact: true }).click();
  const check = history.getByRole("group", { name: "模拟运行处理建议" });
  await expect(check.getByRole("button", { name: "重试模拟检查" })).toBeDisabled();
  await expect(check).toContainText("请先保存好友选择与每日计划");
});

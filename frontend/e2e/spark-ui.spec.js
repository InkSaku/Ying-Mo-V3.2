import { expect, test } from "@playwright/test";

test("spark workspace explains queued retries and keeps filtered selections", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill("editor_e2e");
  await page.getByLabel("密码", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "登录，继续书写", exact: true }).click();
  await expect(page).toHaveURL(/\/home/);

  let state;
  const contacts = Array.from({ length: 20 }, (_, index) => ({
    id: index + 1, display_name: index === 0 ? "小林" : index === 1 ? "阿文" : index === 2 ? "周末小分队" : `朋友${String(index + 1).padStart(2, "0")}`,
    selected: index < 3, selected_order: index, has_conversation: true, short_id: index < 9 ? `friend.${index + 1}` : "",
    streak_days: index < 3 ? [81, 26, 7][index] : 0, missing_in_sync: index === 19, ambiguous: false,
  }));
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 45 * 60_000).toISOString();
  const jobs = [
    { id: "ui-retry", kind: "send", source: "retry", status: "queued", scheduled_at: later, result: {}, cancel_requested: false },
    { id: "ui-send", kind: "send", source: "manual", status: "failed", scheduled_at: now, result: { events: [{ name: "小林", status: "failed", reason: "发送前操作失败，未发送消息" }] } },
    { id: "ui-check", kind: "dry_run", source: "manual", status: "succeeded", scheduled_at: now, result: { events: contacts.slice(0, 3).map((contact) => ({ name: contact.display_name, status: "succeeded", reason: "模拟检查通过，未发送消息" })) } },
    { id: "ui-sync", kind: "sync", source: "auto_bind", status: "succeeded", scheduled_at: now, result: { count: 20, message: "同步完成" } },
  ];
  await page.route("**/api/v1/spark", async (route) => {
    if (!state) {
      const response = await route.fetch();
      const payload = await response.json();
      state = { ...payload.data, bound: true, session_status: "ready", credential_storage_ready: true,
        account_profile: { nickname: "纸页里的问候", short_id: "hello.paper" }, login_session: null,
        contacts, selected_count: 3, contacts_updated_at: now, validation_ready: true,
        config: { ...payload.data.config, messages: ["今天也要开心哦", "晚安，明天见"], schedule_time: "21:00", auto_run_enabled: true },
        next_run_at: later, step_progress: { completed: [true, true, true, true], current_step: 4 },
        pending_send: contacts.slice(0, 3).map((contact) => ({ name: contact.display_name, channel: "consumer" })),
        worker: { online: true, heartbeat_at: now }, jobs,
        ledger_stats: { ...payload.data.ledger_stats, total: 20, selected: 3, with_short_id: 9, confidence: { high: 9, low: 11 } },
      };
    }
    await route.fulfill({ json: { ok: true, data: state } });
  });
  await page.route("**/api/v1/spark/jobs/ui-retry/cancel", async (route) => {
    state.jobs[0].status = "cancelled";
    await route.fulfill({ json: { ok: true, data: {} } });
  });
  await page.route("**/api/v1/spark/contacts", async (route) => {
    const entries = route.request().postDataJSON().entries;
    state.contacts = state.contacts.map((contact) => ({ ...contact, selected: entries.find((entry) => entry.id === contact.id).selected }));
    state.selected_count = state.contacts.filter((contact) => contact.selected).length;
    state.validation_ready = false;
    state.step_progress.completed[3] = false;
    state.config.auto_run_enabled = false;
    await route.fulfill({ json: { ok: true, data: state } });
  });
  await page.goto("/tools/spark");
  await expect(page.getByText("纸页里的问候", { exact: true })).toBeVisible();
  await expect(page.locator("#spark-check-hint")).toContainText("补发已安排在");
  await expect(page.getByRole("button", { name: "立即续火花", exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath("spark-ui-desktop.png"), fullPage: true });
  const friends = await page.locator(".spark-friends").boundingBox();
  const plan = await page.locator(".spark-plan-column").boundingBox();
  expect(friends.x + friends.width).toBeLessThan(plan.x);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("spark-ui-mobile.png"), fullPage: true });
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await page.screenshot({ path: testInfo.outputPath("spark-ui-dark-mobile.png"), fullPage: true });
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole("button", { name: "停止补发任务", exact: true }).click();
  await expect(page.getByRole("button", { name: "立即续火花", exact: true })).toBeEnabled();
  await page.getByRole("group", { name: "筛选好友" }).getByRole("button", { name: "已选 3", exact: true }).click();
  await expect(page.locator(".spark-contact")).toHaveCount(3);
  await page.getByRole("group", { name: "筛选好友" }).getByRole("button", { name: "全部 20", exact: true }).click();
  await page.getByRole("searchbox", { name: "搜索好友" }).fill("朋友05");
  await expect(page.locator(".spark-contact")).toHaveCount(1);
  await page.getByRole("button", { name: "选择当前列表", exact: true }).click();
  await expect(page.getByRole("group", { name: "筛选好友" }).getByRole("button", { name: "已选 4", exact: true })).toBeVisible();
  await expect(page.locator("#spark-check-hint")).toContainText("好友选择尚未保存");
  await expect(page.getByRole("button", { name: "立即续火花", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "清空当前列表", exact: true }).click();
  await expect(page.getByRole("group", { name: "筛选好友" }).getByRole("button", { name: "已选 3", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "保存好友选择", exact: true }).click();
  await expect(page.getByRole("button", { name: "模拟运行", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "开启每日自动续火花", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "发送记录", exact: true }).click();
  await expect(page.locator(".spark-run")).toHaveCount(2);
  await page.getByRole("button", { name: "检查与同步", exact: true }).click();
  await expect(page.locator(".spark-run")).toHaveCount(2);
  await expect(page.locator(".spark-run").first()).toContainText("模拟运行");
  state.jobs.unshift({ id: "ui-running", kind: "dry_run", source: "manual", status: "running", scheduled_at: now,
    result: { progress: { completed: 1, total: 3, current_name: "阿文" } } });
  await page.getByRole("button", { name: "刷新状态", exact: true }).click();
  await expect(page.locator("#spark-step-4")).toContainText("正在检查 阿文");
  await expect(page.getByRole("progressbar", { name: "当前模拟检查进度", exact: true })).toHaveAttribute("value", "1");
  await page.getByLabel("消息模板（每行一条）").fill("尚未保存的问候");
  await page.getByRole("button", { name: "刷新状态", exact: true }).click();
  await expect(page.getByLabel("消息模板（每行一条）")).toHaveValue("尚未保存的问候");
  await expect(page.getByRole("navigation", { name: "续火花设置步骤" }).getByRole("link", { name: /设置问候/ })).toHaveAttribute("aria-current", "step");
  state.worker.online = false;
  await page.getByRole("button", { name: "刷新状态", exact: true }).click();
  await expect(page.getByText("后台服务暂未连接。配置会保存，任务会等待服务恢复；不会显示为已发送。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "重新扫码连接", exact: true })).toBeDisabled();
});

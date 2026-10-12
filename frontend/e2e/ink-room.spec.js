import { expect, test } from "@playwright/test";

async function login(page) {
  await page.addInitScript(() => localStorage.setItem("yingmo_theme", "system"));
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill("editor_e2e");
  await page.getByLabel("密码", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "登录，继续书写" }).click();
  await expect(page).toHaveURL(/\/home/);
}

async function reviewLayouts(page, testInfo, name, region = page.locator("main")) {
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await expect(region).toBeVisible();
      if (theme === "light" && width === 1440 || theme === "dark" && width === 390) {
        // Content sheets exclude fixed navigation from the long gallery capture.
        // All interaction checks below run with the real navigation visible.
        await region.screenshot({ path: testInfo.outputPath(`${name}-${theme}-${width}.png`), style: ".app-header, .mobile-bottom-nav { visibility: hidden !important; }" });
      }
    }
  }
}

test("export sheet keeps download, failure feedback and retry usable on both papers", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/me/data");
  const downloadButton = page.getByRole("button", { name: "下载 ZIP 导出" });
  await expect(downloadButton).toBeVisible();
  await reviewLayouts(page, testInfo, "export");
  await page.route("**/api/v1/data/export", (route) => route.fulfill({ status: 503, json: { error: { message: "暂时无法打包，请重试。", code: "EXPORT_UNAVAILABLE" } } }), { times: 1 });
  await downloadButton.click();
  await expect(page.getByRole("alert")).toContainText("暂时无法打包");
  await expect(downloadButton).toBeEnabled();
  const downloadEvent = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^ying-mo-member-export-.*\.zip$/);
  expect(await download.failure()).toBeNull();
  await expect(page.getByRole("status")).toContainText("导出文件已生成");
});

test("illustrated install area retains browser prompt and installed states", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/me/settings");
  const panel = page.getByRole("region", { name: "安装映墨", exact: true });
  await expect(panel).toBeVisible();
  await reviewLayouts(page, testInfo, "install", panel);
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = async () => {};
    event.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(event);
  });
  await panel.getByRole("button", { name: "安装映墨", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("已提交安装");
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(panel.getByRole("button", { name: "映墨已安装" })).toBeDisabled();
});

test("inbox, device ledger and version selection keep their actions after the visual upgrade", async ({ page }, testInfo) => {
  let notifications = [{ id: 8101, message: "阿遥回应了你的文章", summary: "读到这里时，想起我们走过的那条路。", is_read: false, target_url: "/articles", created_at: "2026-10-10T08:30:00Z" }, { id: 8102, message: "共同记录里多了一页", is_read: true, target_url: "/collections", created_at: "2026-10-09T08:30:00Z" }];
  const pagination = { page: 1, total: 2, page_size: 20, total_pages: 1 };
  await page.route("**/api/v1/notifications?*", (route) => route.fulfill({ json: { data: notifications, meta: { pagination } } }));
  await page.route("**/api/v1/notifications/8101/read", (route) => {
    notifications = notifications.map((item) => ({ ...item, is_read: true }));
    return route.fulfill({ json: { data: {} } });
  });
  let sessions = [
    { id: 8101, current: false, user_agent: "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Safari/604.1", last_used_at: "2026-10-09T08:30:00Z", created_at: "2026-10-01T08:30:00Z", expires_at: "2026-11-01T08:30:00Z" },
    { id: 8102, current: true, user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36", last_used_at: "2026-10-11T08:30:00Z", created_at: "2026-10-10T08:30:00Z", expires_at: "2026-11-10T08:30:00Z" },
  ];
  await page.route("**/api/v1/auth/sessions", (route) => route.fulfill({ json: { data: sessions } }));
  await page.route("**/api/v1/auth/sessions/8101", (route) => {
    sessions = sessions.filter((session) => session.id !== 8101);
    return route.fulfill({ json: { data: { current: false } } });
  });
  const post = { id: 8101, title: "走过的路，慢慢写", post_type: "article", edit_version: 3 };
  const revision = { id: 8102, source_edit_version: 2, created_at: "2026-10-10T08:30:00Z", reason: "edit", changed_fields: ["body"], snapshot: { title: post.title, post_type: "article", rendered_html: "<h2>那天的晚风</h2><p>把平常的日子，轻轻放在这里。</p>" } };
  await page.route("**/api/v1/posts/me/8101", (route) => route.fulfill({ json: { data: post } }));
  await page.route("**/api/v1/posts/me/8101/revisions?*", (route) => route.fulfill({ json: { data: [revision], meta: { pagination: { ...pagination, total: 1 } } } }));
  await page.route("**/api/v1/posts/me/8101/revisions/8102", (route) => route.fulfill({ json: { data: revision } }));
  await login(page);

  await page.goto("/me/notifications");
  await expect(page.getByRole("button", { name: "标记已读", exact: true })).toBeVisible();
  await reviewLayouts(page, testInfo, "inbox");
  await page.getByRole("button", { name: "标记已读", exact: true }).click();
  await expect(page.locator(".notification-list .unread")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("通知已标记为已读");

  await page.goto("/me/sessions");
  await expect(page.locator(".session-card").first()).toContainText("当前设备");
  await reviewLayouts(page, testInfo, "sessions");
  await page.getByRole("button", { name: "结束会话", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "结束这个登录会话？" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(page.locator(".session-card")).toHaveCount(2);
  await page.getByRole("button", { name: "结束会话", exact: true }).click();
  await dialog.getByRole("button", { name: "结束会话", exact: true }).click();
  await expect(page.locator(".session-card")).toHaveCount(1);

  await page.goto("/me/posts/8101/revisions");
  await expect(page.getByRole("heading", { name: "翻一翻写过的路" })).toBeVisible();
  await reviewLayouts(page, testInfo, "revisions");
  await page.getByRole("button", { name: /版本 2/ }).click();
  await expect(page.getByRole("heading", { name: "那天的晚风" })).toBeVisible();
  await page.getByRole("button", { name: "恢复此版本" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "取消" }).click();
  await expect(page.getByRole("heading", { name: "那天的晚风" })).toBeVisible();
});

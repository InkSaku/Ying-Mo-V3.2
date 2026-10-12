import { expect, test } from "@playwright/test";

test("six illustrated entries show account counts and navigate at every size", async ({ page }, testInfo) => {
  const counts = { posts: 12, drafts: 3, collections: 4, favorites: 8, comments: 16, unread_notifications: 2 };
  await page.route("**/api/v1/users/me/overview", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.data.counts = counts;
    await route.fulfill({ response, json });
  });
  await page.addInitScript(() => localStorage.setItem("yingmo_theme", "system"));
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill("editor_e2e");
  await page.getByLabel("密码", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "登录，继续书写" }).click();
  await expect(page).toHaveURL(/\/home/);
  await page.goto("/me");

  const entries = page.getByRole("navigation", { name: "个人空间入口", exact: true });
  await expect(entries.getByRole("link")).toHaveCount(6);
  const destinations = [
    ["内容，12 则", "/me/posts"], ["草稿，3 份", "/me/posts?status=draft"],
    ["合集，4 册", "/me/collections"], ["收藏，8 则", "/me/favorites"],
    ["评论，16 条", "/me/comments"], ["未读通知，2 封", "/me/notifications"],
  ];
  for (const [label, href] of destinations) await expect(entries.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);

  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const boxes = await entries.getByRole("link").evaluateAll((links) => links.map((link) => {
        const { x, y, width, height } = link.getBoundingClientRect();
        return { x, y, width, height, fits: link.scrollWidth <= link.clientWidth + 1 };
      }));
      expect(boxes.every((box) => box.fits)).toBeTruthy();
      if (width >= 1024) {
        expect(boxes[0].y).toBe(boxes[2].y);
        expect(boxes[3].y).toBeGreaterThan(boxes[0].y);
        expect(boxes[3].y).toBe(boxes[5].y);
      } else if (width === 768) {
        expect(boxes[0].y).toBe(boxes[1].y);
        expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
      } else expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
      if (theme === "light" && width === 1440 || theme === "dark" && width === 390) {
        await page.screenshot({ path: testInfo.outputPath(`personal-room-${theme}-${width}.png`), fullPage: true, style: ".app-header, .mobile-bottom-nav { visibility: hidden !important; }" });
        if (width === 1440) await entries.screenshot({ path: testInfo.outputPath("personal-room-entries.png"), style: ".app-header, .mobile-bottom-nav { visibility: hidden !important; }" });
      }
    }
  }

  await entries.getByRole("link", { name: "内容，12 则", exact: true }).focus();
  await expect(entries.getByRole("link", { name: "内容，12 则", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/me\/posts$/);
  for (const [label, href] of destinations.slice(1)) {
    await page.goto("/me");
    await entries.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === href);
    await expect(page.locator("main h1")).toBeVisible();
  }

  counts.posts = 123456789;
  counts.unread_notifications = 0;
  await page.goto("/me");
  await expect(entries.getByRole("link", { name: "内容，123456789 则", exact: true })).toBeVisible();
  await expect(entries.getByRole("link", { name: "未读通知，0 封", exact: true })).toContainText("信箱先歇一会儿");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

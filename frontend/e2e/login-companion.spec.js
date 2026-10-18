import { expect, test } from "@playwright/test";

const companion = (page) => page.locator(".login-landscape .login-companion");
const password = (page) => page.getByLabel("密码", { exact: true });

test("password reveal preserves typing and the book stays up until hidden", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await expect(companion(page)).toHaveAttribute("data-pose", "welcome");
  await page.screenshot({ path: testInfo.outputPath("01-welcome.png"), fullPage: true });

  await page.mouse.move(1250, 170);
  await expect.poll(() => companion(page).evaluate((element) => element.style.getPropertyValue("--reader-look-x"))).not.toBe("");
  await page.screenshot({ path: testInfo.outputPath("02-follow.png"), fullPage: true });
  await page.getByLabel("用户名或邮箱").fill("a-friend");
  await expect(companion(page)).toHaveAttribute("data-pose", "curious");
  await page.screenshot({ path: testInfo.outputPath("03-username.png"), fullPage: true });
  await password(page).fill("a-password-for-testing");
  await expect(companion(page)).toHaveAttribute("data-pose", "reading");
  await page.screenshot({ path: testInfo.outputPath("04-reading.png"), fullPage: true });

  await password(page).evaluate((input) => input.setSelectionRange(2, 7));
  await page.getByRole("button", { name: "显示密码" }).click();
  await expect(password(page)).toHaveAttribute("type", "text");
  await expect(password(page)).toBeFocused();
  await expect.poll(() => password(page).evaluate((input) => [input.selectionStart, input.selectionEnd])).toEqual([2, 7]);
  await expect(companion(page)).toHaveAttribute("data-pose", "covered");
  await expect(page.getByRole("button", { name: "隐藏密码" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => companion(page).locator(".reader-face").evaluate((face) => getComputedStyle(face).opacity)).toBe("0");
  await expect(companion(page).locator(".reader-book")).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, -62)");
  await page.screenshot({ path: testInfo.outputPath("05-covered.png"), fullPage: true });

  // Pointer movement and leaving the password field must not uncover the face.
  await page.getByLabel("用户名或邮箱").focus();
  await page.mouse.move(50, 50);
  await expect(companion(page)).toHaveAttribute("data-pose", "covered");
  for (let index = 0; index < 5; index += 1) {
    await page.getByRole("button", { name: index % 2 === 0 ? "隐藏密码" : "显示密码" }).click();
  }
  await expect(password(page)).toHaveAttribute("type", "password");
  await expect(password(page)).toHaveValue("a-password-for-testing");
  await expect(companion(page)).toHaveAttribute("data-pose", "curious");
  await page.screenshot({ path: testInfo.outputPath("06-lowered.png"), fullPage: true });

  // Keyboard users keep focus on the reveal button and can move on to submit.
  await password(page).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "显示密码" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "隐藏密码" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "登录", exact: true })).toBeFocused();
});

test("pending login prevents duplicate requests, and errors remain accessible and recoverable", async ({ page }, testInfo) => {
  let release;
  let attempts = 0;
  await page.route("**/api/v1/auth/login", async (route) => {
    attempts += 1;
    await new Promise((resolve) => { release = resolve; });
    await route.fulfill({ status: 401, json: {
      ok: false, error: { code: "INVALID_CREDENTIALS", message: "用户名、邮箱或密码错误。" },
    } });
  });
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill("a-friend");
  await password(page).fill("wrong-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(companion(page)).toHaveAttribute("data-pose", "waiting");
  await expect(page.getByRole("button", { name: "正在登录…" })).toBeDisabled();
  await expect(password(page)).toHaveAttribute("readonly", "");
  await expect(page.getByRole("button", { name: "显示密码" })).toBeDisabled();
  await page.locator(".login-form").evaluate((form) => form.requestSubmit());
  expect(attempts).toBe(1);
  release();
  await expect(page.getByRole("alert")).toHaveText("用户名、邮箱或密码错误。");
  await expect(companion(page)).toHaveAttribute("data-pose", "error");
  await expect(password(page)).toHaveAttribute("aria-invalid", "true");
  await expect(password(page)).toHaveAttribute("aria-describedby", "login-error");
  await page.screenshot({ path: testInfo.outputPath("07-error.png"), fullPage: true });
  await page.getByLabel("用户名或邮箱").fill("corrected-friend");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(password(page)).not.toHaveAttribute("aria-invalid");
});

test("successful login preserves the original URL with a brief transition", async ({ page }, testInfo) => {
  await page.goto("/login?next=" + encodeURIComponent("/me/settings?from=login#profile"));
  await page.getByLabel("用户名或邮箱").fill("editor_e2e");
  await password(page).fill("password123");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/me\/settings\?from=login#profile$/);
  await expect(page.locator(".login-page-turn")).toHaveCount(0);
  await expect(page.locator("#root")).not.toHaveAttribute("inert");
  await page.screenshot({ path: testInfo.outputPath("08-success.png"), fullPage: true });
});

test("light and dark layouts keep the reveal control and illustration usable at every width", async ({ page }, testInfo) => {
  for (const theme of ["light", "dark"]) {
    await page.addInitScript((value) => localStorage.setItem("yingmo_theme", value), theme);
    await page.goto("/login");
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole("button", { name: "显示密码" })).toBeVisible();
      const bounds = await page.getByRole("button", { name: "显示密码" }).boundingBox();
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await password(page).fill("a-long-password-with-no-layout-shift-123456789");
      const before = await page.getByRole("button", { name: "登录", exact: true }).boundingBox();
      await page.getByRole("button", { name: "显示密码" }).click();
      await expect(companion(page)).toHaveAttribute("data-pose", "covered");
      await expect(companion(page).locator(".reader-book")).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, -62)");
      const after = await page.getByRole("button", { name: "登录", exact: true }).boundingBox();
      expect(after).toEqual(before);
      const paper = await companion(page).locator(".reader-book-paper").evaluate((element) => getComputedStyle(element).fill);
      expect(paper).toBe(theme === "dark" ? "rgb(32, 35, 31)" : "rgb(248, 247, 243)");
      if (width === 1440 || width === 390) {
        await page.screenshot({ path: testInfo.outputPath(`covered-${theme}-${width}.png`), fullPage: true });
      }
      await page.getByRole("button", { name: "隐藏密码" }).click();
    }
  }
});

test("touch and reduced-motion retain instant password feedback without pointer tracking", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:8776/login");
  await password(page).fill("test-password");
  await page.getByRole("button", { name: "显示密码" }).tap();
  await expect(password(page)).toHaveAttribute("type", "text");
  await expect(companion(page)).toHaveAttribute("data-pose", "covered");
  await expect.poll(() => companion(page).locator(".reader-book").evaluate((book) => getComputedStyle(book).transitionDuration)).toBe("0s");
  expect(await companion(page).locator(".reader-arrival").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await page.mouse.move(300, 100);
  expect(await companion(page).evaluate((element) => element.style.getPropertyValue("--reader-look-x"))).toBe("");
  await page.getByRole("button", { name: "隐藏密码" }).tap();
  await expect(password(page)).toHaveValue("test-password");
  await expect(password(page)).toHaveAttribute("type", "password");
  await page.screenshot({ path: testInfo.outputPath("touch-reduced-motion.png"), fullPage: true });
  await context.close();
});

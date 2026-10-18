import { expect, test } from "@playwright/test";

async function holdInk(page) {
  await page.addInitScript(() => {
    localStorage.setItem("yingmo_theme", "light");
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const animation = animate.call(this, frames, options);
      if (options?.pseudoElement === "::view-transition-new(root)") {
        animation.pause();
        animation.currentTime = 190;
        window.inkTestAnimation = animation;
        window.inkTestFrames = frames;
      }
      return animation;
    };
  });
}

test("black and white ink reveal the real theme while photographs and draft text stay intact", async ({ page }, testInfo) => {
  await holdInk(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dev/theme-ink");
    const photo = page.locator(".ink-preview-photo img");
    await photo.evaluate((image) => image.decode());
    await page.evaluate(() => document.fonts.ready);
    const input = page.getByLabel("随手写一点");
    await input.fill("没有保存的这一句，换色后也还在。");
    await input.evaluate((element) => { window.inkTestInput = element; element.setSelectionRange(2, 7); });
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const theme of ["dark", "light"]) {
      const button = page.getByRole("button", { name: theme === "dark" ? "换成深色纸" : "换成浅色纸", exact: true });
      const box = await button.boundingBox();
      await button.click();
      await expect(page.locator("html")).toHaveAttribute("data-theme-ink", theme);
      await expect.poll(() => page.evaluate(() => window.inkTestAnimation?.playState)).toBe("paused");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const origin = await page.evaluate(() => ({
        x: parseFloat(document.documentElement.style.getPropertyValue("--ink-x")),
        y: parseFloat(document.documentElement.style.getPropertyValue("--ink-y")),
        frames: window.inkTestFrames.length,
        clip: getComputedStyle(document.documentElement, "::view-transition-new(root)").clipPath,
      }));
      expect(origin.x).toBeCloseTo(box.x + box.width / 2, 0);
      expect(origin.y).toBeCloseTo(box.y + box.height / 2, 0);
      expect(origin.frames).toBeGreaterThan(20);
      expect(origin.clip).toContain("polygon");
      await page.screenshot({ path: testInfo.outputPath(`ink-${theme}-${width}.png`) });
      await expect(page.locator("html")).toHaveAttribute("data-theme-ink", theme);
      await page.evaluate(() => window.inkTestAnimation.finish());
      await expect(page.locator("html")).not.toHaveAttribute("data-theme-ink");
      await expect(input).toHaveValue("没有保存的这一句，换色后也还在。");
      expect(await input.evaluate((element) => element === window.inkTestInput)).toBe(true);
      await expect(photo).toHaveCSS("filter", "none");
      await expect(page.locator("#root")).not.toHaveAttribute("inert");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
  }
});

test("same-colour choices, system updates and reloads do not play ink", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    localStorage.removeItem("yingmo_theme");
    window.inkTestCalls = 0;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = (...args) => { window.inkTestCalls++; return start(...args); };
  });
  await page.goto("/about");
  await expect(page.locator(".theme-toggle")).toHaveAccessibleName(/当前主题：跟随系统/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => window.inkTestCalls)).toBe(0);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator(".theme-toggle").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".theme-toggle")).toHaveAccessibleName(/当前主题：浅色/);
  expect(await page.evaluate(() => window.inkTestCalls)).toBe(0);
  await page.reload();
  await expect(page.locator(".theme-toggle")).toBeVisible();
  expect(await page.evaluate(() => window.inkTestCalls)).toBe(0);
});

test("interruption or another choice immediately releases the page and keeps the latest preference", async ({ page }) => {
  await holdInk(page);
  for (const interruption of ["resize", "scroll", "escape", "repeat", "motion", "navigate"]) {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dev/theme-ink");
    await page.getByRole("button", { name: "换成深色纸", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.inkTestAnimation?.playState)).toBe("paused");
    if (interruption === "resize") await page.setViewportSize({ width: 390, height: 900 });
    if (interruption === "scroll") await page.mouse.wheel(0, 200);
    if (interruption === "escape") await page.keyboard.press("Escape");
    if (interruption === "motion") await page.emulateMedia({ reducedMotion: "reduce" });
    if (interruption === "navigate") await page.getByRole("link", { name: "关于映墨", exact: true }).click();
    if (interruption === "repeat") {
      await page.getByRole("button", { name: "换成浅色纸", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      await page.evaluate(() => window.inkTestAnimation.finish());
    }
    await expect(page.locator("html")).not.toHaveAttribute("data-theme-ink");
    await expect(page.locator("html")).toHaveAttribute("data-theme", interruption === "repeat" ? "light" : "dark");
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--ink-x"))).toBe("");
    await expect(page.locator("#root")).not.toHaveAttribute("inert");
    if (interruption === "navigate") await expect(page).toHaveURL(/\/about$/);
  }
});

test("keyboard starts ink at the control; reduced motion and unsupported browsers still switch", async ({ page }) => {
  await holdInk(page);
  await page.goto("/dev/theme-ink");
  const button = page.getByRole("button", { name: "换成深色纸", exact: true });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.inkTestAnimation?.playState)).toBe("paused");
  await expect(page.locator(".ink-preview-switch")).toBeFocused();
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "换成浅色纸", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme-ink");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => { document.startViewTransition = undefined; });
  await page.getByRole("button", { name: "换成深色纸", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme-ink");
  await page.reload();
  await expect(page.getByRole("heading", { name: "换一页光线。" })).toBeVisible();
});

test("normal ink finishes on its own and persists the chosen theme", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/dev/theme-ink");
  const before = await page.locator("html").getAttribute("data-theme");
  await page.locator(".ink-preview-switch").click();
  const next = before === "dark" ? "light" : "dark";
  await expect(page.locator("html")).toHaveAttribute("data-theme-ink", next);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme-ink", { timeout: 1100 });
  await expect(page.locator("html")).toHaveAttribute("data-theme", next);
  expect(await page.evaluate(() => localStorage.getItem("yingmo_theme"))).toBe(next);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", next);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme-ink");
  expect(errors.filter((message) => !message.includes("401"))).toEqual([]);
});

import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const account = { username: "notes_layout_e2e", password: "password123" };

async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

test("Notes preserves readable dates, photos and filters across viewport sizes", async ({ page, request }, testInfo) => {
  const registration = await request.post("/api/v1/auth/register", { data: { ...account, nickname: "随记验收", email: "notes-layout@example.com", invite_code: "e2e-invite" } });
  expect(registration.status()).toBe(201);
  const headers = { Authorization: `Bearer ${(await registration.json()).data.access_token}` };
  const uploaded = await request.post("/api/v1/uploads/images", { headers, multipart: { file: { name: "coast.jpg", mimeType: "image/jpeg", buffer: await readFile(new URL("../src/assets/home/coast.jpg", import.meta.url)) } } });
  expect(uploaded.status()).toBe(201);
  const media = (await uploaded.json()).data;
  const noteIds = [];
  for (let index = 0; index < 4; index++) {
    const draft = await request.post("/api/v1/posts", { headers, data: {
      post_type: "note", visibility: "login_only",
      body: ["雨停了。绕远走回家，发现巷口的桂花已经开了。", "在海边坐到太阳落下，今天没有什么大事，却很想记住。", "把没读完的书翻到昨天折角的那一页。风从窗边吹过来，正好。", "午后的一杯茶。"][index],
      occurred_at: `${index === 0 ? "2025" : "2026"}-09-0${index + 1}T10:00:00Z`,
      ...(index === 1 ? { cover_media_id: media.id, title: "潮声之后", location: "海边", mood: "平静" } : {}),
    } });
    expect(draft.status()).toBe(201);
    const note = (await draft.json()).data;
    noteIds.push(note.id);
    expect((await request.post(`/api/v1/posts/${note.id}/publish`, { headers, data: {} })).ok()).toBeTruthy();
  }
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill(account.username);
  await page.getByLabel("密码").fill(account.password);
  await page.getByRole("button", { name: /登录，继续书写/ }).click();
  await expect(page).toHaveURL(/\/home/);
  await page.goto("/notes");
  await expect(page.locator(".post-card-journal")).toHaveCount(4);
  await expect(page.locator(".note-journal-period")).toHaveCount(2);
  await expect(page.locator(".post-filters-controls")).toBeHidden();
  await page.getByRole("button", { name: /展开/ }).click();
  await expect(page.locator(".post-filters-controls")).toBeVisible();
  await page.getByRole("button", { name: /收起/ }).click();
  await expect(page.locator(".post-card-journal .card-cover")).toBeVisible();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const rows = await page.locator(".post-card-journal").evaluateAll(elements => elements.map(el => { const rect = el.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom }; }));
    for (let i = 1; i < rows.length; i++) expect(rows[i].top).toBeGreaterThanOrEqual(rows[i - 1].bottom);
    await page.screenshot({ path: testInfo.outputPath(`notes-${width}.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/notes/${noteIds[1]}`);
  await expect(page.getByRole("heading", { level: 1, name: "潮声之后" })).toBeVisible();
  await expect(page.locator(".note-detail-cover")).toBeVisible();
  await expect(page.locator(".note-detail-moment")).toContainText("海边");
  const titledLayout = await page.evaluate(() => {
    const margin = document.querySelector(".note-detail-margin").getBoundingClientRect();
    const intro = document.querySelector(".note-detail-intro").getBoundingClientRect();
    const body = document.querySelector(".note-detail-content").getBoundingClientRect();
    return { margin, intro, body };
  });
  expect(titledLayout.intro.left).toBeGreaterThan(titledLayout.margin.right);
  expect(titledLayout.body.width).toBeLessThanOrEqual(760);
  await page.screenshot({ path: testInfo.outputPath("note-detail-titled-cover-desktop.png"), fullPage: true });

  await page.goto(`/notes/${noteIds[0]}`);
  await expect(page.locator(".note-detail.without-title.without-cover")).toBeVisible();
  await expect(page.locator(".note-detail-header h1")).toHaveClass(/sr-only/);
  await expect(page.locator(".note-detail-cover")).toHaveCount(0);
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("note-detail-untitled-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/notes/${noteIds[1]}`);
  await expect(page.locator(".note-detail-margin .notes-opening-sketch")).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("note-detail-mobile.png"), fullPage: true });
});

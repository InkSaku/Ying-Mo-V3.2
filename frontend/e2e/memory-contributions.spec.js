import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function register(request, username) {
  const response = await request.post("/api/v1/auth/register", { data: {
    username,
    nickname: username === "memory_e2e_root" ? "阿青" : "小林",
    email: `${username}@example.com`,
    password: "password123",
    invite_code: "e2e-invite",
  } });
  expect(response.status()).toBe(201);
  return (await response.json()).data;
}

async function login(page, username) {
  await page.goto("/login");
  await page.getByPlaceholder("请输入用户名或邮箱").fill(username);
  await page.getByPlaceholder("请输入密码").fill("password123");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
}

test("a collection member adds a photo and sentence to a shared memory", async ({ page, request }) => {
  const creator = await register(request, "memory_e2e_root");
  const member = await register(request, "memory_e2e_friend");
  const creatorHeaders = { Authorization: `Bearer ${creator.access_token}` };
  const collectionResponse = await request.post("/api/v1/collections", {
    headers: creatorHeaders,
    data: { name: "毕业旅行", slug: "memory-e2e-trip", member_ids: [member.user.id] },
  });
  expect(collectionResponse.status()).toBe(201);
  const collection = (await collectionResponse.json()).data;
  const draftResponse = await request.post("/api/v1/posts", {
    headers: creatorHeaders,
    data: {
      post_type: "note",
      collection_id: collection.id,
      body: "毕业旅行第二天，我们在海边看到了日出。",
      occurred_at: "2026-07-03T05:30:00Z",
      location: "海边",
    },
  });
  const rootDraft = (await draftResponse.json()).data;
  const publishResponse = await request.post(`/api/v1/posts/${rootDraft.id}/publish`, {
    headers: creatorHeaders, data: {},
  });
  expect(publishResponse.ok()).toBeTruthy();

  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "memory_e2e_friend");
  await page.goto(`/notes/${rootDraft.id}`);
  await expect(page.getByRole("heading", { name: "共同回忆" })).toBeVisible();
  await expect(page.getByText("1 人留下了 1 条记录。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "补充我的视角" }).click();
  await expect(page.getByText("发布到《毕业旅行》· 当前合集成员可见")).toBeVisible();
  await page.getByRole("textbox", { name: "共同回忆补充正文" }).fill("这是我从另一边拍到的日出。");
  const png = await readFile(new URL("../public/pwa-192.png", import.meta.url));
  await page.locator(".memory-composer input[type=file]").setInputFiles({
    name: "sunrise.png", mimeType: "image/png", buffer: png,
  });
  await expect(page.locator(".memory-composer-images img")).toHaveCount(1);
  await page.getByRole("button", { name: "发布补充" }).click();

  await expect(page.getByText("2 人留下了 2 条记录。", { exact: true })).toBeVisible();
  await expect(page.locator(".shared-memory-list")).toContainText("这是我从另一边拍到的日出。");
  await expect(page.locator(".shared-memory-list img")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  await page.reload();
  await expect(page.locator(".shared-memory-list")).toContainText("这是我从另一边拍到的日出。");
});

import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const account = { username: `image_upload_${Date.now().toString(36)}`, password: "password123" };
const jpegPath = fileURLToPath(new URL("../src/assets/home/coast.jpg", import.meta.url));
let collection;

async function login(page) {
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill(account.username);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
}

test.beforeAll(async ({ request }) => {
  const response = await request.post("/api/v1/auth/register", { data: {
    ...account, nickname: "图片上传验收", email: `${account.username}@example.com`, invite_code: "e2e-invite",
  } });
  expect(response.status()).toBe(201);
  const token = (await response.json()).data.access_token;
  const created = await request.post("/api/v1/collections", {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: "图片上传验收", slug: account.username.replaceAll("_", "-"), member_ids: [] },
  });
  expect(created.status()).toBe(201);
  collection = (await created.json()).data;
});

test("avatar confirmation uploads the selected JPEG and persists after reload", async ({ page }) => {
  await login(page);
  await page.goto("/me/settings");
  const avatar = page.locator(".avatar-manager");
  await avatar.locator("input[type=file]").setInputFiles(jpegPath);
  await expect(avatar.getByAltText("待确认的新头像预览")).toBeVisible();
  await avatar.getByRole("button", { name: "确认设置头像", exact: true }).click();
  await expect(avatar.locator(".inline-success[role=status]")).toHaveText("头像已设置。");
  await expect(avatar.locator(".inline-error")).toHaveCount(0);
  await expect(avatar.getByAltText("当前头像")).toBeVisible();
  await page.reload();
  await expect(avatar.getByAltText("当前头像")).toBeVisible();
});

test("collection cover accepts GIF and persists after reload", async ({ page }) => {
  await login(page);
  await page.goto(`/collections/${collection.slug}/manage`);
  const cover = page.locator(".collection-cover-manager");
  await cover.locator("input[type=file]").setInputFiles({
    name: "cover.gif", mimeType: "image/gif",
    buffer: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
  });
  await expect(cover.locator(".inline-success[role=status]")).toHaveText("Collection 封面已更新。");
  await expect(cover.locator(".inline-error")).toHaveCount(0);
  await expect(cover.getByAltText("当前 Collection 封面")).toBeVisible();
  await page.reload();
  await expect(cover.getByAltText("当前 Collection 封面")).toBeVisible();
});

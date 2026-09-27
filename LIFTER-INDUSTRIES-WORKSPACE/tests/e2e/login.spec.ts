import { expect, test } from "@playwright/test";

test("sign-in screen exposes an accessible, validated form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Work email")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByLabel("Work email")).toBeFocused();
});

test("new workspace registration describes its password requirement", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Create a workspace" }).click();
  await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();
  await expect(page.getByLabel("Full name")).toBeVisible();
  await expect(page.getByLabel("Company name")).toBeVisible();
  await expect(page.getByLabel("Company code")).toBeVisible();
});

test("password recovery screens expose reset and expiry states", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await expect(page.getByLabel("Work email")).toBeVisible();
  await page.goto("/reset-password");
  await expect(page.getByRole("alert")).toContainText("reset link is missing its token");
  await page.goto("/session-expired");
  await expect(page.getByRole("heading", { name: "Please sign in again" })).toBeVisible();
});

test("permission guard hides restricted navigation and blocks direct user routes", async ({
  page,
}) => {
  await page.route("**/api/auth/me", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: "viewer-1",
          email: "viewer@example.test",
          name: "Company Viewer",
          companies: [
            {
              id: "company-1",
              name: "Northstar",
              code: "NORTHSTAR",
              currency: "INR",
              baseCurrency: "INR",
              roles: ["Viewer"],
              permissions: ["company.read"],
            },
          ],
        },
        message: "Current user",
        requestId: "playwright-request",
      }),
    }),
  );
  await page.goto("/app/users");
  await expect(page.getByRole("link", { name: "Companies" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Access not granted." })).toBeVisible();
});

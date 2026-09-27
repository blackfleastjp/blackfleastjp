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
});

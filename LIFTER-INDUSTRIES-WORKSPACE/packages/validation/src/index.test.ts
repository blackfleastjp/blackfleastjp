import { describe, expect, it } from "vitest";
import {
  assignRolePermissionsSchema,
  createCompanySchema,
  createUserSchema,
  strongPasswordSchema,
} from "./index.js";

describe("company and user validation", () => {
  it("accepts a valid Indian company identity and normalizes fields", () => {
    const result = createCompanySchema.parse({
      name: "Northstar Components",
      code: "northstar-01",
      gstin: "27ABCDE1234F1Z5",
      pan: "ABCDE1234F",
      pincode: "560001",
      baseCurrency: "inr",
    });
    expect(result.code).toBe("NORTHSTAR-01");
    expect(result.baseCurrency).toBe("INR");
  });

  it("rejects a GSTIN whose embedded PAN does not match", () => {
    const result = createCompanySchema.safeParse({
      name: "Northstar Components",
      code: "NORTHSTAR",
      gstin: "27ABCDE1234F1Z5",
      pan: "AAAAA1234A",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.some((issue) => issue.path[0] === "gstin")).toBe(true);
  });

  it("normalizes valid Indian mobiles and rejects invalid ranges", () => {
    const user = createUserSchema.parse({
      name: "Taylor Employee",
      email: "TAYLOR@EXAMPLE.TEST",
      employeeCode: "EMP-7",
      mobile: "+91 9876543210",
      roleId: "role-1",
    });
    expect(user.mobile).toBe("9876543210");
    expect(
      createUserSchema.safeParse({
        name: "Taylor Employee",
        email: "taylor@example.test",
        employeeCode: "EMP-7",
        mobile: "1234567890",
        roleId: "role-1",
      }).success,
    ).toBe(false);
  });

  it("requires strong passwords and unique permission IDs", () => {
    expect(strongPasswordSchema.safeParse("Short1!").success).toBe(false);
    expect(strongPasswordSchema.safeParse("Ledgerline-Secure-2026!").success).toBe(true);
    expect(assignRolePermissionsSchema.safeParse({ permissionIds: ["p1", "p1"] }).success).toBe(
      false,
    );
  });
});

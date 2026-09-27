import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import supertest from "supertest";
import { prisma } from "./lib/prisma.js";
import { app } from "./app.js";

vi.mock("./lib/prisma.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    company: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    permission: { findMany: vi.fn() },
    userCompanyRole: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    rolePermission: { deleteMany: vi.fn(), createMany: vi.fn() },
    passwordResetToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    backgroundJob: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    loginEvent: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    refreshToken: { create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  },
}));

const apiRequest = supertest(app);

function accessToken(userId = "actor-1"): string {
  return jwt.sign(
    { email: "admin@example.test", type: "access" },
    process.env["JWT_ACCESS_SECRET"]!,
    {
      subject: userId,
      expiresIn: 60,
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("health endpoints", () => {
  it("returns a request-correlated liveness response", async () => {
    const response = await apiRequest.get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { status: "ok" } });
    expect(response.body.requestId).toBe(response.headers["x-request-id"]);
  });

  it("checks the database before reporting readiness", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);
    const response = await apiRequest.get("/api/ready");
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ status: "ready", database: "connected" });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it("does not report readiness when the database is unavailable", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("Database unavailable"));
    const response = await apiRequest.get("/api/ready");
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: "DATABASE_UNAVAILABLE" },
    });
  });
});

describe("serverless background job worker", () => {
  it("requires its separate worker credential", async () => {
    const response = await apiRequest.get("/api/jobs/process");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("JOB_PROCESSOR_UNAUTHORIZED");
  });

  it("claims no work when the queue is empty", async () => {
    const transaction = { backgroundJob: { findFirst: vi.fn().mockResolvedValue(null) } };
    vi.mocked(prisma.$transaction).mockImplementation(
      async (operation) =>
        (operation as unknown as (client: typeof transaction) => Promise<unknown>)(
          transaction as never,
        ) as never,
    );
    const response = await apiRequest
      .get("/api/jobs/process")
      .set("Authorization", `Bearer ${process.env["JOB_PROCESSOR_SECRET"]}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ processed: false, job: null });
    expect(transaction.backgroundJob.findFirst).toHaveBeenCalledOnce();
  });
});

describe("authentication foundation", () => {
  it("registers a company administrator with seeded permissions and an audit event", async () => {
    const createdUser = { id: "new-user", email: "owner@example.test", name: "Workspace Owner" };
    const createdCompany = { id: "new-company", name: "Northstar", code: "NORTHSTAR" };
    const createdRole = { id: "new-role" };
    const memberships = [
      {
        company: {
          id: createdCompany.id,
          name: createdCompany.name,
          code: createdCompany.code,
          currency: "INR",
          baseCurrency: "INR",
        },
        role: {
          name: "Administrator",
          permissions: [{ permission: { key: "company.create" } }],
        },
      },
    ];
    const transaction = {
      user: {
        create: vi.fn().mockResolvedValue(createdUser),
        update: vi.fn().mockResolvedValue({}),
      },
      company: { create: vi.fn().mockResolvedValue(createdCompany) },
      role: { create: vi.fn().mockResolvedValue(createdRole) },
      userCompanyRole: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    vi.mocked(prisma.$transaction).mockImplementation(
      async (operation) =>
        (operation as unknown as (client: typeof transaction) => Promise<unknown>)(
          transaction as never,
        ) as never,
    );
    vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...createdUser,
      companyRoles: memberships,
    } as never);

    const response = await apiRequest.post("/api/auth/register").send({
      email: createdUser.email,
      name: createdUser.name,
      companyName: createdCompany.name,
      companyCode: createdCompany.code,
      password: "Ledgerline-Secure-2026!",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.user.companies[0]).toMatchObject({
      id: createdCompany.id,
      code: createdCompany.code,
      permissions: ["company.create"],
    });
    expect(transaction.role.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: createdCompany.id,
          name: "Administrator",
          permissions: { create: expect.any(Array) },
        }),
      }),
    );
    expect(transaction.userCompanyRole.create).toHaveBeenCalledWith({
      data: { userId: createdUser.id, companyId: createdCompany.id, roleId: createdRole.id },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "auth.register" }) }),
    );
  });

  it("validates login input before accessing the database", async () => {
    const response = await apiRequest
      .post("/api/auth/login")
      .send({ email: "not-an-email", password: "" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns a consistent client error for malformed JSON", async () => {
    const response = await apiRequest
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{");
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: "INVALID_JSON", message: "Request body must contain valid JSON" },
    });
  });

  it("requires a valid access token for the current-user endpoint", async () => {
    const response = await apiRequest.get("/api/auth/me");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects an expired access token without querying the user", async () => {
    const expiredAccessToken = jwt.sign(
      { email: "admin@example.test", type: "access" },
      process.env["JWT_ACCESS_SECRET"]!,
      { subject: "user-1", expiresIn: -1 },
    );
    const response = await apiRequest
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${expiredAccessToken}`);
    expect(response.status).toBe(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("creates a hashed refresh session and returns an access token on login", async () => {
    const user = {
      id: "user-1",
      email: "admin@example.test",
      name: "Admin User",
      passwordHash: "stored-hash",
      isActive: true,
    };
    user.passwordHash = await bcrypt.hash("a-valid-password", 4);
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(user as never)
      .mockResolvedValueOnce({ ...user, companyRoles: [] } as never);
    vi.mocked(prisma.loginEvent.create).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);
    const response = await apiRequest
      .post("/api/auth/login")
      .send({ email: user.email, password: "a-valid-password" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.user).toMatchObject({
      id: user.id,
      email: user.email,
      companies: [],
    });
    expect(response.headers["set-cookie"]?.[0] ?? "").toContain("HttpOnly");
    expect(prisma.refreshToken.create).toHaveBeenCalledOnce();
    expect(vi.mocked(prisma.refreshToken.create).mock.calls[0]?.[0].data.tokenHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it("rotates refresh tokens and revokes sessions when an old token is reused", async () => {
    const refreshToken = jwt.sign({ type: "refresh" }, process.env["JWT_REFRESH_SECRET"]!, {
      subject: "user-1",
      expiresIn: 60,
    });
    const tokenHash = createHash("sha256").update(refreshToken).digest("hex");
    const currentToken = {
      id: "refresh-current",
      userId: "user-1",
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    };
    const user = {
      id: "user-1",
      email: "admin@example.test",
      name: "Admin User",
      companyRoles: [],
    };
    const transaction = {
      refreshToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: "refresh-next" }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    vi.mocked(prisma.refreshToken.findUnique)
      .mockResolvedValueOnce(currentToken as never)
      .mockResolvedValueOnce({ ...currentToken, revokedAt: new Date() } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);
    vi.mocked(prisma.refreshToken.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.$transaction).mockImplementation(
      async (operation) =>
        (operation as unknown as (client: typeof transaction) => Promise<unknown>)(
          transaction as never,
        ) as never,
    );

    const response = await apiRequest
      .post("/api/auth/refresh")
      .set("Cookie", `erp_refresh=${refreshToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(transaction.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: currentToken.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(transaction.refreshToken.create).toHaveBeenCalledOnce();
    expect(transaction.refreshToken.update).toHaveBeenCalledWith({
      where: { id: currentToken.id },
      data: { replacedBy: "refresh-next" },
    });
    expect(vi.mocked(transaction.refreshToken.create).mock.calls[0]?.[0].data.tokenHash).not.toBe(
      tokenHash,
    );

    const replay = await apiRequest
      .post("/api/auth/refresh")
      .set("Cookie", `erp_refresh=${refreshToken}`);
    expect(replay.status).toBe(401);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: currentToken.userId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("rejects an expired refresh token before looking up its session", async () => {
    const expiredToken = jwt.sign({ type: "refresh" }, process.env["JWT_REFRESH_SECRET"]!, {
      subject: "user-1",
      expiresIn: -1,
    });
    const response = await apiRequest
      .post("/api/auth/refresh")
      .set("Cookie", `erp_refresh=${expiredToken}`);
    expect(response.status).toBe(401);
    expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
  });

  it("audits and rejects a wrong password", async () => {
    const passwordHash = await bcrypt.hash("correct-password-1!", 4);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      email: "admin@example.test",
      name: "Admin User",
      passwordHash,
      isActive: true,
      deletedAt: null,
      companyId: "company-1",
    } as never);
    vi.mocked(prisma.loginEvent.create).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const response = await apiRequest
      .post("/api/auth/login")
      .send({ email: "admin@example.test", password: "wrong-password-1!" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(prisma.loginEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ succeeded: false }) }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "auth.login.failed" }) }),
    );
  });

  it("logs out the cookie session and records the actor", async () => {
    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue({ userId: "actor-1" } as never);
    vi.mocked(prisma.refreshToken.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const response = await apiRequest
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken()}`)
      .set("Cookie", "erp_refresh=opaque-session-token");

    expect(response.status).toBe(200);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledOnce();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "auth.logout", userId: "actor-1" }),
      }),
    );
  });

  it("rejects an expired password-reset token without changing the user", async () => {
    const transaction = {
      passwordResetToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: "reset-1",
          userId: "user-1",
          usedAt: null,
          expiresAt: new Date(Date.now() - 1000),
          user: { isActive: true, deletedAt: null, companyId: "company-1" },
        }),
        updateMany: vi.fn(),
      },
      user: { update: vi.fn() },
    };
    vi.mocked(prisma.$transaction).mockImplementation(
      async (operation) =>
        (operation as unknown as (client: typeof transaction) => Promise<unknown>)(
          transaction as never,
        ) as never,
    );

    const response = await apiRequest
      .post("/api/auth/reset-password")
      .send({ token: "T".repeat(43), password: "Ledgerline-Secure-2026!" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
    expect(transaction.passwordResetToken.updateMany).not.toHaveBeenCalled();
    expect(transaction.user.update).not.toHaveBeenCalled();
  });

  it("returns the same forgot-password response for an unknown address", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const response = await apiRequest
      .post("/api/auth/forgot-password")
      .send({ email: "unknown@example.test" });
    expect(response.status).toBe(200);
    expect(response.body.message).toContain("If the account exists");
    expect(response.body.data).toEqual({});
  });
});

describe("company management authorization", () => {
  it("does not resolve a company ID outside the selected company context", async () => {
    vi.mocked(prisma.userCompanyRole.findMany).mockResolvedValueOnce([
      { role: { permissions: [{ permission: { key: "company.read" } }] } },
    ] as never);

    const response = await apiRequest
      .get("/api/companies/company-2")
      .set("Authorization", `Bearer ${accessToken()}`)
      .set("X-Company-Id", "company-1");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("COMPANY_NOT_FOUND");
    expect(prisma.company.findFirst).not.toHaveBeenCalled();
  });

  it("denies company details when the active membership lacks company.read", async () => {
    vi.mocked(prisma.userCompanyRole.findMany).mockResolvedValueOnce([
      { role: { permissions: [{ permission: { key: "users.read" } }] } },
    ] as never);

    const response = await apiRequest
      .get("/api/companies/company-1")
      .set("Authorization", `Bearer ${accessToken()}`)
      .set("X-Company-Id", "company-1");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(prisma.company.findFirst).not.toHaveBeenCalled();
  });
});

describe("user and role management APIs", () => {
  it("does not resolve a user ID outside the active company", async () => {
    vi.mocked(prisma.userCompanyRole.findMany).mockResolvedValueOnce([
      { role: { permissions: [{ permission: { key: "users.read" } }] } },
    ] as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const response = await apiRequest
      .get("/api/users/user-from-another-company")
      .set("Authorization", `Bearer ${accessToken()}`)
      .set("X-Company-Id", "company-1");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("USER_NOT_FOUND");
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: "user-from-another-company", companyId: "company-1", deletedAt: null },
      select: expect.any(Object),
    });
  });

  it("creates a user with an active company role and writes audit records", async () => {
    const companyId = "company-1";
    const newUser = {
      id: "user-new",
      name: "Taylor Employee",
      email: "taylor@example.test",
      employeeCode: "EMP-7",
      department: "Finance",
      designation: "Analyst",
      mobile: "9876543210",
      alternateEmail: null,
      dateOfJoining: null,
      passwordHash: "temporary-hash",
      companyId,
      isActive: true,
      deletedAt: null,
    };
    const transaction = {
      user: { create: vi.fn().mockResolvedValue(newUser) },
      userCompanyRole: { create: vi.fn().mockResolvedValue({}) },
      passwordResetToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({}),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    vi.mocked(prisma.userCompanyRole.findMany).mockResolvedValueOnce([
      { role: { permissions: [{ permission: { key: "users.create" } }] } },
    ] as never);
    vi.mocked(prisma.role.findFirst).mockResolvedValue({
      id: "role-finance",
      name: "Finance",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.$transaction).mockImplementation(
      async (operation) =>
        (operation as unknown as (client: typeof transaction) => Promise<unknown>)(
          transaction as never,
        ) as never,
    );

    const response = await apiRequest
      .post("/api/users")
      .set("Authorization", `Bearer ${accessToken()}`)
      .set("X-Company-Id", companyId)
      .send({
        name: "Taylor Employee",
        email: "taylor@example.test",
        employeeCode: "EMP-7",
        department: "Finance",
        designation: "Analyst",
        mobile: "9876543210",
        roleId: "role-finance",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({ id: "user-new", employeeCode: "EMP-7" });
    expect(response.body.data.resetToken).toEqual(expect.any(String));
    expect(transaction.userCompanyRole.create).toHaveBeenCalledWith({
      data: { userId: "user-new", companyId, roleId: "role-finance" },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(3);
  });

  it("assigns only company-owned roles atomically", async () => {
    const companyId = "company-1";
    const transaction = {
      userCompanyRole: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ roleId: "role-old" }])
          .mockResolvedValueOnce([{ role: { id: "role-new", name: "Finance" } }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        upsert: vi.fn().mockResolvedValue({}),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    vi.mocked(prisma.userCompanyRole.findMany).mockResolvedValueOnce([
      { role: { permissions: [{ permission: { key: "users.update" } }] } },
    ] as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(prisma.role.findMany).mockResolvedValue([
      { id: "role-new", name: "Finance" },
    ] as never);
    vi.mocked(prisma.$transaction).mockImplementation(
      async (operation) =>
        (operation as unknown as (client: typeof transaction) => Promise<unknown>)(
          transaction as never,
        ) as never,
    );

    const response = await apiRequest
      .put("/api/users/user-1/roles")
      .set("Authorization", `Bearer ${accessToken()}`)
      .set("X-Company-Id", companyId)
      .send({ roleIds: ["role-new"] });

    expect(response.status).toBe(200);
    expect(response.body.data.roles).toEqual([{ id: "role-new", name: "Finance" }]);
    expect(transaction.userCompanyRole.upsert).toHaveBeenCalledWith({
      where: { userId_companyId_roleId: { userId: "user-1", companyId, roleId: "role-new" } },
      update: { isActive: true },
      create: { userId: "user-1", companyId, roleId: "role-new", isActive: true },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledOnce();
  });

  it("assigns a role permission matrix transactionally and audits the change", async () => {
    const permission = {
      id: "permission-users-read",
      key: "users.read",
      name: "View users",
      module: "users",
      action: "read",
    };
    const transaction = {
      role: {
        findFirst: vi.fn().mockResolvedValue({
          id: "role-1",
          companyId: "company-1",
          name: "Operations",
          isSystem: false,
          permissions: [{ permission: { id: "permission-old", key: "company.read" } }],
        }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "role-1",
          name: "Operations",
          permissions: [{ permission }],
        }),
      },
      rolePermission: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    vi.mocked(prisma.userCompanyRole.findMany).mockResolvedValueOnce([
      { role: { permissions: [{ permission: { key: "roles.assign-permissions" } }] } },
    ] as never);
    vi.mocked(prisma.permission.findMany).mockResolvedValue([permission] as never);
    vi.mocked(prisma.$transaction).mockImplementation(
      async (operation) =>
        (operation as unknown as (client: typeof transaction) => Promise<unknown>)(
          transaction as never,
        ) as never,
    );

    const response = await apiRequest
      .put("/api/roles/role-1/assign-permissions")
      .set("Authorization", `Bearer ${accessToken()}`)
      .set("X-Company-Id", "company-1")
      .send({ permissionIds: [permission.id] });

    expect(response.status).toBe(200);
    expect(response.body.data.permissions).toEqual([permission]);
    expect(transaction.rolePermission.deleteMany).toHaveBeenCalledWith({
      where: { roleId: "role-1" },
    });
    expect(transaction.rolePermission.createMany).toHaveBeenCalledWith({
      data: [{ roleId: "role-1", permissionId: permission.id }],
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "roles.permissions-updated" }),
      }),
    );
  });

  it("serves the permission catalog only to members with permissions.read", async () => {
    vi.mocked(prisma.userCompanyRole.findMany).mockResolvedValueOnce([
      { role: { permissions: [{ permission: { key: "permissions.read" } }] } },
    ] as never);
    vi.mocked(prisma.permission.findMany).mockResolvedValue([
      {
        id: "permission-1",
        key: "users.read",
        name: "View users",
        module: "users",
        action: "read",
        description: null,
      },
    ] as never);

    const response = await apiRequest
      .get("/api/permissions")
      .set("Authorization", `Bearer ${accessToken()}`)
      .set("X-Company-Id", "company-1");

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      key: "users.read",
      module: "users",
      action: "read",
    });
  });
});

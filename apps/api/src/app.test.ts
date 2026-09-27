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
    user: { findUnique: vi.fn() },
    loginEvent: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    refreshToken: { create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  },
}));

const apiRequest = supertest(app);

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

describe("authentication foundation", () => {
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
});

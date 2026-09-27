import { createHash, randomBytes } from "node:crypto";
import { parseDurationSeconds } from "@erp/shared";
import type { Request } from "express";
import { env } from "./env.js";
import { prisma } from "./prisma.js";
import { sendTransactionalEmail } from "./email.js";
import { writeAudit } from "../middleware/audit.js";

export function passwordResetTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issuePasswordResetToken(
  request: Request,
  user: { id: string; email: string; companyId?: string | null },
  action = "auth.password-reset-requested",
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = passwordResetTokenHash(token);
  const expiresAt = new Date(
    Date.now() + parseDurationSeconds(env.PASSWORD_RESET_EXPIRES_IN) * 1000,
  );

  await prisma.$transaction(async (transaction) => {
    await transaction.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await transaction.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });
    await writeAudit(
      request,
      action,
      {
        userId: request.auth?.userId ?? null,
        companyId: request.auth?.companyId ?? user.companyId ?? null,
        module: action.startsWith("users.") ? "users" : "auth",
        entityType: "user",
        entityId: user.id,
        metadata: { targetUserId: user.id },
      },
      transaction,
    );
  });

  if (env.EMAIL_PROVIDER) {
    const resetUrl = new URL("/reset-password", env.APP_URL);
    resetUrl.searchParams.set("token", token);
    await sendTransactionalEmail({
      to: user.email,
      subject: "Reset your Ledgerline password",
      text: `Use this single-use link to reset your password: ${resetUrl.toString()}. It expires in ${env.PASSWORD_RESET_EXPIRES_IN}.`,
    });
  }
  return token;
}

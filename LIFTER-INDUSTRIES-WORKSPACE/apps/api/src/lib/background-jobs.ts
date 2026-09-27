import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { env } from "./env.js";
import { prisma } from "./prisma.js";
import { newStorageKey, readObject, storeObject } from "./storage.js";

const timestamp = z.iso.datetime().nullable();
const permissionSchema = z.object({
  id: z.string(), key: z.string(), name: z.string(), module: z.string(), action: z.string(), description: z.string().nullable(),
});
const companySchema = z.object({
  id: z.string(), name: z.string(), code: z.string(), legalName: z.string().nullable(), address: z.string().nullable(),
  city: z.string().nullable(), state: z.string().nullable(), pincode: z.string().nullable(), country: z.string(),
  gstin: z.string().nullable(), pan: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable(),
  logo: z.string().nullable(), financialYearStart: timestamp, financialYearEnd: timestamp, booksBeginningDate: timestamp,
  baseCurrency: z.string(), currency: z.string(), timezone: z.string(), featureConfiguration: z.record(z.string(), z.unknown()),
  isActive: z.boolean(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), deletedAt: timestamp,
});
const backupSnapshotSchema = z.object({
  formatVersion: z.literal(1),
  createdAt: z.iso.datetime(),
  company: companySchema,
  permissions: z.array(permissionSchema),
  roles: z.array(z.object({
    id: z.string(), name: z.string(), description: z.string().nullable(), isSystem: z.boolean(), isActive: z.boolean(),
    createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), permissionIds: z.array(z.string()),
  })),
  memberships: z.array(z.object({
    userId: z.string(), companyId: z.string(), roleId: z.string(), isActive: z.boolean(), createdAt: z.iso.datetime(),
    user: z.object({
      id: z.string(), email: z.email(), name: z.string(), passwordHash: z.string(), companyId: z.string().nullable(),
      employeeCode: z.string().nullable(), department: z.string().nullable(), designation: z.string().nullable(),
      mobile: z.string().nullable(), alternateEmail: z.string().nullable(), dateOfJoining: timestamp,
      isActive: z.boolean(), emailVerifiedAt: timestamp, lastLoginAt: timestamp, createdAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(), deletedAt: timestamp,
    }),
  })),
  auditLogs: z.array(z.object({
    id: z.string(), userId: z.string().nullable(), action: z.string(), module: z.string().nullable(),
    entityType: z.string().nullable(), entityId: z.string().nullable(), oldValue: z.unknown().nullable(),
    newValue: z.unknown().nullable(), metadata: z.unknown(), requestId: z.string().nullable(),
    ipAddress: z.string().nullable(), userAgent: z.string().nullable(), createdAt: z.iso.datetime(),
  })),
});
const encryptedEnvelopeSchema = z.object({
  formatVersion: z.literal(1), algorithm: z.literal("aes-256-gcm"), iv: z.string(), tag: z.string(),
  sha256: z.string(), ciphertext: z.string(),
});
const storedBackupResultSchema = z.object({ storageKey: z.string(), sha256: z.string(), byteLength: z.number() });

const backupKey = createHash("sha256")
  .update(env.BACKUP_ENCRYPTION_KEY || env.JWT_REFRESH_SECRET)
  .digest();

function encryptSnapshot(snapshot: z.infer<typeof backupSnapshotSchema>): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", backupKey, iv);
  const plaintext = Buffer.from(JSON.stringify(snapshot));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope = {
    formatVersion: 1 as const,
    algorithm: "aes-256-gcm" as const,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    sha256: createHash("sha256").update(plaintext).digest("hex"),
    ciphertext: ciphertext.toString("base64url"),
  };
  return Buffer.from(JSON.stringify(envelope));
}

function decryptSnapshot(contents: Uint8Array): z.infer<typeof backupSnapshotSchema> {
  const envelope = encryptedEnvelopeSchema.parse(JSON.parse(Buffer.from(contents).toString("utf8")));
  const decipher = createDecipheriv("aes-256-gcm", backupKey, Buffer.from(envelope.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]);
  const checksum = createHash("sha256").update(plaintext).digest("hex");
  if (checksum !== envelope.sha256) throw new Error("Backup checksum validation failed");
  return backupSnapshotSchema.parse(JSON.parse(plaintext.toString("utf8")));
}

async function createCompanySnapshot(companyId: string): Promise<z.infer<typeof backupSnapshotSchema>> {
  const [company, memberships, roles, auditLogs] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.userCompanyRole.findMany({
      where: { companyId },
      select: {
        userId: true, companyId: true, roleId: true, isActive: true, createdAt: true,
        user: {
          select: {
            id: true, email: true, name: true, passwordHash: true, companyId: true, employeeCode: true,
            department: true, designation: true, mobile: true, alternateEmail: true, dateOfJoining: true,
            isActive: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true, updatedAt: true, deletedAt: true,
          },
        },
      },
    }),
    prisma.role.findMany({
      where: { companyId },
      select: {
        id: true, name: true, description: true, isSystem: true, isActive: true, createdAt: true, updatedAt: true,
        permissions: { select: { permission: { select: { id: true } } } },
      },
    }),
    prisma.auditLog.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!company) throw new Error("Company was not found");

  const permissionIds = [...new Set(roles.flatMap((role) => role.permissions.map((item) => item.permission.id)))];
  const permissions = permissionIds.length
    ? await prisma.permission.findMany({ where: { id: { in: permissionIds } } })
    : [];
  const snapshot = {
    formatVersion: 1 as const,
    createdAt: new Date().toISOString(),
    company,
    permissions,
    roles: roles.map((role) => ({
      ...role,
      permissionIds: role.permissions.map((item) => item.permission.id),
    })),
    memberships,
    auditLogs,
  };
  return backupSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
}

async function writeAudit(job: { id: string; companyId: string; requestedBy: string }, action: string, metadata: Prisma.InputJsonValue) {
  await prisma.$transaction(async (transaction) => {
    await transaction.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: action.endsWith("failed") ? "FAILED" : "COMPLETED",
        finishedAt: new Date(),
        ...(action.endsWith("failed") ? { error: String(metadata).slice(0, 1000) } : { result: metadata }),
      },
    });
    await transaction.auditLog.create({
      data: {
        userId: job.requestedBy,
        companyId: job.companyId,
        action,
        module: "company",
        entityType: "background_job",
        entityId: job.id,
        metadata,
      },
    });
  });
}

async function processBackup(job: { id: string; companyId: string; requestedBy: string }): Promise<Prisma.InputJsonValue> {
  const snapshot = await createCompanySnapshot(job.companyId);
  const contents = encryptSnapshot(snapshot);
  const storageKey = newStorageKey(job.companyId, `${job.id}.backup.json.enc`);
  await storeObject({ key: storageKey, body: contents, contentType: "application/octet-stream" });
  return {
    storageKey,
    sha256: createHash("sha256").update(contents).digest("hex"),
    byteLength: contents.byteLength,
  };
}

async function processRestore(job: {
  id: string;
  companyId: string;
  requestedBy: string;
  payload: Prisma.JsonValue;
}): Promise<Prisma.InputJsonValue> {
  const payload = z.object({ sourceJobId: z.string().min(1) }).parse(job.payload);
  const source = await prisma.backgroundJob.findFirst({
    where: { id: payload.sourceJobId, companyId: job.companyId, type: "COMPANY_BACKUP", status: "COMPLETED" },
  });
  if (!source?.result) throw new Error("Completed backup record is unavailable");
  const { storageKey, sha256 } = storedBackupResultSchema.parse(source.result);
  const encrypted = await readObject(storageKey);
  if (createHash("sha256").update(encrypted).digest("hex") !== sha256) {
    throw new Error("Stored backup checksum validation failed");
  }
  const snapshot = decryptSnapshot(encrypted);
  if (snapshot.company.id !== job.companyId) throw new Error("Backup company does not match restore target");

  await prisma.$transaction(async (transaction) => {
    await transaction.company.update({
      where: { id: job.companyId },
      data: {
        name: snapshot.company.name,
        code: snapshot.company.code,
        legalName: snapshot.company.legalName,
        address: snapshot.company.address,
        city: snapshot.company.city,
        state: snapshot.company.state,
        pincode: snapshot.company.pincode,
        country: snapshot.company.country,
        gstin: snapshot.company.gstin,
        pan: snapshot.company.pan,
        email: snapshot.company.email,
        phone: snapshot.company.phone,
        logo: snapshot.company.logo,
        financialYearStart: snapshot.company.financialYearStart ? new Date(snapshot.company.financialYearStart) : null,
        financialYearEnd: snapshot.company.financialYearEnd ? new Date(snapshot.company.financialYearEnd) : null,
        booksBeginningDate: snapshot.company.booksBeginningDate ? new Date(snapshot.company.booksBeginningDate) : null,
        baseCurrency: snapshot.company.baseCurrency,
        currency: snapshot.company.currency,
        timezone: snapshot.company.timezone,
        featureConfiguration: snapshot.company.featureConfiguration as Prisma.InputJsonValue,
        isActive: true,
        deletedAt: null,
      },
    });
    for (const permission of snapshot.permissions) {
      await transaction.permission.upsert({
        where: { key: permission.key },
        update: { name: permission.name, module: permission.module, action: permission.action, description: permission.description },
        create: permission,
      });
    }
    const roleIds = snapshot.roles.map((role) => role.id);
    for (const role of snapshot.roles) {
      const existing = await transaction.role.findUnique({ where: { id: role.id }, select: { companyId: true } });
      if (existing && existing.companyId !== job.companyId) throw new Error("Backup contains a role owned by another company");
      await transaction.role.upsert({
        where: { id: role.id },
        update: { name: role.name, description: role.description, isSystem: role.isSystem, isActive: role.isActive },
        create: {
          id: role.id, companyId: job.companyId, name: role.name, description: role.description,
          isSystem: role.isSystem, isActive: role.isActive, createdAt: new Date(role.createdAt), updatedAt: new Date(role.updatedAt),
        },
      });
    }
    await transaction.role.updateMany({
      where: { companyId: job.companyId, ...(roleIds.length ? { id: { notIn: roleIds } } : {}) },
      data: { isActive: false },
    });

    const userRows = snapshot.memberships.map(({ user }) => ({
      id: user.id, email: user.email, name: user.name, passwordHash: user.passwordHash,
      companyId: user.companyId === job.companyId ? job.companyId : null,
      employeeCode: user.employeeCode, department: user.department, designation: user.designation,
      mobile: user.mobile, alternateEmail: user.alternateEmail,
      dateOfJoining: user.dateOfJoining ? new Date(user.dateOfJoining) : null,
      isActive: user.isActive, emailVerifiedAt: user.emailVerifiedAt ? new Date(user.emailVerifiedAt) : null,
      lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt) : null,
      createdAt: new Date(user.createdAt), updatedAt: new Date(user.updatedAt),
      deletedAt: user.deletedAt ? new Date(user.deletedAt) : null,
    }));
    for (const user of userRows) {
      const { id, createdAt, ...userUpdate } = user;
      await transaction.user.upsert({
        where: { id },
        update: { ...userUpdate, updatedAt: new Date() },
        create: { id, createdAt, ...userUpdate },
      });
    }
    await transaction.userCompanyRole.deleteMany({ where: { companyId: job.companyId } });
    if (snapshot.memberships.length) {
      await transaction.userCompanyRole.createMany({
        data: snapshot.memberships.map((membership) => ({
          userId: membership.userId,
          companyId: job.companyId,
          roleId: membership.roleId,
          isActive: membership.isActive,
          createdAt: new Date(membership.createdAt),
        })),
        skipDuplicates: true,
      });
    }
    await transaction.rolePermission.deleteMany({ where: { role: { companyId: job.companyId } } });
    const rolePermissions = snapshot.roles.flatMap((role) =>
      role.permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
    );
    if (rolePermissions.length) await transaction.rolePermission.createMany({ data: rolePermissions, skipDuplicates: true });
    if (snapshot.auditLogs.length) {
      await transaction.auditLog.createMany({
        data: snapshot.auditLogs.map((log) => ({
          id: log.id,
          userId: log.userId,
          companyId: job.companyId,
          action: log.action,
          module: log.module,
          entityType: log.entityType,
          entityId: log.entityId,
          createdAt: new Date(log.createdAt),
          requestId: log.requestId,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          metadata: log.metadata as Prisma.InputJsonValue,
          ...(log.oldValue === null
            ? {}
            : { oldValue: log.oldValue as Prisma.InputJsonValue }),
          ...(log.newValue === null
            ? {}
            : { newValue: log.newValue as Prisma.InputJsonValue }),
        })),
        skipDuplicates: true,
      });
    }
  });
  return { restoredFromJobId: source.id, restoredAt: new Date().toISOString() };
}

export async function processNextBackgroundJob(): Promise<{ jobId: string; status: "COMPLETED" | "FAILED" } | null> {
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
  const job = await prisma.$transaction(async (transaction) => {
    const candidate = await transaction.backgroundJob.findFirst({
      where: {
        OR: [
          { status: "QUEUED" },
          { status: "RUNNING", startedAt: { lt: staleBefore } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    if (!candidate) return null;
    const claimed = await transaction.backgroundJob.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        ...(candidate.status === "RUNNING" ? { startedAt: { lt: staleBefore } } : {}),
      },
      data: { status: "RUNNING", startedAt: new Date(), finishedAt: null, error: null },
    });
    return claimed.count === 1 ? candidate : null;
  });
  if (!job) return null;

  try {
    const result = job.type === "COMPANY_BACKUP" ? await processBackup(job) : await processRestore(job);
    await writeAudit(job, job.type === "COMPANY_BACKUP" ? "company.backup.completed" : "company.restore.completed", result);
    return { jobId: job.id, status: "COMPLETED" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Background job failed";
    await prisma.$transaction(async (transaction) => {
      await transaction.backgroundJob.update({
        where: { id: job.id },
        data: { status: "FAILED", error: message.slice(0, 1000), finishedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          userId: job.requestedBy,
          companyId: job.companyId,
          action: job.type === "COMPANY_BACKUP" ? "company.backup.failed" : "company.restore.failed",
          module: "company",
          entityType: "background_job",
          entityId: job.id,
          metadata: { error: message.slice(0, 1000) },
        },
      });
    });
    return { jobId: job.id, status: "FAILED" };
  }
}
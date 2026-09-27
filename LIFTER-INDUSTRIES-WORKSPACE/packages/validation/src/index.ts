import { z } from "zod";

const gstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const mobilePattern = /^(?:\+91[\s-]?)?[6-9][0-9]{9}$/;

const optionalEmail = z
  .union([z.email().max(320), z.literal("")])
  .optional()
  .transform((value) => value?.trim().toLowerCase() || undefined);

const optionalMobile = z
  .union([
    z.string().trim().regex(mobilePattern, "Enter a valid Indian mobile number"),
    z.literal(""),
  ])
  .optional()
  .transform((value) => value?.replace(/^(?:\+91[\s-]?)/, "") || undefined);

const optionalDate = z
  .union([z.iso.date(), z.literal("")])
  .optional()
  .transform((value) => value || undefined);

export const strongPasswordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128)
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number")
  .regex(/[^A-Za-z0-9]/, "Include a symbol");

export const loginSchema = z.object({
  email: z
    .email()
    .max(320)
    .transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(128),
});

export const registrationSchema = z.object({
  email: z
    .email()
    .max(320)
    .transform((value) => value.trim().toLowerCase()),
  name: z.string().trim().min(2).max(160),
  companyName: z.string().trim().min(2).max(180),
  companyCode: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
    .transform((value) => value.toUpperCase()),
  password: strongPasswordSchema,
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
});

export const companyIdParamsSchema = z.object({ companyId: z.string().min(1).max(64) });
export const idParamsSchema = z.object({ id: z.string().min(1).max(64) });

const companyFieldsSchema = z.object({
  name: z.string().trim().min(2).max(180),
  code: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
    .transform((value) => value.toUpperCase()),
  legalName: z.string().trim().max(240).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  state: z.string().trim().max(120).optional().or(z.literal("")),
  pincode: z
    .union([
      z.string().regex(/^[1-9][0-9]{5}$/, "Enter a valid six-digit Indian PIN code"),
      z.literal(""),
    ])
    .optional(),
  country: z
    .string()
    .trim()
    .length(2)
    .default("IN")
    .transform((value) => value.toUpperCase()),
  gstin: z
    .union([
      z.string().trim().toUpperCase().regex(gstinPattern, "Enter a valid GSTIN"),
      z.literal(""),
    ])
    .optional(),
  pan: z
    .union([z.string().trim().toUpperCase().regex(panPattern, "Enter a valid PAN"), z.literal("")])
    .optional(),
  email: optionalEmail,
  phone: optionalMobile,
  logo: z.union([z.url().max(2048), z.literal("")]).optional(),
  financialYearStart: optionalDate,
  financialYearEnd: optionalDate,
  booksBeginningDate: optionalDate,
  baseCurrency: z
    .string()
    .trim()
    .length(3)
    .default("INR")
    .transform((value) => value.toUpperCase()),
  timezone: z.string().trim().min(1).max(80).default("Asia/Kolkata"),
});

export const createCompanySchema = companyFieldsSchema.superRefine((value, context) => {
  if (value.gstin && value.pan && value.gstin.slice(2, 12) !== value.pan) {
    context.addIssue({
      code: "custom",
      path: ["gstin"],
      message: "GSTIN must contain the supplied PAN",
    });
  }
  if (
    value.financialYearStart &&
    value.financialYearEnd &&
    value.financialYearStart >= value.financialYearEnd
  ) {
    context.addIssue({
      code: "custom",
      path: ["financialYearEnd"],
      message: "Financial year end must follow its start",
    });
  }
});

export const updateCompanySchema = companyFieldsSchema.partial().superRefine((value, context) => {
  if (value.gstin && value.pan && value.gstin.slice(2, 12) !== value.pan) {
    context.addIssue({
      code: "custom",
      path: ["gstin"],
      message: "GSTIN must contain the supplied PAN",
    });
  }
  if (
    value.financialYearStart &&
    value.financialYearEnd &&
    value.financialYearStart >= value.financialYearEnd
  ) {
    context.addIssue({
      code: "custom",
      path: ["financialYearEnd"],
      message: "Financial year end must follow its start",
    });
  }
});

export const companyListSchema = paginationSchema.extend({
  status: z.enum(["all", "active", "inactive", "deleted"]).default("active"),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z
    .email()
    .max(320)
    .transform((value) => value.trim().toLowerCase()),
  employeeCode: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z0-9_-]+$/),
  department: z.string().trim().max(120).optional().or(z.literal("")),
  designation: z.string().trim().max(120).optional().or(z.literal("")),
  mobile: optionalMobile,
  alternateEmail: optionalEmail,
  dateOfJoining: optionalDate,
  roleId: z.string().min(1).max(64),
});

export const updateUserSchema = createUserSchema
  .omit({ email: true, roleId: true })
  .partial()
  .extend({
    email: z
      .email()
      .max(320)
      .transform((value) => value.trim().toLowerCase())
      .optional(),
  });

export const userListSchema = paginationSchema.extend({
  roleId: z.string().min(1).max(64).optional(),
  department: z.string().trim().max(120).optional(),
  status: z.enum(["all", "active", "inactive"]).default("active"),
});

export const assignUserRolesSchema = z
  .object({ roleIds: z.array(z.string().min(1).max(64)).max(100) })
  .superRefine((value, context) => {
    if (new Set(value.roleIds).size !== value.roleIds.length) {
      context.addIssue({ code: "custom", path: ["roleIds"], message: "Role IDs must be unique" });
    }
  });

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

export const updateRoleSchema = createRoleSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const assignRolePermissionsSchema = z
  .object({
    permissionIds: z.array(z.string().min(1).max(64)).max(500),
  })
  .superRefine((value, context) => {
    if (new Set(value.permissionIds).size !== value.permissionIds.length) {
      context.addIssue({
        code: "custom",
        path: ["permissionIds"],
        message: "Permission IDs must be unique",
      });
    }
  });

export const roleListSchema = paginationSchema.extend({
  status: z.enum(["all", "active", "inactive"]).default("active"),
});

export const permissionListSchema = z.object({ module: z.string().trim().max(80).optional() });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: strongPasswordSchema,
});

export const forgotPasswordSchema = z.object({
  email: z
    .email()
    .max(320)
    .transform((value) => value.trim().toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(256),
  password: strongPasswordSchema,
});

export const companyRestoreSchema = z.object({ jobId: z.string().min(1).max(64) });

export const companyFeaturesSchema = z.object({
  finance: z.boolean(),
  inventory: z.boolean(),
  sales: z.boolean(),
  purchasing: z.boolean(),
  humanResources: z.boolean(),
  reports: z.boolean(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;

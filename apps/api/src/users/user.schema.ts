import { z } from 'zod';

const mobileSchema = z
  .string()
  .trim()
  .regex(/^(?:\+91[- ]?)?[6-9][0-9]{9}$/);
const optionalMobileSchema = mobileSchema.optional().nullable();
const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().nullable();
const roleIdsSchema = z
  .array(z.string().uuid())
  .min(1)
  .max(25)
  .refine((ids) => new Set(ids).size === ids.length, 'Roles must not be duplicated.');

const userProfileFields = z.object({
  email: z.string().trim().email().max(254).toLowerCase(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  employeeCode: z.string().trim().min(1).max(40).optional().nullable(),
  department: optionalText(100),
  designation: optionalText(100),
  mobile: optionalMobileSchema,
  alternateEmail: z.string().trim().email().max(254).toLowerCase().optional().nullable(),
  dateOfJoining: z.preprocess((value) => {
    if (value === '' || value === undefined) return undefined;
    if (value === null) return null;
    return value instanceof Date ? value : new Date(String(value));
  }, z.date().optional().nullable()),
});

export const createUserSchema = userProfileFields.extend({
  password: z.string().min(12).max(128),
  roleIds: roleIdsSchema,
});

export const updateUserSchema = userProfileFields.partial().extend({
  password: z.string().min(12).max(128).optional(),
  isActive: z.boolean().optional(),
  roleIds: roleIdsSchema.optional(),
});

export const resetPasswordSchema = z.object({ password: z.string().min(12).max(128) });

export const userListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  roleId: z.string().uuid().optional(),
  department: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

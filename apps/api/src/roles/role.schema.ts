import { z } from 'zod';

export const rolePermissionSchema = z.object({
  module: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z][a-z0-9-]*$/),
  action: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().trim().min(2).max(120),
});

const roleFields = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  permissions: z.array(rolePermissionSchema).max(250).default([]),
});

function validateGrantUniqueness(
  role: { permissions?: Array<{ module: string; action: string }> },
  context: z.RefinementCtx,
): void {
  const grants = (role.permissions ?? []).map(({ module, action }) => `${module}:${action}`);
  if (new Set(grants).size !== grants.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['permissions'],
      message: 'A module/action grant may only be assigned once.',
    });
  }
}

export const createRoleSchema = roleFields.superRefine(validateGrantUniqueness);
export const updateRoleSchema = roleFields.partial().superRefine(validateGrantUniqueness);
export const assignPermissionsSchema = z.object({ permissions: roleFields.shape.permissions });

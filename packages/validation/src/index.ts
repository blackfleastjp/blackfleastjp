import { z } from "zod";

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
  password: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
});

export const companyIdParamsSchema = z.object({ companyId: z.string().min(1).max(64) });

export type LoginInput = z.infer<typeof loginSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;

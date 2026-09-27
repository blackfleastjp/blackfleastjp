import { z } from 'zod';

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().nullable();
const optionalDate = z.preprocess((value) => {
  if (value === '' || value === undefined) return undefined;
  if (value === null) return null;
  return value instanceof Date ? value : new Date(String(value));
}, z.date().optional().nullable());

export const companyFields = {
  name: z.string().trim().min(2).max(160),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(32)
    .regex(/^[A-Z0-9][A-Z0-9_-]*$/),
  address: optionalText(500),
  city: optionalText(100),
  state: optionalText(100),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/)
    .optional()
    .nullable(),
  country: z.string().trim().min(2).max(80).default('India'),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/)
    .optional()
    .nullable(),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/)
    .optional()
    .nullable(),
  email: z.string().trim().email().max(254).toLowerCase().optional().nullable(),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+91[- ]?)?[6-9][0-9]{9}$/)
    .optional()
    .nullable(),
  logo: z.string().url().max(2048).optional().nullable(),
  financialYearStart: optionalDate,
  financialYearEnd: optionalDate,
  booksBeginningDate: optionalDate,
  baseCurrency: z.string().trim().length(3).toUpperCase().default('INR'),
  enableAccounting: z.boolean().default(false),
  enableInventory: z.boolean().default(false),
  enableGst: z.boolean().default(false),
  enablePayroll: z.boolean().default(false),
};

export const createCompanySchema = z.object(companyFields).superRefine((company, context) => {
  if (
    company.financialYearStart &&
    company.financialYearEnd &&
    company.financialYearEnd <= company.financialYearStart
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['financialYearEnd'],
      message: 'Financial year end must be after its start.',
    });
  }
});

export const updateCompanySchema = z
  .object({
    name: companyFields.name.optional(),
    code: companyFields.code.optional(),
    address: companyFields.address,
    city: companyFields.city,
    state: companyFields.state,
    pincode: companyFields.pincode,
    country: companyFields.country.optional(),
    gstin: companyFields.gstin,
    pan: companyFields.pan,
    email: companyFields.email,
    phone: companyFields.phone,
    logo: companyFields.logo,
    financialYearStart: companyFields.financialYearStart,
    financialYearEnd: companyFields.financialYearEnd,
    booksBeginningDate: companyFields.booksBeginningDate,
    baseCurrency: companyFields.baseCurrency.optional(),
    enableAccounting: companyFields.enableAccounting.optional(),
    enableInventory: companyFields.enableInventory.optional(),
    enableGst: companyFields.enableGst.optional(),
    enablePayroll: companyFields.enablePayroll.optional(),
  })
  .superRefine((company, context) => {
    if (
      company.financialYearStart &&
      company.financialYearEnd &&
      company.financialYearEnd <= company.financialYearStart
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['financialYearEnd'],
        message: 'Financial year end must be after its start.',
      });
    }
  });

export const companyStatusSchema = z.object({ isActive: z.boolean() });
export const restoreCompanySchema = z.object({ backupId: z.string().uuid() });
export const createBackupSchema = z.object({ name: z.string().trim().min(2).max(120).optional() });

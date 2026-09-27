import assert from 'node:assert/strict';
import test from 'node:test';
import { createCompanySchema, updateCompanySchema } from '../src/companies/company.schema';
import { createRoleSchema } from '../src/roles/role.schema';
import { createUserSchema } from '../src/users/user.schema';

test('company input accepts valid Indian tax identifiers and nullable dates', () => {
  const parsed = createCompanySchema.parse({
    name: 'Acme India',
    code: 'acme',
    gstin: '27AAPFU0939F1ZV',
    pan: 'ABCDE1234F',
    pincode: '110001',
    email: 'ops@acme.in',
    phone: '+91 9876543210',
    financialYearStart: '2026-04-01',
    financialYearEnd: '2027-03-31',
    booksBeginningDate: null,
  });

  assert.equal(parsed.gstin, '27AAPFU0939F1ZV');
  assert.equal(parsed.pan, 'ABCDE1234F');
  assert.equal(parsed.code, 'ACME');
  assert.ok(parsed.financialYearStart instanceof Date);
  assert.equal(parsed.booksBeginningDate, null);
});

test('company input rejects malformed GSTIN, PAN, PIN code, and date order', () => {
  assert.equal(
    createCompanySchema.safeParse({ name: 'Acme India', code: 'ACME', gstin: 'BAD' }).success,
    false,
  );
  assert.equal(
    createCompanySchema.safeParse({ name: 'Acme India', code: 'ACME', pan: '123' }).success,
    false,
  );
  assert.equal(
    createCompanySchema.safeParse({ name: 'Acme India', code: 'ACME', pincode: '000001' }).success,
    false,
  );
  assert.equal(
    updateCompanySchema.safeParse({
      financialYearStart: '2027-04-01',
      financialYearEnd: '2027-03-31',
    }).success,
    false,
  );
});

test('user input validates email and Indian mobile while accepting a null joining date', () => {
  const parsed = createUserSchema.parse({
    email: 'jane@acme.in',
    password: 'a-strong-password',
    firstName: 'Jane',
    lastName: 'Doe',
    mobile: '+91 9876543210',
    employeeCode: null,
    alternateEmail: null,
    dateOfJoining: null,
    roleIds: ['00000000-0000-4000-8000-000000000001'],
  });

  assert.equal(parsed.mobile, '+91 9876543210');
  assert.equal(parsed.dateOfJoining, null);
  assert.equal(
    createUserSchema.safeParse({
      email: 'not-an-email',
      password: 'a-strong-password',
      firstName: 'Jane',
      lastName: 'Doe',
      mobile: '1234',
      roleIds: ['00000000-0000-4000-8000-000000000001'],
    }).success,
    false,
  );
  assert.equal(
    createUserSchema.safeParse({
      email: 'jane@acme.in',
      password: 'a-strong-password',
      firstName: 'Jane',
      lastName: 'Doe',
      roleIds: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'],
    }).success,
    false,
  );
});

test('role permission matrices reject duplicate module/action grants', () => {
  assert.equal(
    createRoleSchema.safeParse({
      name: 'Operations',
      permissions: [
        { module: 'users', action: 'read', name: 'View users' },
        { module: 'users', action: 'read', name: 'View users again' },
      ],
    }).success,
    false,
  );
});

test('create inputs require fields needed by Prisma records', () => {
  assert.equal(createCompanySchema.safeParse({ code: 'ACME' }).success, false);
  assert.equal(
    createUserSchema.safeParse({
      password: 'a-strong-password',
      firstName: 'Jane',
      lastName: 'Doe',
      roleIds: ['00000000-0000-4000-8000-000000000001'],
    }).success,
    false,
  );
  assert.equal(
    createRoleSchema.safeParse({
      name: 'Operations',
      permissions: [{ module: 'users', action: 'read' }],
    }).success,
    false,
  );
});

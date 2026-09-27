import { asyncHandler } from '../utils/async-handler';
import {
  createCompany,
  createCompanyBackup,
  deactivateCompany,
  getCompany,
  listCompanies,
  restoreCompanyBackup,
  setCompanyActive,
  updateCompany,
} from './company.service';

export const listCompaniesHandler = asyncHandler(async (request, response) => {
  response.json({ companies: await listCompanies(request) });
});

export const getCompanyHandler = asyncHandler(async (request, response) => {
  response.json({ company: await getCompany(request) });
});

export const createCompanyHandler = asyncHandler(async (request, response) => {
  response.status(201).json({ company: await createCompany(request, request.body) });
});

export const updateCompanyHandler = asyncHandler(async (request, response) => {
  response.json({ company: await updateCompany(request, request.body) });
});

export const deactivateCompanyHandler = asyncHandler(async (request, response) => {
  response.json({ company: await deactivateCompany(request) });
});

export const setCompanyActiveHandler = asyncHandler(async (request, response) => {
  response.json({ company: await setCompanyActive(request, request.body.isActive as boolean) });
});

export const createCompanyBackupHandler = asyncHandler(async (request, response) => {
  response
    .status(201)
    .json({ backup: await createCompanyBackup(request, request.body.name as string | undefined) });
});

export const restoreCompanyBackupHandler = asyncHandler(async (request, response) => {
  response.json({ company: await restoreCompanyBackup(request, request.body.backupId as string) });
});

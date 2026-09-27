import type { Request } from 'express';
import { HttpError } from '../utils/http-error';
import { asyncHandler } from '../utils/async-handler';
import { permissionCatalog } from './permission-catalog';
import {
  assignRolePermissions,
  createRole,
  deleteRole,
  listRoles,
  updateRole,
} from './role.service';

function routeRoleId(request: Request): string {
  const roleId = request.params.id;
  if (typeof roleId !== 'string') throw new HttpError(400, 'A valid role ID is required.');
  return roleId;
}

export const listRolesHandler = asyncHandler(async (request, response) => {
  response.json({ roles: await listRoles(request) });
});

export const permissionCatalogHandler = asyncHandler(async (_request, response) => {
  response.json({ permissions: permissionCatalog });
});

export const createRoleHandler = asyncHandler(async (request, response) => {
  response.status(201).json({ role: await createRole(request, request.body) });
});

export const updateRoleHandler = asyncHandler(async (request, response) => {
  response.json({ role: await updateRole(request, routeRoleId(request), request.body) });
});

export const deleteRoleHandler = asyncHandler(async (request, response) => {
  response.json(await deleteRole(request, routeRoleId(request)));
});

export const assignRolePermissionsHandler = asyncHandler(async (request, response) => {
  response.json({
    role: await assignRolePermissions(request, routeRoleId(request), request.body.permissions),
  });
});

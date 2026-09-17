import { SetMetadata } from '@nestjs/common';
import { Roles } from '@prisma/client';

export interface RoleByMethodConfig {
  GET?: Roles[];
  POST?: Roles[];
  PATCH?: Roles[];
  PUT?: Roles[];
  DELETE?: Roles[];
}

export const ROLE_BY_METHOD_KEY = 'roleByMethod';

/**
 * Decorator para definir roles diferentes por método HTTP
 *
 * @example
 * @RoleByMethod({
 *   GET: [Roles.ADMIN, Roles.HR, Roles.GUARD, Roles.SUPERVISOR],
 *   POST: [Roles.ADMIN, Roles.SUPERVISOR],
 *   PATCH: [Roles.ADMIN, Roles.SUPERVISOR],
 *   DELETE: [Roles.ADMIN]
 * })
 */
export const RoleByMethod = (config: RoleByMethodConfig) =>
  SetMetadata(ROLE_BY_METHOD_KEY, config);

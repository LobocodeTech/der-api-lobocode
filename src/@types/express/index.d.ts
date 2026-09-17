// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type * as express from 'express';
import type { Roles } from '@prisma/client';

/** Usuário na request (AuthGuard/Passport). Garante id e role para guards. */
export interface RequestUser {
  id: string;
  role: Roles;
  email: string;
  name: string;
  status: string;
  permissions?: Array<{ permissionType: string }>;
  [k: string]: unknown;
}

declare global {
  namespace Express {
    export interface Request {
      user?: RequestUser;
    }
  }
}

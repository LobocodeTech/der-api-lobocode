import { Roles } from '@prisma/client';

/** Usuário anexado à request pelo AuthGuard. Garante id e role para guards. */
export interface RequestUser {
  id: string;
  role: Roles;
  email: string;
  name: string;
  status: string;
}

import { Roles } from '@prisma/client';

export interface ITokenPayload {
  name: string;
  email: string;
  role: Roles;
  sub: string;
}

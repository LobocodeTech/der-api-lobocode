import { SetMetadata } from '@nestjs/common';
import { Roles } from '@prisma/client';

export const RequiredRoles = (...roles: Roles[]) => SetMetadata('roles', roles);

//decorator - javascript - design pattern
// - documentar algo
// - influenciar o comportamento de algo

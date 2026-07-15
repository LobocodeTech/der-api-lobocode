import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { Roles, UserStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { CreateSystemAdminDto } from '../dto/create-system-admin.dto';
import { CreateAdminDto } from '../dto/create-admin.dto';
import { CreateGuardDto } from '../dto/create-guard.dto';
import { CreateHRDto } from '../dto/create-hr.dto';
import { CreatePostResidentDto } from '../dto/create-post-resident.dto';
import { CreatePostSupervisorDto } from '../dto/create-post-supervisor.dto';
import { CreateSupervisorDto } from '../dto/create-supervisor.dto';
import { CreateOthersDto } from '../dto/create-others.dto';

@Injectable()
export class UserFactory {
  private criptografarPassword(password: string): string {
    return bcrypt.hashSync(password, 10);
  }

  private criarUsuarioBase(dto: any, role: Roles): Prisma.UserCreateInput {
    const rolesSemRegional: Roles[] = [
      Roles.SYSTEM_ADMIN,
      Roles.ADMIN,
      Roles.C2C,
    ];
    const regionalId =
      !rolesSemRegional.includes(role) &&
      typeof dto.regionalId === 'string' &&
      dto.regionalId.trim()
        ? dto.regionalId.trim()
        : undefined;
    const userFunction =
      typeof dto.function === 'string' && dto.function.trim()
        ? dto.function.trim()
        : undefined;

    return {
      name: dto.name,
      login: dto.login.trim().toLowerCase(),
      email: dto.email.trim().toLowerCase(),
      phone: dto?.phone,
      function: userFunction,
      profilePicture: dto?.profilePicture,
      status: dto?.status,
      password: this.criptografarPassword(dto.password),
      role: role,
      company: dto.companyId
        ? {
            connect: { id: dto.companyId },
          }
        : undefined,
      regional: regionalId ? { connect: { id: regionalId } } : undefined,
    };
  }

  criarSystemAdmin(dto: CreateSystemAdminDto): Prisma.UserCreateInput {
    return this.criarUsuarioBase(dto, Roles.SYSTEM_ADMIN);
  }

  criarOthers(dto: CreateOthersDto): Prisma.UserCreateInput {
    return this.criarUsuarioBase(dto, dto.role);
  }

  criarAdmin(dto: CreateAdminDto): Prisma.UserCreateInput {
    return this.criarUsuarioBase(dto, Roles.ADMIN);
  }

  criarSupervisor(dto: CreateSupervisorDto): Prisma.UserCreateInput {
    return this.criarUsuarioBase(dto, Roles.C2C);
  }

  criarGuard(dto: CreateGuardDto): Prisma.UserCreateInput {
    return this.criarUsuarioBase(dto, Roles.FIELD_TEAM);
  }

  criarHR(dto: CreateHRDto): Prisma.UserCreateInput {
    return this.criarUsuarioBase(dto, Roles.ADMIN);
  }

  criarPostSupervisor(dto: CreatePostSupervisorDto): Prisma.UserCreateInput {
    return this.criarUsuarioBase(dto, Roles.C2C);
  }

  criarPostResident(dto: CreatePostResidentDto): Prisma.UserCreateInput {
    return this.criarUsuarioBase(dto, Roles.C2C);
  }
}

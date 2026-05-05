import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Roles } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictError, ForbiddenError } from '../../common/errors';
import { UpdateMyCompanyDto } from '../dto/update-my-company.dto';
import { PublicCompany, toPublicCompany } from '../auth-me.mapper';

@Injectable()
export class MeCompanyService {
  constructor(private readonly prisma: PrismaService) {}

  async updateByUserId(userId: string, dto: UpdateMyCompanyDto): Promise<PublicCompany> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, companyId: true, role: true },
    });

    if (!user?.companyId) {
      throw new ForbiddenError('Usuário sem empresa vinculada.');
    }

    if (user.role !== Roles.ADMIN) {
      throw new ForbiddenError(
        'Apenas administradores da empresa podem alterar os dados da organização.',
      );
    }

    if (dto.cnpj !== undefined) {
      const clean = dto.cnpj.replace(/\D/g, '');
      const others = await this.prisma.company.findMany({
        where: { deletedAt: null, NOT: { id: user.companyId } },
        select: { cnpj: true },
      });
      const dup = others.some((o) => o.cnpj.replace(/\D/g, '') === clean);
      if (dup) {
        throw new ConflictError('CNPJ já está em uso');
      }
    }

    const data: Prisma.CompanyUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.cnpj !== undefined) {
      data.cnpj = dto.cnpj.replace(/\D/g, '');
    }
    if (dto.address !== undefined) {
      const v = dto.address.trim();
      data.address = v.length ? v : null;
    }
    if (dto.contactName !== undefined) {
      const v = dto.contactName.trim();
      data.contactName = v.length ? v : null;
    }
    if (dto.contactEmail !== undefined) {
      const v = dto.contactEmail.trim().toLowerCase();
      data.contactEmail = v.length ? v : null;
    }
    if (dto.contactPhone !== undefined) {
      const v = dto.contactPhone.trim();
      data.contactPhone = v.length ? v : null;
    }

    if (Object.keys(data).length === 0) {
      const current = await this.prisma.company.findUnique({
        where: { id: user.companyId },
      });
      const pub = toPublicCompany(current);
      if (!pub) {
        throw new ForbiddenError('Empresa não encontrada.');
      }
      return pub;
    }

    const updated = await this.prisma.company.update({
      where: { id: user.companyId },
      data,
    });

    const pub = toPublicCompany(updated);
    if (!pub) {
      throw new ForbiddenError('Empresa não encontrada após atualização.');
    }

    return pub;
  }
}

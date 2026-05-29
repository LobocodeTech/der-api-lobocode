import { Injectable } from '@nestjs/common';
import { UserRepository } from '../repositories/user.repository';
import { CompaniesService } from '../../companies/companies.service';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../shared/common/errors';
import { VALIDATION_MESSAGES } from '../../../shared/common/messages';

@Injectable()
export class UserValidator {
  constructor(
    private userRepository: UserRepository,
    private companiesService: CompaniesService,
  ) {}

  async validarSeEmailEhUnico(email: string, excludeUserId?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.userRepository.buscarPrimeiro({
      email: normalizedEmail,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    });
    if (user) {
      throw new ConflictError(VALIDATION_MESSAGES.UNIQUENESS.EMAIL_EXISTS);
    }
  }

  async validarSeLoginEhUnico(login: string, excludeUserId?: string) {
    if (!login?.trim()) return;

    const normalizedLogin = login.trim().toLowerCase();
    const user = await this.userRepository.buscarPrimeiro({
      login: normalizedLogin,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    });
    if (user) {
      throw new ConflictError(VALIDATION_MESSAGES.UNIQUENESS.LOGIN_EXISTS);
    }
  }

  // async validarSeCPFEhUnico(cpf: string, excludeUserId?: string) {
  //   if (!cpf) return; // CPF é opcional

  //   // Verifica se CPF já existe
  //   const user = await this.userRepository.buscarPrimeiro({ cpf });
  //   if (user && user.id !== excludeUserId) {
  //     throw new ConflictError('CPF já está em uso');
  //   }
  // }

  async validarSePhoneEhUnico(phone: string, excludeUserId?: string) {
    if (!phone) return; // Telefone é opcional

    // Verifica se telefone já existe
    const user = await this.userRepository.buscarPrimeiro({ phone });
    if (user && user.id !== excludeUserId) {
      throw new ConflictError('Telefone já está em uso');
    }
  }

  async validarSeCompanyExiste(companyId: string) {
    await this.companiesService.validarExistencia(companyId);
  }

  async validarSeUserExiste(id: string) {
    const user = await this.userRepository.buscarUnico({ id });
    if (!user) {
      throw new NotFoundError('User', id, 'id');
    }
    return user;
  }

  async validarSeUserPodeSerDeletado(id: string) {
    await this.userRepository.buscarUserComRelations(id);
  }
}

import { Injectable, BadRequestException, Optional, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { UniversalService } from '../../../shared/universal/services/universal.service';
import { UniversalRepository } from '../../../shared/universal/repositories/universal.repository';
import { UniversalQueryService } from '../../../shared/universal/services/query.service';
import { UniversalPermissionService } from '../../../shared/universal/services/permission.service';
import { UniversalMetricsService } from '../../../shared/universal/services/metrics.service';
import {
  CreateFieldTeamMemberDto,
  UpdateFieldTeamMemberDto,
} from '../dto/field-team-member.dto';
import { MAX_FIELD_TEAM_MEMBERS } from '../users.constants';
import type {
  EntityNameCasl,
  EntityNameModel,
} from '../../../shared/universal/types';

@Injectable()
export class FieldTeamMemberService extends UniversalService<
  CreateFieldTeamMemberDto,
  UpdateFieldTeamMemberDto
> {
  protected readonly entityName: EntityNameModel = 'fieldTeamMember';
  protected readonly entityNameCasl: EntityNameCasl = 'FieldTeamMember';

  constructor(
    repository: UniversalRepository<
      CreateFieldTeamMemberDto,
      UpdateFieldTeamMemberDto
    >,
    queryService: UniversalQueryService,
    permissionService: UniversalPermissionService,
    metricsService: UniversalMetricsService,
    @Optional() @Inject(REQUEST) request: any,
  ) {
    super(
      repository,
      queryService,
      permissionService,
      metricsService,
      request,
      'fieldTeamMember',
      'FieldTeamMember',
    );
  }

  /**
   * Hook: validar limite de 100 membros ativos antes de criar.
   * Chamado pelo `criar()` herdado de UniversalService.
   */
  protected async antesDeCriar(data: CreateFieldTeamMemberDto): Promise<void> {
    await this.validarLimiteMembros(data.userId);
  }

  /**
   * Hook: validar limite antes de atualizar (segurança defensiva).
   * Atualização não muda contagem, mas mantém a invariante caso
   * alguém adicione membros via endpoint paralelo.
   */
  protected async antesDeAtualizar(
    id: string,
    _data: UpdateFieldTeamMemberDto,
  ): Promise<void> {
    const membro = await this.repository.buscarUnico(this.entityName, { id });
    if (!membro) return;
    await this.validarLimiteMembros(membro.userId);
  }

  private async validarLimiteMembros(userId: string): Promise<void> {
    const total = await this.repository.contarTodos(this.entityName, {
      userId,
      deletedAt: null,
    });
    if (total >= MAX_FIELD_TEAM_MEMBERS) {
      throw new BadRequestException(
        `Limite de ${MAX_FIELD_TEAM_MEMBERS} membros ativos por usuário excedido.`,
      );
    }
  }
}
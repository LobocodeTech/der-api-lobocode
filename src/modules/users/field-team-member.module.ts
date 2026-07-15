import { Module } from '@nestjs/common';
import { FieldTeamMemberService } from './services/field-team-member.service';
import { UniversalModule } from '../../shared/universal/universal.module';

/**
 * Módulo interno para o `FieldTeamMemberService`. Sem controller —
 * consumido apenas pelo `UsersService` no fluxo de criar/atualizar User.
 */
@Module({
  imports: [UniversalModule],
  providers: [FieldTeamMemberService],
  exports: [FieldTeamMemberService],
})
export class FieldTeamMemberModule {}
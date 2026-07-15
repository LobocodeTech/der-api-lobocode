/**
 * Limite máximo de membros ativos por usuário (FieldTeamMember).
 *
 * Regra de negócio: cada User pode ter até 10 membros ativos na equipe de
 * campo (`deletedAt IS NULL`). Membros soft-deletados não contam no limite.
 *
 * Reaproveitado em:
 *  - `dto/base-user.dto.ts` (validação @ArrayMaxSize no payload de entrada)
 *  - `services/field-team-member.service.ts` (hook antesDeCriar/antesDeAtualizar)
 *  - `users.service.ts` (applyMembersChange — checagem adicional no caller)
 */
export const MAX_FIELD_TEAM_MEMBERS = 10;
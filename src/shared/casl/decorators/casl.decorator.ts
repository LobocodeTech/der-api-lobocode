import { SetMetadata } from '@nestjs/common';
import { CrudAction } from '../casl.service';

export const CASL_ACTIONS_KEY = 'casl_actions';
export const CASL_SUBJECT_KEY = 'casl_subject';
export const CASL_FIELDS_KEY = 'casl_fields';

export interface CaslActionMetadata {
  action: CrudAction;
  subject: string;
  fields?: string[];
}

/**
 * Decorator para validar permissão CASL automaticamente
 * @param action - Ação CRUD (create, read, update, delete)
 * @param subject - Entidade/subject (User, Post, etc.)
 * @param fields - Campos específicos para validação (opcional)
 */
export const CaslAction = (
  action: CrudAction,
  subject: string,
  fields?: string[],
) => {
  return SetMetadata(CASL_ACTIONS_KEY, { action, subject, fields });
};

/**
 * Decorator para validar múltiplas ações
 * @param actions - Array de ações e subjects
 */
export const CaslActions = (actions: CaslActionMetadata[]) => {
  return SetMetadata(CASL_ACTIONS_KEY, actions);
};

/**
 * Decorator para validação de campos específicos
 * @param subject - Entidade
 * @param fields - Campos permitidos
 */
export const CaslFields = (subject: string, fields: string[]) => {
  return SetMetadata(CASL_FIELDS_KEY, { subject, fields });
};

/**
 * Decorator para validação de role específico
 * @param action - Ação CRUD
 * @param subject - Entidade
 * @param allowedRoles - Roles permitidos
 */
export const CaslRole = (
  action: CrudAction,
  subject: string,
  allowedRoles: string[],
) => {
  return SetMetadata('casl_role', { action, subject, allowedRoles });
};

// Decorators específicos para operações CRUD
export const CaslCreate = (subject: string) => CaslAction('create', subject);
export const CaslRead = (subject: string) => CaslAction('read', subject);
export const CaslUpdate = (subject: string) => CaslAction('update', subject);
export const CaslDelete = (subject: string) => CaslAction('delete', subject);
export const CaslManage = (subject: string) =>
  CaslAction('manage' as any, subject);

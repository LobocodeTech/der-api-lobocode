/**
 * Tipos centralizados para ações CRUD
 * Centraliza as definições de tipos de ação para melhorar manutenibilidade
 */

/**
 * Ações CRUD básicas
 */
export type CrudAction = 'read' | 'create' | 'update' | 'delete';

/**
 * Ações CRUD com operações adicionais
 */
export type ExtendedCrudAction = CrudAction | 'manage' | 'restore';

/**
 * Ações de validação
 */
export type ValidationAction = 'validate' | 'check' | 'verify';

/**
 * Ações de busca
 */
export type SearchAction = 'find' | 'search' | 'filter' | 'query';

/**
 * Ações de manipulação
 */
export type ManipulationAction = 'add' | 'remove' | 'insert' | 'extract';

/**
 * União de todas as ações possíveis
 */
export type AllActions =
  | CrudAction
  | ExtendedCrudAction
  | ValidationAction
  | SearchAction
  | ManipulationAction;

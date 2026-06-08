// ============================================================================
// 🔔 TIPOS BÁSICOS PARA NOTIFICAÇÃO SIMPLES
// ============================================================================

export interface CreateNotificationData {
  title: string;
  message: string;
  userId: string;        // quem criou a ação
  companyId?: string;
  entityType?: string;   // tipo da entidade (occurrence, report, etc.)
  entityId?: string;      // ID da entidade
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'; // prioridade da notificação
  recipients?: string[]; // destinatários específicos (opcional)
  /** TEMPORÁRIO: quando true, não envia e-mail (mantém WebSocket e push). */
  skipEmail?: boolean;
}

export interface NotificationResponse {
  id: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  isRead: boolean;
  createdAt: Date;
}

export interface NotificationFilters {
  isRead?: boolean;
  entityType?: string;
  page?: number;
  limit?: number;
  query?: string;  // Termo de busca (título, mensagem, entityType)
}

// ============================================================================
// 🔔 TIPOS PARA TEMPLATES E CONTEXTO
// ============================================================================

export interface NotificationTemplate {
  title: string;
  message: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  recipients: RecipientType;
}

// ============================================================================
// 🎯 TIPOS DE DESTINATÁRIOS FLEXÍVEIS
// ============================================================================

export type RecipientType = 
  | 'ALL'                           // Todos os usuários da empresa
  | 'ADMINS_ONLY'                   // Apenas administradores
  | 'SUPERVISORS_ONLY'              // Apenas supervisores
  | 'ADMINS_AND_SUPERVISORS'        // Administradores e supervisores
  | 'ACTIVE_SUPERVISORS'            // Supervisores em turno ativo
  | 'ACTIVE_SUPERVISORS_AND_ADMINS' // Supervisores ativos + admins
  | 'ACTIVE_SUPERVISORS_AND_ADMINS_AND_HR' // Supervisores ativos + admins + RH 
  | 'HR_ONLY'                       // Apenas RH
  | 'HR_AND_ADMINS'                 // RH + administradores
  | 'GUARD_ONLY'                    // Apenas guarda específico
  | 'GUARD_AND_SUPERVISORS'         // Guarda + supervisores
  | 'GUARD_AND_ADMINS'              // Guarda + administradores
  | 'GUARD_AND_ACTIVE_SUPERVISORS'  // Guarda + supervisores ativos
  | 'GUARD_AND_ACTIVE_SUPERVISORS_AND_ADMINS'  // Guarda + supervisores ativos + admins
  | 'SPECIFIC_USERS';               // Usuários específicos

export interface RecipientRule {
  type: RecipientType;
  userIds?: string[];               // Para SPECIFIC_USERS
  guardId?: string;                 // Para regras que envolvem guarda
  includeAdmins?: boolean;          // Incluir admins nas regras
  includeActiveSupervisors?: boolean; // Incluir supervisores ativos
}

export interface NotificationContext {
  userName: string;
  postName: string;
  time: string;
  // Supply specific
  liters?: number;
  talaoNumber?: number;
  vehiclePlate?: string;
  vehicleModel?: string;
  // Shift specific
  shiftStatus?: string;
  // Panic specific
  panicType?: string;
  // Occurrence Dispatch specific
  guardId?: string;
  guardName?: string;
  // Patrol specific
  checkpointName?: string;
}

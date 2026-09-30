// ============================================================================
// 🔔 TIPOS BÁSICOS PARA NOTIFICAÇÃO SIMPLES
// ============================================================================

export interface CreateNotificationData {
  title: string;
  message: string;
  userId: string; // quem criou a ação
  companyId?: string;
  entityType?: string; // tipo da entidade (occurrence, report, etc.)
  entityId?: string; // ID da entidade
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'; // prioridade da notificação
  recipients?: string[]; // destinatários específicos (opcional)
  /** Quando true, não envia e-mail (mantém WebSocket e push). Padrão: ver SKIP_NOTIFICATION_EMAIL_BY_DEFAULT. */
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
  query?: string; // Termo de busca (título, mensagem, entityType)
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
// 🎯 TIPOS DE DESTINATÁRIOS
// ============================================================================

export type RecipientType =
  | 'ALL' // Todos os usuários da empresa
  | 'ADMINS_ONLY' // Apenas administradores
  | 'SPECIFIC_USERS'; // Usuários específicos

export interface RecipientRule {
  type: RecipientType;
  userIds?: string[]; // Para SPECIFIC_USERS
  includeAdmins?: boolean;
}

export interface NotificationContext {
  userName: string;
  time: string;
}

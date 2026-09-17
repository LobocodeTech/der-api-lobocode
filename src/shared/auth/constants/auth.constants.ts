// ============================================================================
// CONSTANTES DO MÓDULO DE AUTENTICAÇÃO
// ============================================================================

export const AUTH_CONSTANTS = {
  // Configurações de token
  TOKEN: {
    TYPE: 'Bearer',
    ACCESS_EXPIRES_IN: '2h',
    REFRESH_EXPIRES_IN: '7d',
    RESET_PASSWORD_EXPIRES_IN: '1h',
  },

  // Configurações de rate limiting
  RATE_LIMIT: {
    LOGIN_MAX_ATTEMPTS: 100,
    LOGIN_WINDOW_MS: 5 * 60 * 1000, // 15 minutos
    REFRESH_MAX_ATTEMPTS: 100,
    REFRESH_WINDOW_MS: 5 * 60 * 1000, // 15 minutos
  },

  // Configurações de segurança
  SECURITY: {
    PASSWORD_MIN_LENGTH: 8,
    SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutos
    MAX_SESSIONS_PER_USER: 5,
  },

  // Headers
  HEADERS: {
    AUTHORIZATION: 'Authorization',
    REFRESH_TOKEN: 'X-Refresh-Token',
  },

  // Cookies
  COOKIES: {
    REFRESH_TOKEN: 'refresh_token',
    ACCESS_TOKEN: 'access_token',
  },
};

// ============================================================================
// MENSAGENS ESPECÍFICAS DE AUTENTICAÇÃO
// ============================================================================

export const AUTH_MESSAGES = {
  SUCCESS: {
    LOGIN: 'Login realizado com sucesso',
    LOGOUT: 'Logout realizado com sucesso',
    REFRESH: 'Token renovado com sucesso',
    PASSWORD_RESET_REQUESTED:
      'Solicitação recebida. Verifique sua caixa de entrada e a pasta de spam para continuar a redefinição de senha.',
    PASSWORD_RESET_SUCCESS: 'Senha alterada com sucesso.',
  },

  ERROR: {
    INVALID_CREDENTIALS: 'Credenciais inválidas',
    TOKEN_EXPIRED: 'Token expirado. Faça login novamente',
    TOKEN_INVALID: 'Token inválido',
    REFRESH_TOKEN_INVALID: 'Refresh token inválido',
    REFRESH_TOKEN_EXPIRED: 'Refresh token expirado',
    USER_NOT_FOUND: 'Usuário não encontrado',
    USER_INACTIVE: 'Usuário inativo',
    TOO_MANY_ATTEMPTS: 'Muitas tentativas. Tente novamente em alguns minutos',
    EMAIL_NOT_FOUND: 'Email não encontrado no sistema',
    RESET_TOKEN_INVALID: 'Token inválido ou expirado.',
    RESET_TOKEN_EXPIRED: 'Token de recuperação expirado',
    PASSWORDS_DONT_MATCH: 'As senhas não coincidem',
    PASSWORD_RESET_EMAIL_FAILED:
      'Não foi possível enviar o e-mail de recuperação.',
  },

  VALIDATION: {
    EMAIL_REQUIRED: 'Email é obrigatório',
    PASSWORD_REQUIRED: 'Senha é obrigatória',
    TOKEN_REQUIRED: 'Token é obrigatório',
    REFRESH_TOKEN_REQUIRED: 'Refresh token é obrigatório',
  },
};

// Password Reset (tokens persistidos no banco)
export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
export const PASSWORD_RESET_TOKEN_LENGTH = 6;
export const PASSWORD_RESET_LOGO_URL =
  'https://der-app.lobocode.com.br/assets/der-logo-KBfudeo_.png';
export const PASSWORD_RESET_RATE_LIMIT = {
  MAX_ATTEMPTS: 10,
  WINDOW_MS: 60 * 60 * 1000,
};

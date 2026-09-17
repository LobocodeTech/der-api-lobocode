import { AUTH_MESSAGES } from '../auth/constants';

export class RequiredFieldError extends Error {
  constructor(field: string) {
    super(`${field} é obrigatório`);
  }
}

export class NotFoundError extends Error {
  constructor(entity: string, key: string, attribute: string = 'id') {
    super(`${entity} with ${attribute} ${key} not found`);
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string = 'Unauthorized access') {
    super(message);
  }
}

export class ForbiddenError extends Error {
  constructor(message: string = 'Access forbidden') {
    super(message);
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super(AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
  }
}

// Exceções específicas para autenticação com tokens
export class TokenExpiredError extends Error {
  constructor(message: string = AUTH_MESSAGES.ERROR.TOKEN_EXPIRED) {
    super(message);
  }
}

export class TokenInvalidError extends Error {
  constructor(message: string = AUTH_MESSAGES.ERROR.TOKEN_INVALID) {
    super(message);
  }
}

export class TokenRequiredError extends Error {
  constructor(message: string = AUTH_MESSAGES.VALIDATION.TOKEN_REQUIRED) {
    super(message);
  }
}

export class RefreshTokenInvalidError extends Error {
  constructor(message: string = AUTH_MESSAGES.ERROR.REFRESH_TOKEN_INVALID) {
    super(message);
  }
}

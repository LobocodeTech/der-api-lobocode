import { randomInt } from 'crypto';
import { PASSWORD_RESET_TOKEN_LENGTH } from '../constants';

const TOKEN_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generatePasswordResetToken(
  length: number = PASSWORD_RESET_TOKEN_LENGTH,
): string {
  let token = '';
  for (let i = 0; i < length; i++) {
    token += TOKEN_CHARSET[randomInt(TOKEN_CHARSET.length)];
  }
  return token;
}

export function normalizePasswordResetToken(token: string): string {
  return token
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

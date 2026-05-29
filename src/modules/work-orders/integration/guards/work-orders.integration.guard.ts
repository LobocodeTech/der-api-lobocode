import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { ERROR_MESSAGES } from 'src/shared/common/messages';

@Injectable()
export class SharedTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const configuredToken = process.env.SHARED_API_TOKEN_LOBOCODE_DER?.trim();
    const providedToken = this.extractToken(request);

    if (!configuredToken) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.TOKEN_INVALID);
    }

    if (!providedToken) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.TOKEN_REQUIRED);
    }

    if (!this.safeTokenEquals(providedToken, configuredToken)) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.TOKEN_INVALID);
    }

    return true;
  }

  private extractToken(request: Request): string | null {
    const authorizationHeader = request.headers.authorization?.trim();
    if (authorizationHeader) {
      if (authorizationHeader.toLowerCase().startsWith('bearer ')) {
        const token = authorizationHeader.slice(7).trim();
        return token || null;
      }
      return authorizationHeader;
    }

    const sharedTokenHeader = request.headers['x-shared-token'];
    if (typeof sharedTokenHeader === 'string' && sharedTokenHeader.trim()) {
      return sharedTokenHeader.trim();
    }

    return null;
  }

  private safeTokenEquals(received: string, expected: string): boolean {
    const receivedBuffer = Buffer.from(received, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');

    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(receivedBuffer, expectedBuffer);
  }
}

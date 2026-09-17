import { Global, Module } from '@nestjs/common';
import { CaslAbilityService } from './casl-ability/casl-ability.service';
import { CaslService } from './casl.service';
import { PermissionContextService } from './services/permission-context.service';
import { PermissionAuditService } from './services/permission-audit.service';
import { CaslInterceptor } from './interceptors/casl.interceptor';

@Global()
@Module({
  providers: [
    CaslAbilityService,
    CaslService,
    PermissionContextService,
    PermissionAuditService,
    CaslInterceptor,
  ],
  exports: [
    CaslAbilityService,
    CaslService,
    PermissionContextService,
    PermissionAuditService,
    CaslInterceptor,
  ],
})
export class CaslModule {}

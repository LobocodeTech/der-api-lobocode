import { Injectable, Scope } from '@nestjs/common';
import { Company } from '@prisma/client';

interface TenantContext {
  id: string;
  name: string;
  isGlobal: boolean;
  isTemporary?: boolean;
  originalCompany?: Company;
}

@Injectable({
  scope: Scope.REQUEST,
}) //shared service
export class TenantService {
  private currentTenant: TenantContext;
  private temporaryTenant: TenantContext | null = null;

  setTenant(tenant: TenantContext) {
    this.currentTenant = tenant;
  }

  getTenant() {
    return this.temporaryTenant || this.currentTenant;
  }

  // Para SYSTEM_ADMIN especificar tenant temporário
  setTemporaryTenant(companyId: string, companyName: string) {
    this.temporaryTenant = {
      id: companyId,
      name: companyName,
      isGlobal: false,
      isTemporary: true,
    };
  }

  clearTemporaryTenant() {
    this.temporaryTenant = null;
  }

  isGlobalTenant(): boolean {
    const tenant = this.getTenant();
    return tenant?.isGlobal || false;
  }

  getCompanyId(): string | null {
    const tenant = this.getTenant();
    return tenant?.isGlobal ? null : tenant?.id;
  }

  isUsingTemporaryTenant(): boolean {
    return this.temporaryTenant !== null;
  }
}

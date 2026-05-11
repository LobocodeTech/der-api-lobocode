import { Injectable, Scope } from '@nestjs/common';
import { accessibleBy } from '@casl/prisma';
import { Roles } from '@prisma/client';
import { CaslAbilityService } from 'src/shared/casl/casl-ability/casl-ability.service';
import { PrismaService } from 'src/shared/prisma/prisma.service';

type RequestUser = {
  id: string;
  role: Roles;
  companyId: string;
  regionalId?: string | null;
};

type SearchResultItem = {
  id: string;
  type:
    | 'work-order'
    | 'user'
    | 'asset'
    | 'location'
    | 'regional'
    | 'planning'
    | 'document'
    | 'view';
  title: string;
  subtitle?: string;
  view:
    | 'work-orders'
    | 'team'
    | 'time-equipment'
    | 'locations'
    | 'regionals'
    | 'schedule'
    | 'reports'
    | 'kanban'
    | 'map';
  path: string;
};

@Injectable({ scope: Scope.REQUEST })
export class GlobalSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caslAbilityService: CaslAbilityService,
  ) {}

  async search(rawQuery: string, user: RequestUser, limitPerType = 5) {
    const q = rawQuery.trim();
    if (q.length < 2) {
      return { query: q, total: 0, results: [] as SearchResultItem[] };
    }

    const ability = this.caslAbilityService.ability;
    const contains = { contains: q, mode: 'insensitive' as const };
    const limit = Math.max(1, Math.min(10, limitPerType));

    const [workOrders, users, assets, locations, regionals, plannings, documents] =
      await Promise.all([
        this.prisma.workOrder.findMany({
          where: {
            companyId: user.companyId,
            deletedAt: null,
            OR: [{ title: contains }, { description: contains }],
            AND: [accessibleBy(ability, 'read').WorkOrder],
          },
          select: {
            id: true,
            title: true,
            status: true,
            location: { select: { name: true } },
          },
          take: limit,
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.user.findMany({
          where: {
            companyId: user.companyId,
            deletedAt: null,
            OR: [{ name: contains }, { email: contains }],
            AND: [accessibleBy(ability, 'read').User],
          },
          select: { id: true, name: true, email: true, role: true },
          take: limit,
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.asset.findMany({
          where: {
            companyId: user.companyId,
            deletedAt: null,
            OR: [{ name: contains }, { code: contains }],
            AND: [accessibleBy(ability, 'read').Asset],
          },
          select: { id: true, name: true, type: true, location: { select: { name: true } } },
          take: limit,
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.location.findMany({
          where: {
            companyId: user.companyId,
            deletedAt: null,
            OR: [{ name: contains }, { code: contains }, { uf: contains }],
            AND: [accessibleBy(ability, 'read').Location],
          },
          select: { id: true, name: true, code: true, regional: { select: { city: true } } },
          take: limit,
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.regional.findMany({
          where: {
            companyId: user.companyId,
            deletedAt: null,
            OR: [{ city: contains }, { cgr: contains }],
            AND: [accessibleBy(ability, 'read').Regional],
          },
          select: { id: true, city: true, cgr: true },
          take: limit,
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.planning.findMany({
          where: {
            companyId: user.companyId,
            deletedAt: null,
            OR: [{ title: contains }, { observation: contains }],
            AND: [accessibleBy(ability, 'read').Planning],
          },
          select: { id: true, title: true, date: true, location: { select: { name: true } } },
          take: limit,
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.document.findMany({
          where: {
            companyId: user.companyId,
            deletedAt: null,
            OR: [{ description: contains }],
          },
          select: { id: true, description: true, recipientType: true },
          take: limit,
          orderBy: { updatedAt: 'desc' },
        }),
      ]);

    const viewResults = this.searchViews(q);

    const results: SearchResultItem[] = [
      ...workOrders.map((item) => ({
        id: item.id,
        type: 'work-order' as const,
        title: item.title,
        subtitle: `${item.status} • ${item.location?.name ?? 'Sem localidade'}`,
        view: 'work-orders' as const,
        path: `/work-orders?search=${encodeURIComponent(item.title)}`,
      })),
      ...users.map((item) => ({
        id: item.id,
        type: 'user' as const,
        title: item.name,
        subtitle: `${item.email} • ${item.role}`,
        view: 'team' as const,
        path: `/team?search=${encodeURIComponent(item.name)}`,
      })),
      ...assets.map((item) => ({
        id: item.id,
        type: 'asset' as const,
        title: item.name,
        subtitle: `${item.type} • ${item.location?.name ?? 'Sem localidade'}`,
        view: 'time-equipment' as const,
        path: `/time-equipment?search=${encodeURIComponent(item.name)}`,
      })),
      ...locations.map((item) => ({
        id: item.id,
        type: 'location' as const,
        title: item.name,
        subtitle: `${item.code} • ${item.regional?.city ?? 'Sem regional'}`,
        view: 'locations' as const,
        path: `/locations?search=${encodeURIComponent(item.name)}`,
      })),
      ...regionals.map((item) => ({
        id: item.id,
        type: 'regional' as const,
        title: item.city,
        subtitle: `CGR ${item.cgr}`,
        view: 'regionals' as const,
        path: `/regionals?search=${encodeURIComponent(item.city)}`,
      })),
      ...plannings.map((item) => ({
        id: item.id,
        type: 'planning' as const,
        title: item.title,
        subtitle: `${new Date(item.date).toLocaleDateString('pt-BR')} • ${item.location?.name ?? 'Sem localidade'}`,
        view: 'schedule' as const,
        path: `/schedule?search=${encodeURIComponent(item.title)}`,
      })),
      ...documents.map((item) => ({
        id: item.id,
        type: 'document' as const,
        title: item.description || 'Relatório sem descrição',
        subtitle: `Tipo: ${item.recipientType}`,
        view: 'reports' as const,
        path: `/reports?search=${encodeURIComponent(item.description || '')}`,
      })),
      ...viewResults,
    ];

    return { query: q, total: results.length, results };
  }

  private searchViews(query: string): SearchResultItem[] {
    const normalized = query.toLowerCase();
    const views: Array<{ title: string; terms: string[]; view: SearchResultItem['view']; path: string }> = [
      { title: 'Kanban', terms: ['kanban', 'quadro'], view: 'kanban', path: '/kanban' },
      { title: 'Mapa', terms: ['mapa', 'camera', 'câmera', 'equipamento'], view: 'map', path: '/map' },
      { title: 'Relatórios', terms: ['relatorio', 'relatórios', 'relatorio'], view: 'reports', path: '/reports' },
      { title: 'Planejamento', terms: ['planejamento', 'agenda', 'calendario'], view: 'schedule', path: '/schedule' },
      { title: 'Ordens de Serviço', terms: ['os', 'ordem', 'tarefa'], view: 'work-orders', path: '/work-orders' },
    ];

    return views
      .filter((item) => item.terms.some((term) => normalized.includes(term)))
      .map((item) => ({
        id: `view-${item.view}`,
        type: 'view' as const,
        title: item.title,
        subtitle: 'Atalho de navegação',
        view: item.view,
        path: item.path,
      }));
  }
}


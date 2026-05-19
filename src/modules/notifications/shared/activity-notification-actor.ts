import { PrismaService } from '../../../shared/prisma/prisma.service';

/** Nome exibido nas notificações de atividade (criação, atribuição, remoção). */
export async function resolveActorDisplayName(
  prisma: PrismaService,
  actorUserId: string,
): Promise<string> {
  const id = actorUserId?.trim();
  if (!id || id === 'system') {
    return 'Sistema';
  }

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { name: true },
  });

  return user?.name?.trim() || 'Um usuário';
}

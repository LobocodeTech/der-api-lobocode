import { Prisma } from '@prisma/client';

type PrismaTx = Prisma.TransactionClient;

const PREFIXO_OS = 'OS-';

export function formatarCodigoSequencialOs(indice: number): string {
  return `${PREFIXO_OS}${indice}`;
}

/** Extrai o índice numérico de códigos `OS-n` (case-insensitive). */
export function extrairIndiceSequencialOs(
  codigo: string | null | undefined,
): number | null {
  if (!codigo?.trim()) {
    return null;
  }
  const match = codigo.trim().match(/^OS-(\d+)$/i);
  if (!match) {
    return null;
  }
  const indice = Number.parseInt(match[1], 10);
  return Number.isFinite(indice) && indice > 0 ? indice : null;
}

/**
 * Reordena OS ativas da empresa para OS-1..OS-n (createdAt, id).
 * Uso pontual (migração/correção); exclusão não reordena para preservar histórico.
 */
export async function reordenarNumerosSequenciaisWorkOrder(
  tx: PrismaTx,
  companyId: string,
): Promise<void> {
  const ativas = await tx.workOrder.findMany({
    where: { companyId, deletedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, sequentialNumber: true },
  });

  if (ativas.length === 0) {
    return;
  }

  const jaOrdenado = ativas.every((os, index) => {
    return os.sequentialNumber === formatarCodigoSequencialOs(index + 1);
  });
  if (jaOrdenado) {
    return;
  }

  await tx.workOrder.updateMany({
    where: {
      companyId,
      deletedAt: null,
      id: { in: ativas.map((os) => os.id) },
    },
    data: { sequentialNumber: null },
  });

  for (let index = 0; index < ativas.length; index++) {
    const esperado = formatarCodigoSequencialOs(index + 1);
    await tx.workOrder.update({
      where: { id: ativas[index].id },
      data: { sequentialNumber: esperado },
    });
  }
}

/**
 * Próximo código sequencial (`OS-n`): maior índice entre OS ativas + 1.
 * Não reordena as existentes (lacunas após exclusão são esperadas).
 */
export async function atribuirProximoNumeroSequencialWorkOrder(
  tx: PrismaTx,
  companyId: string,
): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`work-order-seq:${companyId}`}))`;

  const ativas = await tx.workOrder.findMany({
    where: { companyId, deletedAt: null },
    select: { sequentialNumber: true },
  });

  let maiorIndice = 0;
  for (const os of ativas) {
    const indice = extrairIndiceSequencialOs(os.sequentialNumber);
    if (indice != null && indice > maiorIndice) {
      maiorIndice = indice;
    }
  }

  return formatarCodigoSequencialOs(maiorIndice + 1);
}

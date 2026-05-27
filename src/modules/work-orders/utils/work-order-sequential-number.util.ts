import { Prisma } from '@prisma/client';

type PrismaTx = Prisma.TransactionClient;

const PREFIXO_OS = 'OS-';

export function formatarCodigoSequencialOs(indice: number): string {
  return `${PREFIXO_OS}${indice}`;
}

/**
 * Reordena OS ativas da empresa para OS-1..OS-n (createdAt, id).
 * Corrige lacunas por exclusão direta no banco ou códigos legados.
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

  for (let index = 0; index < ativas.length; index++) {
    const esperado = formatarCodigoSequencialOs(index + 1);
    if (ativas[index].sequentialNumber === esperado) {
      continue;
    }
    await tx.workOrder.update({
      where: { id: ativas[index].id },
      data: { sequentialNumber: esperado },
    });
  }
}

/**
 * Atribui o próximo código sequencial (`OS-n`) dentro de transação com lock por empresa.
 */
export async function atribuirProximoNumeroSequencialWorkOrder(
  tx: PrismaTx,
  companyId: string,
): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`work-order-seq:${companyId}`}))`;

  await reordenarNumerosSequenciaisWorkOrder(tx, companyId);

  const totalAtivas = await tx.workOrder.count({
    where: { companyId, deletedAt: null },
  });

  return formatarCodigoSequencialOs(totalAtivas + 1);
}

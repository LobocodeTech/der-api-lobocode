/**
 * Smoke de conexão/contagens — domínio DER.
 * Uso: node test-seed.js
 */
const { PrismaClient } = require('@prisma/client');

async function testConnection() {
  const prisma = new PrismaClient();

  try {
    console.log('[test-seed] Conectando...');
    await prisma.$connect();
    console.log('[test-seed] Conectado.');

    const [users, companies, regionals, locations, assets, workOrders, columns] =
      await Promise.all([
        prisma.user.count(),
        prisma.company.count(),
        prisma.regional.count(),
        prisma.location.count(),
        prisma.asset.count(),
        prisma.workOrder.count(),
        prisma.workOrderColumn.count(),
      ]);

    console.log(`[test-seed] Users: ${users}`);
    console.log(`[test-seed] Companies: ${companies}`);
    console.log(`[test-seed] Regionals: ${regionals}`);
    console.log(`[test-seed] Locations: ${locations}`);
    console.log(`[test-seed] Assets: ${assets}`);
    console.log(`[test-seed] WorkOrders: ${workOrders}`);
    console.log(`[test-seed] WorkOrderColumns: ${columns}`);
  } catch (error) {
    console.error('[test-seed] Erro:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();

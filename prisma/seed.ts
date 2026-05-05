// prisma/seed.ts - Seed para schema Departamento de Estradas de Rodagem
import { PrismaClient, Roles, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Aguarda um pouco para o banco estar estável após migrate (evita "Response from the Engine was empty") */
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSeed() {
  await delay(1500);
  const company = await seedCompany();
  await seedUsers(company.id);
  await seedWorkOrderColunms(company.id);
}

async function seedCompany() {
  const cnpj = '26.332.986/0001-90';
  const name = 'Departamento de Estradas de Rodagem';
  const exists = await prisma.company.findUnique({ where: { cnpj } });
  if (exists) return exists;

  const company = await prisma.company.create({
    data: {
      name,
      cnpj,
      contactName: 'Contato Departamento de Estradas de Rodagem',
      contactEmail: 'contato@der.com.br',
    },
  });

  console.log('[Seed] Empresa Departamento de Estradas de Rodagem criada');
  return company;
}

async function seedUsers(companyId: string) {
  // Admin (acesso total) - sem campos de funcionário
  const adminData = {
    name: 'Admin Departamento de Estradas de Rodagem',
    email: 'admin@der.com',
    login: 'admin@der.com',
    password: 'Admin123@Senha',
    role: Roles.ADMIN,
    status: UserStatus.ACTIVE,
    phone: '(11) 99999-9999',
  };

  const existsAdmin = await prisma.user.findUnique({
    where: { email: adminData.email },
  });

  if (!existsAdmin) {
    const hashedPassword = await bcrypt.hash(adminData.password, 10);
    await prisma.user.create({
      data: {
        ...adminData,
        company: { connect: { id: companyId } },
        password: hashedPassword,
      },
    });
    console.log(
      '[Seed] Usuário admin criado (admin@der.com / Admin123@Senha)',
    );
  }

  const c2cData = {
    name: 'C2C Departamento de Estradas de Rodagem',
    email: 'c2c@der.com',
    login: 'c2c@der.com',
    password: 'C2C123@Senha',
    role: Roles.C2C,
    status: UserStatus.ACTIVE,
    phone: '(11) 99999-9999',
  };

  const existsC2C = await prisma.user.findUnique({
    where: { email: c2cData.email },
  });

  if (!existsC2C) {
    const hashedPassword = await bcrypt.hash(c2cData.password, 10);
    await prisma.user.create({
      data: {
        ...c2cData,
        company: { connect: { id: companyId } },
        password: hashedPassword,
      },
    });
    console.log(
      '[Seed] Usuário C2C criado (c2c@der.com / C2C123@Senha)',
    );
  }

  const fieldTeamData = {
    name: 'Equipe de Campo Departamento de Estradas de Rodagem',
    email: 'field-team@der.com',
    login: 'field-team@der.com',
    password: 'FieldTeam123@Senha',
    role: Roles.FIELD_TEAM,
    status: UserStatus.ACTIVE,
    phone: '(11) 99999-9999',
  };

  const existsFieldTeam = await prisma.user.findUnique({
    where: { email: fieldTeamData.email },
  });

  if (!existsFieldTeam) {
    const hashedPassword = await bcrypt.hash(fieldTeamData.password, 10);
    await prisma.user.create({
      data: {
        ...fieldTeamData,
        company: { connect: { id: companyId } },
        password: hashedPassword,
      },
    });
    console.log(
      '[Seed] Usuário Equipe de Campo criado (field-team@der.com / FieldTeam123@Senha)',
    );
  }
}

async function seedWorkOrderColunms(companyId: string) {
  const workOrderColumns = [
    {
      name: 'A Fazer',
      color: '#6b7280',
      sortOrder: 0,
    },
    {
      name: 'Em Progresso',
      color: '#3b82f6',
      sortOrder: 1,
    },
    {
      name: 'Pausada',
      color: '#eab308',
      sortOrder: 2,
    },
    {
      name: 'Cancelada',
      color: '#ef4444',
      sortOrder: 3,
    },
    {
      name: 'Concluído',
      color: '#10b981',
      sortOrder: 4,
    },
  ];

  const exists = await prisma.workOrderColumn.findMany({
    where: {
      companyId,
      OR: workOrderColumns.map((column) => ({
        name: column.name,
        sortOrder: column.sortOrder,
      })),
    },
    select: {
      name: true,
      sortOrder: true,
    },
  });

  const existingColumnKeys = new Set(
    exists.map((column) => `${column.name}-${column.sortOrder}`),
  );

  const missingColumns = workOrderColumns.filter(
    (column) => !existingColumnKeys.has(`${column.name}-${column.sortOrder}`),
  );

  if (!missingColumns.length) return;

  await prisma.workOrderColumn.createMany({
    data: missingColumns.map((column) => ({
      ...column,
      companyId,
      regionalId: null,
    })),
  });
}

runSeed()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });

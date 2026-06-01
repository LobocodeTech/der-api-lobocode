// prisma/seed.ts - Seed para schema Departamento de Estradas de Rodagem
// Valores iniciais apenas: rerodar o seed não altera registros já existentes.
import { PrismaClient, Roles, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Aguarda um pouco para o banco estar estável após migrate (evita "Response from the Engine was empty") */
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SEED_COMPANY_CNPJ = '26.332.986/0001-90';

export async function runSeed() {
  await delay(1500);
  const company = await seedCompany();
  await seedUsers(company.id);
  await seedWorkOrderColumns(company.id);
}

async function seedCompany() {
  const existing = await prisma.company.findUnique({
    where: { cnpj: SEED_COMPANY_CNPJ },
  });
  if (existing) {
    console.log('[Seed] Empresa já existe — ignorando');
    return existing;
  }

  const company = await prisma.company.create({
    data: {
      name: 'Departamento de Estradas de Rodagem',
      cnpj: SEED_COMPANY_CNPJ,
      contactName: 'Contato Departamento de Estradas de Rodagem',
      contactEmail: 'contato@der.com.br',
    },
  });
  console.log('[Seed] Empresa criada');
  return company;
}

async function createSeedUserIfAbsent(
  companyId: string,
  data: {
    name: string;
    email: string;
    login: string;
    password: string;
    role: Roles;
    status: UserStatus;
    phone: string;
  },
  logLabel: string,
) {
  const exists = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (exists) {
    console.log(`[Seed] Usuário já existe — ignorando: ${logLabel}`);
    return;
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);
  await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      login: data.login,
      password: hashedPassword,
      role: data.role,
      status: data.status,
      phone: data.phone,
      companyId,
    },
  });
  console.log(`[Seed] Usuário criado: ${logLabel}`);
}

async function seedUsers(companyId: string) {
  await createSeedUserIfAbsent(
    companyId,
    {
      name: 'Admin Departamento de Estradas de Rodagem',
      email: 'admin@der.com',
      login: 'admin@der.com',
      password: 'Admin123@Senha',
      role: Roles.ADMIN,
      status: UserStatus.ACTIVE,
      phone: '(11) 99999-9999',
    },
    'admin@der.com / Admin123@Senha',
  );

  await createSeedUserIfAbsent(
    companyId,
    {
      name: 'C2C Departamento de Estradas de Rodagem',
      email: 'c2c@der.com',
      login: 'c2c@der.com',
      password: 'C2C123@Senha',
      role: Roles.C2C,
      status: UserStatus.ACTIVE,
      phone: '(11) 99999-9999',
    },
    'c2c@der.com / C2C123@Senha',
  );

  await createSeedUserIfAbsent(
    companyId,
    {
      name: 'Equipe de Campo Departamento de Estradas de Rodagem',
      email: 'field-team@der.com',
      login: 'field-team@der.com',
      password: 'FieldTeam123@Senha',
      role: Roles.FIELD_TEAM,
      status: UserStatus.ACTIVE,
      phone: '(11) 99999-9999',
    },
    'field-team@der.com / FieldTeam123@Senha',
  );
}

/** Colunas iniciais do quadro de OS: só cria se ainda não existir (mesmo nome, empresa, sem regional). */
async function seedWorkOrderColumns(companyId: string) {
  const workOrderColumns = [
    { name: 'A Fazer', color: '#6b7280', sortOrder: 0 },
    { name: 'Em Progresso', color: '#3b82f6', sortOrder: 1 },
    { name: 'Pausada', color: '#eab308', sortOrder: 2 },
    { name: 'Cancelada', color: '#ef4444', sortOrder: 3 },
    { name: 'Concluído', color: '#10b981', sortOrder: 4 },
  ] as const;

  for (const column of workOrderColumns) {
    const existing = await prisma.workOrderColumn.findFirst({
      where: {
        companyId,
        regionalId: null,
        deletedAt: null,
        name: column.name,
      },
    });

    if (existing) {
      console.log(`[Seed] Coluna OS já existe — ignorando: ${column.name}`);
      continue;
    }

    await prisma.workOrderColumn.create({
      data: {
        name: column.name,
        color: column.color,
        sortOrder: column.sortOrder,
        companyId,
        regionalId: null,
      },
    });
    console.log(`[Seed] Coluna OS criada: ${column.name}`);
  }
}

// runSeed()
//   .then(() => prisma.$disconnect())
//   .catch((e) => {
//     console.error(e);
//     prisma.$disconnect();
//     process.exit(1);
//   });

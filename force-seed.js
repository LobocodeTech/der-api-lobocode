/**
 * Seed forçado — domínio DER (Departamento de Estradas de Rodagem).
 * Espelha prisma/seed.ts: empresa, users (ADMIN/C2C/FIELD_TEAM) e colunas de OS.
 * Uso: node force-seed.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const SEED_COMPANY_CNPJ = '26.332.986/0001-90';
const DEFAULT_PASSWORD = 'Admin123@Senha';

async function forceSeed() {
  try {
    console.log('[force-seed] Iniciando...');

    const company = await upsertCompany();
    await upsertUsers(company.id);
    await upsertWorkOrderColumns(company.id);

    console.log('[force-seed] Concluído com sucesso.');
  } catch (error) {
    console.error('[force-seed] Erro:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

async function upsertCompany() {
  console.log('[force-seed] Empresa...');
  const company = await prisma.company.upsert({
    where: { cnpj: SEED_COMPANY_CNPJ },
    update: {},
    create: {
      name: 'Departamento de Estradas de Rodagem',
      cnpj: SEED_COMPANY_CNPJ,
      contactName: 'Contato Departamento de Estradas de Rodagem',
      contactEmail: 'contato@der.com.br',
    },
  });
  console.log('[force-seed] Empresa OK:', company.name);
  return company;
}

async function upsertUser(companyId, data) {
  const hashedPassword = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.upsert({
    where: { email: data.email },
    update: {
      name: data.name,
      login: data.login,
      role: data.role,
      status: 'ACTIVE',
      phone: data.phone,
      companyId,
    },
    create: {
      name: data.name,
      login: data.login,
      email: data.email,
      password: hashedPassword,
      role: data.role,
      status: 'ACTIVE',
      phone: data.phone,
      companyId,
    },
  });
  console.log(`[force-seed] Usuário OK: ${user.email} (${user.role})`);
  return user;
}

async function upsertUsers(companyId) {
  console.log('[force-seed] Usuários...');
  await upsertUser(companyId, {
    name: 'Admin Departamento de Estradas de Rodagem',
    email: 'admin@der.com',
    login: 'admin@der.com',
    password: DEFAULT_PASSWORD,
    role: 'ADMIN',
    phone: '(11) 99999-9999',
  });
  await upsertUser(companyId, {
    name: 'C2C Departamento de Estradas de Rodagem',
    email: 'c2c@der.com',
    login: 'c2c@der.com',
    password: 'C2C123@Senha',
    role: 'C2C',
    phone: '(11) 99999-9999',
  });
  await upsertUser(companyId, {
    name: 'Equipe de Campo Departamento de Estradas de Rodagem',
    email: 'field-team@der.com',
    login: 'field-team@der.com',
    password: 'FieldTeam123@Senha',
    role: 'FIELD_TEAM',
    phone: '(11) 99999-9999',
  });
}

async function upsertWorkOrderColumns(companyId) {
  console.log('[force-seed] Colunas de OS...');
  const columns = [
    { name: 'A Fazer', color: '#6b7280', sortOrder: 0 },
    { name: 'Em Progresso', color: '#3b82f6', sortOrder: 1 },
    { name: 'Pausada', color: '#eab308', sortOrder: 2 },
    { name: 'Cancelada', color: '#ef4444', sortOrder: 3 },
    { name: 'Concluído', color: '#10b981', sortOrder: 4 },
  ];

  for (const column of columns) {
    const existing = await prisma.workOrderColumn.findFirst({
      where: {
        companyId,
        regionalId: null,
        deletedAt: null,
        name: column.name,
      },
    });

    if (existing) {
      console.log(`[force-seed] Coluna já existe: ${column.name}`);
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
    console.log(`[force-seed] Coluna criada: ${column.name}`);
  }
}

// forceSeed(); -- Descomentar para executar o seed

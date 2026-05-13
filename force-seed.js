const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

async function forceSeed() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🌱 Iniciando seed forçado...');
    
    // 1. Criar empresa
    console.log('🏢 Criando empresa...');
    const company = await prisma.company.upsert({
      where: { cnpj: '26.332.986/0001-90' },
      update: {},
      create: {
        name: 'LoboCode',
        cnpj: '26.332.986/0001-90',
      },
    });
    console.log('✅ Empresa criada/atualizada:', company.name);
    
    // 2. Criar posto
    console.log('🏪 Criando posto...');
    let post = await prisma.post.findFirst({
      where: { 
        name: 'Fake Posto',
        companyId: company.id
      }
    });
    
    if (!post) {
      post = await prisma.post.create({
        data: {
          name: 'Fake Posto',
          address: 'Rua Fake, 393',
          companyId: company.id,
        },
      });
      console.log('✅ Posto criado:', post.name);
    } else {
      console.log('✅ Posto já existe:', post.name);
    }
    
    // 3. Criar veículo
    console.log('🚗 Criando veículo...');
    let vehicle = await prisma.vehicle.findFirst({
      where: { 
        model: 'GSR 150I',
        companyId: company.id
      }
    });
    
    if (!vehicle) {
      vehicle = await prisma.vehicle.create({
        data: {
          model: 'GSR 150I',
          companyId: company.id,
          plate: 'FTC7E96',
          type: 'MOTORCYCLE',
          initialKm: 102000,
          currentKm: 102000,
        },
      });
      console.log('✅ Veículo criado:', vehicle.model);
    } else {
      console.log('✅ Veículo já existe:', vehicle.model);
    }
    
    // 4. Criar usuário admin
    console.log('👤 Criando usuário admin...');
    const hashedPassword = await bcrypt.hash('SystemAdmin123@Senha', 10);
    const adminUser = await prisma.user.upsert({
      where: { email: 'systemadmin@user.com' },
      update: {},
      create: {
        name: 'Admin Claiver Almeida de Araújo',
        login: 'System Admin Claiver',
        password: hashedPassword,
        email: 'systemadmin@user.com',
        role: 'SYSTEM_ADMIN',
        profilePicture: null,
        status: 'ACTIVE',
        cpf: '021.564.766-16',
        rg: '680299506',
        phone: '(11) 97073-6987',
        address: 'Rua Jabuticabeira, 393',
      },
    });
    console.log('✅ Usuário admin criado/atualizado:', adminUser.name);
    
    // 5. Criar usuário guarda
    console.log('👮 Criando usuário guarda...');
    const guardPassword = await bcrypt.hash('SystemAdmin123@Senha', 10);
    const guardUser = await prisma.user.upsert({
      where: { email: 'guard@user.com' },
      update: {},
      create: {
        name: 'Guarda Claiver Almeida de Araújo',
        login: 'Guarda Claiver',
        password: guardPassword,
        email: 'guard@user.com',
        role: 'GUARD',
        profilePicture: null,
        status: 'ACTIVE',
        cpf: '270.204.300-31',
        rg: '1234567890',
        phone: '(11) 97073-6987',
        address: 'Rua Jabuticabeira, 393',
        companyId: company.id,
      },
    });
    console.log('✅ Usuário guarda criado/atualizado:', guardUser.name);
    
    console.log('🎉 Seed forçado concluído com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro no seed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

forceSeed();

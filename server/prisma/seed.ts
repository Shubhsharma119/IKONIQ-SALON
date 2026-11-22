import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  let branch = await prisma.branch.findFirst();
  if (!branch) branch = await prisma.branch.create({ data: { name: 'Main Branch' } });
  const phone = '9999999999';
  await prisma.user.upsert({
    where: { phone },
    update: {},
    create: {
      name: 'Owner',
      phone,
      passwordHash: await bcrypt.hash('Owner@123', 10),
      role: 'OWNER',
      branchId: branch.id,
    },
  });
  console.log('Seed done: Main Branch + Owner (9999999999 / Owner@123)');
}
main().finally(() => prisma.$disconnect());

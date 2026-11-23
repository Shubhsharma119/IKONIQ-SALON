const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const r = await prisma.invoice.updateMany({ where: { status: 'CANCELLED', paidAmount: { not: 0 } }, data: { paidAmount: 0 } });
  console.log('Cancelled bills corrected: ' + r.count);
})()
  .catch((e) => { console.error('ERROR: ' + e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

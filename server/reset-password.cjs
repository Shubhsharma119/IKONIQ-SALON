const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const hash = await bcrypt.hash("914931", 10);
  await p.user.update({
    where: { id: 1 },
    data: { passwordHash: hash }
  });
  console.log("NEW PASSWORD SET SUCCESSFULLY");
}
main().catch(console.error).finally(() => p.$disconnect());

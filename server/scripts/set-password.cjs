// Usage (on the server, inside the server folder):
//   PHONE=9999999999 NEWPASS='a-long-new-password' node scripts/set-password.cjs
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();
async function hash(p) {
  for (const lib of ['bcryptjs', 'bcrypt', 'argon2']) {
    let mod;
    try { mod = require(lib); } catch (e) { if (e.code === 'MODULE_NOT_FOUND') continue; throw e; }
    console.log('Hashing with: ' + lib);
    return lib === 'argon2' ? mod.hash(p) : mod.hash(p, 10);
  }
  throw new Error('No known password library (bcryptjs, bcrypt, argon2) found');
}
async function main() {
  const phone = process.env.PHONE;
  const pass = process.env.NEWPASS;
  if (!phone || !pass) throw new Error('Set PHONE and NEWPASS');
  if (pass.length < 10) throw new Error('Use at least 10 characters');
  if (/^owner@123$/i.test(pass)) throw new Error('Do not reuse the default password');
  let field = process.env.FIELD;
  if (!field) {
    const model = Prisma.dmmf && Prisma.dmmf.datamodel.models.find((m) => m.name === 'User');
    const f = model && model.fields.find((x) => x.kind === 'scalar' && /pass/i.test(x.name));
    if (f) field = f.name;
  }
  if (!field) throw new Error('Could not find the password column. Run again with FIELD=<column name>');
  const user = await prisma.user.findFirst({ where: { phone } });
  if (!user) throw new Error('No user with phone ' + phone);
  const h = await hash(pass);
  await prisma.user.update({ where: { id: user.id }, data: { [field]: h } });
  console.log('Password changed for ' + (user.name || phone) + ' (column: ' + field + ')');
}
main().catch((e) => { console.error('ERROR: ' + e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
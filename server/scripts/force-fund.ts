import { prisma } from '../src/db';

const id = process.argv[2];
prisma.job
  .update({ where: { id }, data: { status: 'FUNDED' } })
  .then(() => console.log('forced FUNDED:', id))
  .catch((e) => console.error('ERROR:', e.message))
  .finally(() => prisma.$disconnect());

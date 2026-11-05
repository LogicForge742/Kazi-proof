import './env';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from './db';

// Demo-only accounts, safe to publish in the README for judges.
async function main() {
  const hash = await bcrypt.hash('demo1234', 10);
  await prisma.user.upsert({
    where: { email: 'client@kazi.demo' },
    update: {},
    create: { email: 'client@kazi.demo', name: 'Amina (client, UK)', role: Role.CLIENT, passwordHash: hash },
  });
  await prisma.user.upsert({
    where: { email: 'worker@kazi.demo' },
    update: {},
    create: { email: 'worker@kazi.demo', name: 'Juma (carpenter, Nairobi)', role: Role.WORKER, passwordHash: hash },
  });
  console.log('Seeded demo users');
}

main().finally(() => prisma.$disconnect());

// Prisma client singleton for Next.js + Neon PostgreSQL
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
const g = globalThis as any;

function makePrisma() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as any);
  return new (PrismaClient as any)({ adapter }) as InstanceType<typeof PrismaClient>;
}

// Invalidate cache if model set changes (e.g. after prisma generate adds new models)
const PRISMA_VERSION = 4; // bump when schema changes
if (g.prisma && g._prismaV !== PRISMA_VERSION) {
  g.prisma = undefined;
}
export const prisma: InstanceType<typeof PrismaClient> = g.prisma ?? makePrisma();
if (process.env.NODE_ENV !== 'production') {
  g.prisma = prisma;
  g._prismaV = PRISMA_VERSION;
}

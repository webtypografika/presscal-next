// Prisma client singleton for Next.js

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require('../generated/prisma/client');

const globalForPrisma = globalThis as { prisma?: typeof PrismaClient };

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

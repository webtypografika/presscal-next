/**
 * Update existing B- quotes with email data from Firestore export
 * Adds: threadId, and email context in description
 *
 * Run: npx tsx scripts/update-email-data.ts
 */
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new (PrismaClient as any)({ adapter }) as InstanceType<typeof PrismaClient>;

async function main() {
  // Load firestore export
  const fsQuotes = JSON.parse(readFileSync(join(__dirname, '..', '..', 'presscal', 'export-quotes.json'), 'utf8'));
  const fsMap = new Map<string, any>();
  for (const q of fsQuotes) {
    if (q.number) fsMap.set(`B-${q.number}`, q);
  }

  // Get all B- quotes
  const quotes = await prisma.quote.findMany({
    where: { number: { startsWith: 'B-' } },
    select: { id: true, number: true, threadId: true, description: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const q of quotes) {
    const fs = fsMap.get(q.number);
    if (!fs || !fs.source || fs.source !== 'email') { skipped++; continue; }

    // Build email context for description
    const emailInfo = [
      fs.emailFrom ? `Από: ${fs.emailFrom}` : '',
      fs.emailSubject ? `Θέμα: ${fs.emailSubject}` : '',
      fs.emailBody ? `\n${fs.emailBody.substring(0, 500)}` : '',
    ].filter(Boolean).join('\n');

    const newDesc = emailInfo || q.description || '';

    await prisma.quote.update({
      where: { id: q.id },
      data: {
        threadId: fs.threadId || null,
        description: newDesc,
      },
    });
    updated++;
    console.log(`  ✓ ${q.number} → threadId: ${fs.threadId || '(none)'}`);
  }

  console.log(`\n--- Done ---`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (no email): ${skipped}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => { prisma.$disconnect(); pool.end(); });

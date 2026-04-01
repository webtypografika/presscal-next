/**
 * Deduplication: Merge companies with the same name.
 * - Keep the first one (with most data / quotes)
 * - Move all contacts from duplicates to the survivor
 * - Move quotes & file links to the survivor
 * - Delete the empty duplicates
 *
 * Run: npx tsx scripts/dedup-companies.ts
 */

import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new (PrismaClient as any)({ adapter }) as InstanceType<typeof PrismaClient>;

async function main() {
  // Find all company names that appear more than once
  const allCompanies = await prisma.company.findMany({
    select: { id: true, name: true, afm: true, email: true, phone: true, folderPath: true, elorusContactId: true, address: true },
    orderBy: { name: 'asc' },
  });

  // Group by normalized name (lowercase, trimmed)
  const groups = new Map<string, typeof allCompanies>();
  for (const c of allCompanies) {
    const key = c.name.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  const dupes = [...groups.entries()].filter(([, arr]) => arr.length > 1);
  console.log(`Found ${dupes.length} duplicate company names to merge`);

  let merged = 0;
  let contactsMoved = 0;
  let quotesMoved = 0;
  let fileLinksMoved = 0;
  let deleted = 0;

  for (const [name, arr] of dupes) {
    // Pick the "best" survivor: prefer one with AFM, then folderPath, then most data
    const sorted = arr.sort((a, b) => {
      const scoreA = (a.afm ? 10 : 0) + (a.folderPath ? 5 : 0) + (a.email ? 2 : 0) + (a.elorusContactId ? 3 : 0) + (a.address ? 1 : 0);
      const scoreB = (b.afm ? 10 : 0) + (b.folderPath ? 5 : 0) + (b.email ? 2 : 0) + (b.elorusContactId ? 3 : 0) + (b.address ? 1 : 0);
      return scoreB - scoreA;
    });

    const survivor = sorted[0];
    const victims = sorted.slice(1);

    // Fill in missing fields on survivor from victims
    const updates: Record<string, string> = {};
    for (const v of victims) {
      if (!survivor.afm && v.afm) updates.afm = v.afm;
      if (!survivor.email && v.email) updates.email = v.email;
      if (!survivor.phone && v.phone) updates.phone = v.phone;
      if (!survivor.folderPath && v.folderPath) updates.folderPath = v.folderPath;
      if (!survivor.elorusContactId && v.elorusContactId) updates.elorusContactId = v.elorusContactId;
      if (!survivor.address && v.address) updates.address = v.address;
    }
    if (Object.keys(updates).length > 0) {
      await prisma.company.update({ where: { id: survivor.id }, data: updates });
    }

    for (const victim of victims) {
      // Move contacts (avoid duplicates by email)
      const victimContacts = await prisma.companyContact.findMany({
        where: { companyId: victim.id },
        include: { contact: true },
      });
      const survivorContacts = await prisma.companyContact.findMany({
        where: { companyId: survivor.id },
        include: { contact: true },
      });
      const survivorEmails = new Set(survivorContacts.map((cc: any) => cc.contact.email?.toLowerCase()).filter(Boolean));

      for (const cc of victimContacts) {
        const email = (cc as any).contact.email?.toLowerCase();
        if (email && survivorEmails.has(email)) {
          // Duplicate contact by email — just delete the link + contact
          await prisma.companyContact.delete({ where: { id: cc.id } });
          // Check if contact has other links
          const otherLinks = await prisma.companyContact.count({ where: { contactId: (cc as any).contactId } });
          if (otherLinks === 0) {
            await prisma.contact.delete({ where: { id: (cc as any).contactId } }).catch(() => {});
          }
        } else {
          // Move contact to survivor
          await prisma.companyContact.update({
            where: { id: cc.id },
            data: { companyId: survivor.id, isPrimary: false },
          }).catch(async () => {
            // Unique constraint — delete duplicate link
            await prisma.companyContact.delete({ where: { id: cc.id } }).catch(() => {});
          });
          contactsMoved++;
        }
      }

      // Move quotes
      const qCount = await prisma.quote.updateMany({
        where: { companyId: victim.id },
        data: { companyId: survivor.id },
      });
      quotesMoved += qCount.count;

      // Move file links
      const fCount = await prisma.fileLink.updateMany({
        where: { companyId: victim.id },
        data: { companyId: survivor.id },
      });
      fileLinksMoved += fCount.count;

      // Delete the empty company
      await prisma.company.delete({ where: { id: victim.id } }).catch(() => {
        // If delete fails (FK), soft-mark
        prisma.company.update({ where: { id: victim.id }, data: { deletedAt: new Date() } }).catch(() => {});
      });
      deleted++;
    }

    merged++;
    if (merged % 100 === 0) console.log(`  merged ${merged}/${dupes.length}`);
  }

  const remaining = await prisma.company.count({ where: { deletedAt: null } });
  console.log(`\nDone!`);
  console.log(`  Merged: ${merged} groups`);
  console.log(`  Contacts moved: ${contactsMoved}`);
  console.log(`  Quotes moved: ${quotesMoved}`);
  console.log(`  FileLinks moved: ${fileLinksMoved}`);
  console.log(`  Companies deleted: ${deleted}`);
  console.log(`  Companies remaining: ${remaining}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => { prisma.$disconnect(); pool.end(); });

import { prisma } from '../src/lib/db';

const ORG_ID = 'default-org';

const OLD_QUOTES = [
  { number: 'B-QT-2026-0013', status: 'approved', total: 620, customer: 'Λαμπρος Καζανας', email: 'la.kazanas@gmail.com' },
  { number: 'B-QT-2026-0017', status: 'completed', total: 458.8, customer: 'Μανώλης Τσακίρης', email: 'mtsakiris@praktikatsakiris.gr' },
  { number: 'B-QT-2026-0019', status: 'approved', total: 0, customer: 'Γρηγόρης', email: 'noemail@noemail.gr' },
  { number: 'B-QT-2026-0020', status: 'completed', total: 310, customer: 'Φέστας Χαράλαμπος', email: 'xfestasf@gmail.com' },
  { number: 'B-QT-2026-0023', status: 'completed', total: 91.76, customer: 'Μαριλένα Κανελοπουλου', email: 'marilena.kanellopoulou2@gmail.com' },
  { number: 'B-QT-2026-0031', status: 'completed', total: 22, customer: 'Yiannis Papapostolou', email: 'yiannis@bolospharm.gr' },
  { number: 'B-QT-2026-0032', status: 'sent', total: 98.45, customer: 'ΚΩΝΣΤΑΝΤΙΝΟΣ ΠΟΛΙΤΗΣ', email: 'skpcars1@gmail.com' },
  { number: 'B-QT-2026-0033', status: 'completed', total: 22.32, customer: 'Errik K', email: 'errikblond@gmail.com' },
  { number: 'B-QT-2026-0034', status: 'completed', total: 188.72, customer: 'Έμιλυ Αντωνιάδη', email: 'emilyantoniadi@gmail.com' },
  { number: 'B-QT-2026-0036', status: 'completed', total: 378.72, customer: 'Κυριάκος Στουλικ', email: 'kstoul@gmail.com' },
  { number: 'B-QT-2026-0037', status: 'completed', total: 59.52, customer: 'Δημήτρης Σακαρετσάνος', email: 'dfsakar@gmail.com' },
  { number: 'B-QT-2026-0038', status: 'sent', total: 86.8, customer: 'npantou', email: 'npantou@lynxdesigners.gr' },
  { number: 'B-QT-2026-0043', status: 'approved', total: 0, customer: 'Vanessa mitsi', email: 'vanimitsi@gmail.com' },
  { number: 'B-QT-2026-0044', status: 'completed', total: 0, customer: 'Vasilis Chasakis', email: 'vasilis@sharingbox.gr' },
  { number: 'B-QT-2026-0045', status: 'rejected', total: 917.6, customer: 'Property Management Apollo Home', email: 'apollohome.mg@gmail.com' },
  { number: 'B-QT-2026-0046', status: 'rejected', total: 589, customer: 'alex agelikopulos', email: 'agelikopulos@hotmail.com' },
  { number: 'B-QT-2026-0047', status: 'rejected', total: 1147.09, customer: 'natassa paschali', email: 'natassa.p@gmail.com' },
  { number: 'B-QT-2026-0049', status: 'completed', total: 92.26, customer: 'Irini Stefanidou', email: 'irini@clspack.gr' },
  { number: 'B-QT-2026-0052', status: 'completed', total: 182.05, customer: 'George Polymeris', email: 'polymeris_george@yahoo.gr' },
  { number: 'B-QT-2026-0053', status: 'draft', total: 0, customer: 'Laladaki Maria', email: 'mlaladaki@irc-ellinikou.com' },
  { number: 'B-QT-2026-0054', status: 'completed', total: 0, customer: 'Σπανού Ιωάννα', email: 'joanna@datasolution.gr' },
  { number: 'B-QT-2026-0055', status: 'completed', total: 116.59, customer: 'ΕΣΤΙΑ', email: 'secr@eseepa.gr' },
  { number: 'B-QT-2026-0056', status: 'completed', total: 89.17, customer: 'Κωστας Καρατζιας', email: '' },
  { number: 'B-QT-2026-0057', status: 'sent', total: 248, customer: 'eAgora DCT', email: 'eagora.dct@outlook.com' },
  { number: 'B-QT-2026-0058', status: 'approved', total: 133.23, customer: 'Αρουκάτου Ιωάννα', email: 'iaroukatou@digitalup.gr' },
  { number: 'B-QT-2026-0059', status: 'completed', total: 48.74, customer: 'npantou', email: 'npantou@lynxdesigners.gr' },
  { number: 'B-QT-2026-0060', status: 'draft', total: 0, customer: 'Thanasis Rizopoulos', email: 'thanariz@gmail.com' },
  { number: 'B-QT-2026-0061', status: 'completed', total: 0, customer: 'Γιαννακάς Παναγιώτης', email: 'pangiotisgiannakas@yahoo.com' },
  { number: 'B-QT-2026-0064', status: 'completed', total: 0, customer: 'Irene Kallidou', email: 'i.kallidou@moodyhellas.gr' },
  { number: 'B-QT-2026-0065', status: 'sent', total: 700.74, customer: 'Κωνσταντίνος Λαβίδας', email: 'klabidas@gmail.com' },
  { number: 'B-QT-2026-0066', status: 'completed', total: 49.6, customer: 'Stef Lolos', email: 'steflolos87@gmail.com' },
  { number: 'B-QT-2026-0067', status: 'completed', total: 86.8, customer: 'Βασίλης Χασάκης', email: 'vasilis@sharingbox.gr' },
  { number: 'B-QT-2026-0068', status: 'sent', total: 2983.13, customer: 'Χάρης Αλεξάνδρου', email: 'harryalexandrou@gmail.com' },
  { number: 'B-QT-2026-0070', status: 'approved', total: 53.32, customer: 'Βίκη Λαμπρίδου', email: 'filothei30@gmail.com' },
  { number: 'B-QT-2026-0071', status: 'completed', total: 99.2, customer: 'Βασίλης Χασάκης', email: 'vasilis@sharingbox.gr' },
  { number: 'B-QT-2026-0073', status: 'completed', total: 0, customer: 'ΔΗΜΗΤΡΗΣ ΚΑΛΟΜΟΙΡΗΣ', email: 'dkmoiris@gmail.com' },
  { number: 'B-QT-2026-0074', status: 'sent', total: 1020.74, customer: 'npantou', email: 'npantou@lynxdesigners.gr' },
  { number: 'B-QT-2026-0076', status: 'approved', total: 198.4, customer: 'Thanos Boulios', email: 'thanos@namaarchitects.com' },
  { number: 'B-QT-2026-0077', status: 'sent', total: 238.31, customer: 'npantou', email: 'npantou@lynxdesigners.gr' },
  { number: 'B-QT-2026-0078', status: 'draft', total: 0, customer: 'TheGameChanger', email: 'gamechangertcg@gmail.com' },
  { number: 'B-QT-2026-0079', status: 'approved', total: 0, customer: 'Efi Loukaki (sales)', email: 'sales@bio-pro.gr' },
  { number: 'B-QT-2026-0081', status: 'draft', total: 0, customer: 'kostis karatzias', email: 'k.karatzias@hotmail.gr' },
  { number: 'B-QT-2026-0083', status: 'draft', total: 0, customer: 'DOULOS LAMPROS', email: 'doulos@eap.gr' },
  { number: 'B-QT-2026-0085', status: 'draft', total: 0, customer: 'Stamp.gr', email: 'orders@stamp.gr' },
];

async function main() {
  console.log(`Importing ${OLD_QUOTES.length} quotes...`);

  // Group by email to avoid duplicate companies
  const companyMap = new Map<string, string>(); // email → companyId

  for (const q of OLD_QUOTES) {
    const email = q.email?.toLowerCase().trim() || '';
    let companyId: string | null = null;

    if (email && email !== 'noemail@noemail.gr') {
      // Check if company already exists (by email or from previous iteration)
      if (companyMap.has(email)) {
        companyId = companyMap.get(email)!;
      } else {
        // Search existing company
        const existing = await prisma.company.findFirst({
          where: { orgId: ORG_ID, deletedAt: null, email: { equals: email, mode: 'insensitive' } },
        });
        if (existing) {
          companyId = existing.id;
        } else {
          // Create company + contact
          const company = await prisma.company.create({
            data: { orgId: ORG_ID, name: q.customer, email: email || null },
          });
          const contact = await prisma.contact.create({
            data: { orgId: ORG_ID, name: q.customer, email: email || null },
          });
          await prisma.companyContact.create({
            data: { companyId: company.id, contactId: contact.id, isPrimary: true },
          });
          companyId = company.id;
        }
        companyMap.set(email, companyId);
      }
    }

    // Check if quote already exists
    const existingQuote = await prisma.quote.findFirst({
      where: { orgId: ORG_ID, number: q.number },
    });
    if (existingQuote) {
      console.log(`  SKIP ${q.number} (already exists)`);
      continue;
    }

    // Create quote
    const vatRate = 24;
    const subtotal = q.total > 0 ? Math.round(q.total / 1.24 * 100) / 100 : 0;
    const vatAmount = q.total > 0 ? Math.round((q.total - subtotal) * 100) / 100 : 0;

    await prisma.quote.create({
      data: {
        orgId: ORG_ID,
        number: q.number,
        status: q.status,
        companyId,
        title: `Εισαγωγή από παλιό σύστημα`,
        subtotal,
        vatRate,
        vatAmount,
        grandTotal: q.total,
      },
    });
    console.log(`  ✓ ${q.number} → ${q.customer} (€${q.total})`);
  }

  console.log('\nDone!');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

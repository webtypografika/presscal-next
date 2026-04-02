import { prisma } from '../src/lib/db';

async function main() {
  const products = await prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, name: true, offset: true, digital: true } });
  for (const pr of products) {
    console.log('===', pr.name, '===');
    const off = pr.offset as Record<string, unknown> | null;
    const dig = pr.digital as Record<string, unknown> | null;
    console.log('OFFSET hourly_enabled:', off?.hourly_enabled, 'hourly_rate:', off?.hourly_rate);
    console.log('DIGITAL hourly_enabled:', dig?.hourly_enabled, 'hourly_rate:', dig?.hourly_rate);
    console.log('OFFSET charge_per_color:', off?.charge_per_color);
    console.log('');
  }
  await prisma.$disconnect();
}
main();

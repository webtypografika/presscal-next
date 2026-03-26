import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { prisma } from '@/lib/db';

const ORG_ID = 'default-org';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Μόνο εικόνες' }, { status: 400 });
    }
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'Max 2MB' }, { status: 400 });
    }

    const ext = file.name.split('.').pop() || 'png';
    const filename = `company-logo.${ext}`;
    const uploadDir = join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, filename), Buffer.from(bytes));

    const url = `/uploads/${filename}?t=${Date.now()}`;

    // Save path (not base64) to DB
    await prisma.$queryRawUnsafe(
      `UPDATE "Org" SET logo = $1, "updatedAt" = NOW() WHERE id = $2`,
      url.split('?')[0], ORG_ID
    );

    return NextResponse.json({ url });
  } catch (e) {
    console.error('Upload error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

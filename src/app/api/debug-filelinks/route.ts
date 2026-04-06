import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// TEMPORARY debug endpoint — delete after debugging
export async function GET(req: NextRequest) {
  try {
    const quoteId = req.nextUrl.searchParams.get('quoteId');
    if (!quoteId) return NextResponse.json({ error: 'quoteId required' });

    const links = await (prisma as any).fileLink.findMany({
      where: { quoteId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      select: { id: true, number: true, title: true, company: { select: { name: true, folderPath: true } } },
    });

    const org = await prisma.org.findFirst({
      where: { id: 'default-org' },
      select: { id: true, jobFolderRoot: true },
    });

    let folderPath: string | null = null;
    if (quote && org) {
      try {
        const { buildJobFolderPath } = await import('@/lib/job-folder');
        folderPath = buildJobFolderPath({
          globalRoot: org.jobFolderRoot || null,
          companyFolderPath: null,
          companyName: quote.company?.name || 'Test',
          quoteNumber: quote.number,
          quoteTitle: quote.title,
        });
      } catch (e) {
        return NextResponse.json({ error: 'buildJobFolderPath failed', message: (e as Error).message });
      }
    }

    return NextResponse.json({
      fileCount: links.length,
      files: links.map((f: any) => ({ id: f.id, fileName: f.fileName, filePath: f.filePath?.substring(0, 80), source: f.source })),
      quote: quote ? { id: quote.id, number: quote.number, company: quote.company?.name } : null,
      orgJobFolderRoot: org?.jobFolderRoot,
      folderPath,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, stack: (e as Error).stack }, { status: 500 });
  }
}

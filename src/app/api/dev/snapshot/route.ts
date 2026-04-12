import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';

const PT_TO_MM = 25.4 / 72;

function ptBoxToMm(box: { x: number; y: number; width: number; height: number }) {
  return {
    xMm: +(box.x * PT_TO_MM).toFixed(3),
    yMm: +(box.y * PT_TO_MM).toFixed(3),
    wMm: +(box.width * PT_TO_MM).toFixed(3),
    hMm: +(box.height * PT_TO_MM).toFixed(3),
    xPt: +box.x.toFixed(3),
    yPt: +box.y.toFixed(3),
    wPt: +box.width.toFixed(3),
    hPt: +box.height.toFixed(3),
  };
}

async function summarizePdf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  return {
    pageCount: pages.length,
    pages: pages.map((p, i) => {
      const safe = (fn: () => any) => { try { return fn(); } catch { return null; } };
      const mb = safe(() => p.getMediaBox());
      const cb = safe(() => p.getCropBox());
      const tb = safe(() => p.getTrimBox());
      const bb = safe(() => p.getBleedBox());
      const ab = safe(() => p.getArtBox());
      return {
        index: i,
        rotation: p.getRotation().angle,
        widthPt: +p.getWidth().toFixed(3),
        heightPt: +p.getHeight().toFixed(3),
        widthMm: +(p.getWidth() * PT_TO_MM).toFixed(3),
        heightMm: +(p.getHeight() * PT_TO_MM).toFixed(3),
        mediaBox: mb ? ptBoxToMm(mb) : null,
        cropBox: cb ? ptBoxToMm(cb) : null,
        trimBox: tb ? ptBoxToMm(tb) : null,
        bleedBox: bb ? ptBoxToMm(bb) : null,
        artBox: ab ? ptBoxToMm(ab) : null,
      };
    }),
  };
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'dev only' }, { status: 403 });
  }
  try {
    const form = await req.formData();
    const stateRaw = form.get('state');
    const pdfFile = form.get('pdf');
    const label = (form.get('label') as string | null) || '';

    const dir = join(process.cwd(), '.claude', 'snapshots');
    await mkdir(dir, { recursive: true });

    const written: string[] = [];

    if (typeof stateRaw === 'string' && stateRaw.length) {
      const stateObj = JSON.parse(stateRaw);
      const meta = {
        capturedAt: new Date().toISOString(),
        label,
      };
      const out = { meta, ...stateObj };
      const p = join(dir, 'state.json');
      await writeFile(p, JSON.stringify(out, null, 2), 'utf8');
      written.push(p);
    }

    let pdfSummary: any = null;
    if (pdfFile && pdfFile instanceof File && pdfFile.size > 0) {
      const ab = await pdfFile.arrayBuffer();
      const bytes = new Uint8Array(ab);
      const pdfPath = join(dir, 'last-export.pdf');
      await writeFile(pdfPath, bytes);
      written.push(pdfPath);
      try {
        pdfSummary = await summarizePdf(bytes);
        const sp = join(dir, 'pdf-summary.json');
        await writeFile(sp, JSON.stringify(pdfSummary, null, 2), 'utf8');
        written.push(sp);
      } catch (e) {
        pdfSummary = { error: 'summary failed: ' + (e as Error).message };
      }
    }

    return NextResponse.json({
      ok: true,
      written,
      pdfSummary: pdfSummary ? { pageCount: pdfSummary.pageCount } : null,
    });
  } catch (e) {
    console.error('snapshot error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

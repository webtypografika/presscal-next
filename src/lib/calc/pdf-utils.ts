// PressCal Pro — PDF Utilities
// Lazy-loads pdf.js + pdf-lib, parses PDFs, generates thumbnails

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── TYPES ───

export interface PDFPageSize {
  w: number;          // media width mm
  h: number;          // media height mm
  cropW: number;
  cropH: number;
  cropOffX: number;
  cropOffY: number;
  trimW: number;      // trim width mm (job size)
  trimH: number;      // trim height mm
  trimOffX: number | null;
  trimOffY: number | null;
  bleedDetected: number; // mm, auto-detected from TrimBox
  rotation: number;
}

export interface ParsedPDF {
  bytes: Uint8Array;
  pageCount: number;
  pageSizes: PDFPageSize[];
  fileName: string;
  thumbnails: (HTMLCanvasElement | null)[];
  fileMap?: { name: string; startPage: number; endPage: number }[];
}

// ─── PT → MM ───
function ptToMM(pt: number): number {
  return Math.round(pt * 25.4 / 72 * 10) / 10;
}

// ─── LAZY LOAD pdf.js ───
let pdfJSLoaded = false;

async function loadPdfJS(): Promise<void> {
  if (pdfJSLoaded && typeof (window as any).pdfjsLib !== 'undefined') return;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      pdfJSLoaded = true;
      resolve();
    };
    s.onerror = () => reject(new Error('Failed to load pdf.js'));
    document.head.appendChild(s);
  });
}

// ─── LAZY LOAD pdf-lib ───
let pdfLibLoaded = false;

async function loadPdfLib(): Promise<void> {
  if (pdfLibLoaded && typeof (window as any).PDFLib !== 'undefined') return;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
    s.onload = () => { pdfLibLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('Failed to load pdf-lib'));
    document.head.appendChild(s);
  });
}

// ─── GENERATE THUMBNAILS ───
async function generateThumbnails(pdfDoc: any, pageCount: number): Promise<(HTMLCanvasElement | null)[]> {
  const thumbs: (HTMLCanvasElement | null)[] = new Array(pageCount).fill(null);
  const promises: Promise<void>[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const idx = i - 1;
    promises.push(
      pdfDoc.getPage(i).then((page: any) => {
        const vp = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        return page.render({ canvasContext: ctx, viewport: vp }).promise.then(() => {
          thumbs[idx] = canvas;
        });
      })
    );
  }
  await Promise.all(promises);
  return thumbs;
}

// ─── PARSE PDF ───
export async function parsePDF(file: File): Promise<ParsedPDF> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const bytesForStorage = new Uint8Array(bytes);

  // Load libraries
  await Promise.all([loadPdfJS(), loadPdfLib()]);
  const pdfjsLib = (window as any).pdfjsLib;
  const PDFLib = (window as any).PDFLib;

  // Parse with pdf.js
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdfDoc = await loadingTask.promise;
  const pageCount = pdfDoc.numPages;

  // Parse boxes with pdf-lib
  let pageSizes: PDFPageSize[] = [];
  try {
    const pdfLibDoc = await PDFLib.PDFDocument.load(bytesForStorage, { ignoreEncryption: true });
    const pdfLibPages = pdfLibDoc.getPages();

    for (let i = 0; i < pdfLibPages.length; i++) {
      const plPage = pdfLibPages[i];
      const mediaBox = plPage.getMediaBox();
      let mediaW = ptToMM(mediaBox.width);
      let mediaH = ptToMM(mediaBox.height);

      const cropBox = plPage.getCropBox();
      let cropW = ptToMM(cropBox.width);
      let cropH = ptToMM(cropBox.height);
      let cropOffX = ptToMM(cropBox.x - mediaBox.x);
      let cropOffY = ptToMM(cropBox.y - mediaBox.y);

      let trimW = mediaW, trimH = mediaH;
      let bleedDetected = 0;
      let trimOffX: number | null = null;
      let trimOffY: number | null = null;

      // TrimBox
      try {
        const trimBox = plPage.getTrimBox();
        const tbW = ptToMM(trimBox.width);
        const tbH = ptToMM(trimBox.height);
        if (tbW < mediaW - 0.5 || tbH < mediaH - 0.5) {
          trimW = tbW;
          trimH = tbH;
          trimOffX = ptToMM(trimBox.x - cropBox.x);
          trimOffY = ptToMM((cropBox.y + cropBox.height) - (trimBox.y + trimBox.height));
          let hasTrimBoxEntry = false;
          try { hasTrimBoxEntry = !!(plPage.node && plPage.node.get(PDFLib.PDFName.of('TrimBox'))); } catch {}
          if (hasTrimBoxEntry) {
            bleedDetected = Math.round(Math.max((mediaW - trimW) / 2, (mediaH - trimH) / 2) * 10) / 10;
          }
        }
      } catch {}

      // BleedBox fallback
      if (trimW === mediaW && trimH === mediaH) {
        try {
          const bleedBox = plPage.getBleedBox();
          const bbW = ptToMM(bleedBox.width);
          const bbH = ptToMM(bleedBox.height);
          if (bbW < mediaW - 0.5 || bbH < mediaH - 0.5) {
            trimW = bbW;
            trimH = bbH;
            let hasBleedBoxEntry = false;
            try { hasBleedBoxEntry = !!(plPage.node && plPage.node.get(PDFLib.PDFName.of('BleedBox'))); } catch {}
            if (hasBleedBoxEntry) {
              bleedDetected = Math.round(Math.max((mediaW - trimW) / 2, (mediaH - trimH) / 2) * 10) / 10;
            }
          }
        } catch {}
      }

      if (bleedDetected > 5) bleedDetected = 0;

      // Handle /Rotate
      let pageRotation = 0;
      try { pageRotation = plPage.getRotation().angle || 0; } catch {}
      const isRotated90 = (pageRotation === 90 || pageRotation === 270);
      if (isRotated90) {
        [mediaW, mediaH] = [mediaH, mediaW];
        [cropW, cropH] = [cropH, cropW];
        [trimW, trimH] = [trimH, trimW];
        [cropOffX, cropOffY] = [cropOffY, cropOffX];
        if (trimOffX != null && trimOffY != null) [trimOffX, trimOffY] = [trimOffY, trimOffX];
      }

      pageSizes.push({
        w: mediaW, h: mediaH,
        cropW, cropH, cropOffX, cropOffY,
        trimW, trimH, trimOffX, trimOffY,
        bleedDetected, rotation: pageRotation,
      });
    }
  } catch {
    // pdf-lib failed — fallback to pdf.js viewport
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdfDoc.getPage(i);
      const vp = page.getViewport({ scale: 1.0 });
      const w = ptToMM(vp.width);
      const h = ptToMM(vp.height);
      pageSizes.push({
        w, h, cropW: w, cropH: h, cropOffX: 0, cropOffY: 0,
        trimW: w, trimH: h, trimOffX: null, trimOffY: null,
        bleedDetected: 0, rotation: 0,
      });
    }
  }

  // Generate thumbnails
  const thumbnails = await generateThumbnails(pdfDoc, pageCount);

  return {
    bytes: bytesForStorage,
    pageCount,
    pageSizes,
    fileName: file.name,
    thumbnails,
  };
}

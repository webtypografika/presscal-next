import { readFileSync } from 'fs';
import { PDFDocument } from 'pdf-lib';

const [, , arg] = process.argv;
if (!arg) { console.error('usage: node scripts/dump-pdf.mjs <file.pdf>'); process.exit(1); }

const bytes = readFileSync(arg);
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const pages = doc.getPages();
const PT_TO_MM = 25.4 / 72;
const fmt = (box) => box && {
  xMm: +(box.x * PT_TO_MM).toFixed(3), yMm: +(box.y * PT_TO_MM).toFixed(3),
  wMm: +(box.width * PT_TO_MM).toFixed(3), hMm: +(box.height * PT_TO_MM).toFixed(3),
};
const safe = (fn) => { try { return fn(); } catch { return null; } };

console.log(`File: ${arg}`);
console.log(`Pages: ${pages.length}`);
pages.forEach((p, i) => {
  console.log(`\n— Page ${i + 1} —`);
  console.log('  size (mm):', +(p.getWidth() * PT_TO_MM).toFixed(2), 'x', +(p.getHeight() * PT_TO_MM).toFixed(2));
  console.log('  rotation :', p.getRotation().angle);
  console.log('  media    :', fmt(safe(() => p.getMediaBox())));
  console.log('  crop     :', fmt(safe(() => p.getCropBox())));
  console.log('  trim     :', fmt(safe(() => p.getTrimBox())));
  console.log('  bleed    :', fmt(safe(() => p.getBleedBox())));
  console.log('  art      :', fmt(safe(() => p.getArtBox())));
});

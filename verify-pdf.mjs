#!/usr/bin/env node
/**
 * verify-pdf.mjs — Check if a cutdeck PDF contains non-blank embedded images.
 * Usage: node verify-pdf.mjs <path-to-pdf>
 */
import { PDFDocument } from 'pdf-lib';
import { readFileSync } from 'fs';

const pdfPath = process.argv[2];
if (!pdfPath) { console.error('Usage: node verify-pdf.mjs <path>'); process.exit(1); }

const pdfBytes = new Uint8Array(readFileSync(pdfPath));
const pdfDoc = await PDFDocument.load(pdfBytes);
const pageCount = pdfDoc.getPageCount();
console.log(`\nPDF: ${pdfPath}`);
console.log(`Pages: ${pageCount}`);
console.log(`File size: ${(pdfBytes.length / 1024 / 1024).toFixed(1)} MB\n`);

let totalImages = 0;
let blankImages = 0;

for (let p = 0; p < pageCount; p++) {
  const page = pdfDoc.getPage(p);
  const { width, height } = page.getSize();
  console.log(`── Page ${p + 1} (${width.toFixed(0)}×${height.toFixed(0)} pt) ──`);

  const pageDict = page.node;

  // Walk the raw PDF object to find images
  // pdf-lib stores page content; we look at all indirect objects for Image XObjects
  const context = pdfDoc.context;
  let imagesOnPage = 0;

  try {
    // Get Resources
    const resRef = pageDict.get(context.obj('Resources'));
    if (!resRef) { console.log('  No Resources'); continue; }
    const res = resRef.resolve ? resRef.resolve() : resRef;

    const xobjRef = res.get(context.obj('XObject'));
    if (!xobjRef) { console.log('  No XObject — no images'); continue; }
    const xobj = xobjRef.resolve ? xobjRef.resolve() : xobjRef;

    for (const [key, ref] of xobj.entries()) {
      try {
        const obj = ref.resolve ? ref.resolve() : ref;
        const subtype = obj.get(context.obj('Subtype'));
        if (!subtype || subtype.toString() !== '/Image') continue;

        imagesOnPage++;
        totalImages++;

        const w = obj.get(context.obj('Width'));
        const h = obj.get(context.obj('Height'));
        const streamRef = obj.get(context.obj('Stream'));

        if (!streamRef) { console.log(`  ${key}: ${w}×${h}, no stream`); continue; }

        // Read raw stream bytes
        const streamObj = streamRef;
        let bytes;
        if (streamObj instanceof Uint8Array) {
          bytes = streamObj;
        } else if (streamObj.contents) {
          bytes = new Uint8Array(streamObj.contents);
        } else if (typeof streamObj === 'object' && streamObj.length) {
          bytes = new Uint8Array(streamObj);
        } else {
          // Try to access underlying buffer
          try {
            bytes = new Uint8Array(pdfDoc.context.lookup(streamRef.tag ? streamRef : ref));
          } catch {
            console.log(`  ${key}: ${w}×${h}, cannot read stream`);
            continue;
          }
        }

        let nonZero = 0;
        const checkLen = Math.min(bytes.length, 200000);
        for (let i = 0; i < checkLen; i++) { if (bytes[i] !== 0) nonZero++; }
        const pct = (nonZero / checkLen * 100).toFixed(1);

        if (nonZero === 0) {
          blankImages++;
          console.log(`  ⚠ ${key}: ${w}×${h}, ${bytes.length} bytes — ALL ZEROS (BLANK)`);
        } else {
          console.log(`  ✓ ${key}: ${w}×${h}, ${bytes.length} bytes, ${pct}% non-zero`);
        }
      } catch (e) {
        console.log(`  ${key}: error reading — ${e.message}`);
      }
    }

    if (imagesOnPage === 0) console.log('  No Image XObjects on this page');
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }
  console.log();
}

console.log(`── Summary ──`);
console.log(`Total images: ${totalImages}`);
console.log(`Blank images: ${blankImages}`);
if (blankImages === 0 && totalImages > 0) {
  console.log('✓ All images contain non-zero pixel data');
} else if (blankImages > 0) {
  console.log('⚠ Some images are blank — content not rendered');
}

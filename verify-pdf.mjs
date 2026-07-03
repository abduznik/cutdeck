#!/usr/bin/env node
/**
 * verify-pdf.js — Extract and inspect images from a cutdeck-generated PDF.
 *
 * Usage: node verify-pdf.js <path-to-pdf> [output-dir]
 *
 * Requires: pdf-lib (already a project dependency)
 * Outputs: per-page PNG renders + per-image metadata to stdout
 */

import { PDFDocument } from 'pdf-lib';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const pdfPath = process.argv[2];
const outDir = process.argv[3] || 'debug-output';

if (!pdfPath) {
  console.error('Usage: node verify-pdf.js <path-to-pdf> [output-dir]');
  process.exit(1);
}

const pdfBytes = new Uint8Array((await import('fs')).readFileSync(pdfPath));
const pdfDoc = await PDFDocument.load(pdfBytes);

const pageCount = pdfDoc.getPageCount();
console.log(`\nPDF: ${pdfPath}`);
console.log(`Pages: ${pageCount}`);

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

for (let p = 0; p < pageCount; p++) {
  const page = pdfDoc.getPage(p);
  const { width, height } = page.getSize();
  console.log(`\n── Page ${p + 1} ──`);
  console.log(`  Size: ${width.toFixed(1)} × ${height.toFixed(1)} pt`);

  // Inspect the page's content stream for image references
  const resources = page.node.get(pdfDoc.context.obj('Resources')) || page.node.Resources();
  if (!resources) {
    console.log('  Resources: none found');
    continue;
  }

  const xObject = resources.get(pdfDoc.context.obj('XObject'));
  if (!xObject) {
    console.log('  XObject: none — no embedded images');
    continue;
  }

  const xObjectKeys = xObject.keys ? [...xObject.keys()] : [];
  let imageCount = 0;

  for (const key of xObjectKeys) {
    const ref = xObject.get(key);
    if (!ref) continue;

    let obj;
    try {
      obj = ref.resolve ? ref.resolve() : ref;
    } catch {
      continue;
    }

    // Check if it's a Do instruction (XObject reference) — we look for Image type
    const subtype = obj.get(pdfDoc.context.obj('Subtype'));
    const subtypeStr = subtype ? subtype.toString() : '';

    if (subtypeStr === '/Image') {
      imageCount++;
      const w = obj.get(pdfDoc.context.obj('Width'));
      const h = obj.get(pdfDoc.context.obj('Height'));
      const bitsPerComponent = obj.get(pdfDoc.context.obj('BitsPerComponent'));
      const colorSpace = obj.get(pdfDoc.context.obj('ColorSpace'));

      console.log(`  Image "${key.toString()}":`);
      console.log(`    Dimensions: ${w} × ${h}`);
      console.log(`    BitsPerComponent: ${bitsPerComponent}`);
      console.log(`    ColorSpace: ${colorSpace}`);

      // Try to extract raw image data
      try {
        const imgBytes = obj.get(pdfDoc.context.obj('Stream'));
        if (imgBytes) {
          const arr = imgBytes instanceof Uint8Array ? imgBytes : new Uint8Array(imgBytes);
          console.log(`    Stream size: ${arr.length} bytes`);

          // Sample first 20 bytes
          const sample = Array.from(arr.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' ');
          console.log(`    First 20 bytes: ${sample}`);

          // Check if all zeros (blank)
          let nonZero = 0;
          for (let i = 0; i < arr.length; i++) {
            if (arr[i] !== 0) nonZero++;
          }
          console.log(`    Non-zero bytes: ${nonZero} / ${arr.length} (${(nonZero / arr.length * 100).toFixed(1)}%)`);
          if (nonZero === 0) {
            console.log(`    ⚠ IMAGE IS ALL ZEROS (blank)`);
          }
        }
      } catch (e) {
        console.log(`    Could not read stream: ${e.message}`);
      }
    }
  }

  if (imageCount === 0) {
    console.log('  No Image XObjects found on this page');
  } else {
    console.log(`  Total images on page: ${imageCount}`);
  }
}

console.log('\n── Done ──');
console.log('For visual inspection, open the PDF in a browser or PDF viewer.');
console.log('To extract page renders, use: npx pdfjs-dist-cli --help');

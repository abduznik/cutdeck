import jsPDF from 'jspdf';
import type { Card } from './parser';
import { computeGrid, mmToPt, type GridConfig } from './grid';
import type { RenderedCard } from './cardRenderer';

export interface PdfOptions {
  gridConfig: GridConfig;
  cards: Card[];
  renderedCards: RenderedCard[];
}

function drawCutGuides(
  doc: jsPDF,
  rows: number,
  cols: number,
  pageW: number,
  pageH: number
): void {
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([2, 2], 0);

  for (let r = 1; r < rows; r++) {
    const y = (pageH / rows) * r;
    doc.line(0, y, pageW, y);
  }

  for (let c = 1; c < cols; c++) {
    const x = (pageW / cols) * c;
    doc.line(x, 0, x, pageH);
  }

  doc.setLineDashPattern([], 0);
}

export function generatePdf(options: PdfOptions): Uint8Array {
  const { gridConfig, cards, renderedCards } = options;
  const grid = computeGrid(gridConfig, cards.length);

  const pageW = mmToPt(grid.paperWidthMm);
  const pageH = mmToPt(grid.paperHeightMm);
  const cardW = pageW / grid.cols;
  const cardH = pageH / grid.rows;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: [pageW, pageH],
  });

  for (let sheet = 0; sheet < grid.totalSheets; sheet++) {
    const sheetStart = sheet * grid.cardsPerPage;
    const sheetEnd = Math.min(sheetStart + grid.cardsPerPage, cards.length);
    const sheetRendered = renderedCards.slice(sheetStart, sheetEnd);

    // --- Front page ---
    doc.addPage([pageW, pageH], 'portrait');

    for (let i = 0; i < grid.cardsPerPage; i++) {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      const x = col * cardW;
      const y = row * cardH;

      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.rect(x, y, cardW, cardH);

      if (i < sheetRendered.length) {
        const imgData = sheetRendered[i].front;
        if (imgData) {
          doc.addImage(imgData, 'JPEG', x, y, cardW, cardH);
        }
      }
    }

    drawCutGuides(doc, grid.rows, grid.cols, pageW, pageH);

    // --- Back page (mirrored horizontally per row) ---
    doc.addPage([pageW, pageH], 'portrait');

    for (let i = 0; i < grid.cardsPerPage; i++) {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      const mirroredCol = grid.cols - 1 - col;
      const x = mirroredCol * cardW;
      const y = row * cardH;

      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.rect(x, y, cardW, cardH);

      if (i < sheetRendered.length) {
        const imgData = sheetRendered[i].back;
        if (imgData) {
          doc.addImage(imgData, 'JPEG', x, y, cardW, cardH);
        }
      }
    }

    drawCutGuides(doc, grid.rows, grid.cols, pageW, pageH);
  }

  doc.deletePage(1);

  return new Uint8Array(doc.output('arraybuffer'));
}

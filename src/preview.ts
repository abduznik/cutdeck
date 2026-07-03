import type { Card } from './parser';
import { computeGrid, type GridConfig } from './grid';
import { renderPreviewFace, type TextAlign } from './cardRenderer';

export function renderPreview(
  container: HTMLElement,
  cards: Card[],
  config: GridConfig,
  textAlign: TextAlign
): void {
  container.innerHTML = '';

  if (cards.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'preview-empty';
    empty.textContent = 'Paste or drop a file to see preview';
    container.appendChild(empty);
    return;
  }

  const grid = computeGrid(config, cards.length);

  const containerW = container.clientWidth - 32;
  const scale = containerW / grid.paperWidthMm;

  const paperW = grid.paperWidthMm * scale;
  const paperH = grid.paperHeightMm * scale;
  const cardW = grid.cardWidthMm * scale;
  const cardH = grid.cardHeightMm * scale;

  // Front page
  const frontPage = document.createElement('div');
  frontPage.className = 'preview-page';
  frontPage.style.width = `${paperW}px`;
  frontPage.style.height = `${paperH}px`;

  const frontCards = cards.slice(0, grid.cardsPerPage);
  for (let i = 0; i < grid.cardsPerPage; i++) {
    const col = i % grid.cols;
    const row = Math.floor(i / grid.cols);

    const cell = document.createElement('div');
    cell.className = 'preview-card';
    cell.style.left = `${col * cardW}px`;
    cell.style.top = `${row * cardH}px`;
    cell.style.width = `${cardW - 1}px`;
    cell.style.height = `${cardH - 1}px`;
    cell.style.fontSize = `${Math.max(6, 11 * scale)}px`;

    if (i < frontCards.length) {
      renderPreviewFace(cell, frontCards[i].front, frontCards[i].frontRtl, textAlign, cardW, cardH);
      if (frontCards[i].warnings.length > 0) {
        const badge = document.createElement('span');
        badge.className = 'preview-warn-badge';
        badge.textContent = '!';
        cell.appendChild(badge);
      }
    }
    frontPage.appendChild(cell);
  }

  addCutGuideLabels(frontPage, grid.rows, grid.cols, cardW, cardH, scale);

  const frontLabel = document.createElement('div');
  frontLabel.className = 'preview-page-label';
  frontLabel.textContent = `FRONT — sheet 1`;
  frontPage.appendChild(frontLabel);
  container.appendChild(frontPage);

  // Back page
  const backPage = document.createElement('div');
  backPage.className = 'preview-page';
  backPage.style.width = `${paperW}px`;
  backPage.style.height = `${paperH}px`;

  for (let i = 0; i < grid.cardsPerPage; i++) {
    const col = i % grid.cols;
    const row = Math.floor(i / grid.cols);
    const mirroredCol = grid.cols - 1 - col;

    const cell = document.createElement('div');
    cell.className = 'preview-card preview-card--back';
    cell.style.left = `${mirroredCol * cardW}px`;
    cell.style.top = `${row * cardH}px`;
    cell.style.width = `${cardW - 1}px`;
    cell.style.height = `${cardH - 1}px`;
    cell.style.fontSize = `${Math.max(6, 11 * scale)}px`;

    if (i < frontCards.length) {
      renderPreviewFace(cell, frontCards[i].back, frontCards[i].backRtl, textAlign, cardW, cardH);
    }
    backPage.appendChild(cell);
  }

  addCutGuideLabels(backPage, grid.rows, grid.cols, cardW, cardH, scale);

  const backLabel = document.createElement('div');
  backLabel.className = 'preview-page-label';
  backLabel.textContent = `BACK — sheet 1 (mirrored)`;
  backPage.appendChild(backLabel);
  container.appendChild(backPage);
}

function addCutGuideLabels(
  page: HTMLElement,
  rows: number,
  cols: number,
  cardW: number,
  cardH: number,
  scale: number
): void {
  for (let r = 1; r < rows; r++) {
    const y = r * cardH;
    const tick = document.createElement('div');
    tick.className = 'cut-tick cut-tick--h';
    tick.style.top = `${y}px`;
    tick.style.width = `${8 * scale}px`;
    page.appendChild(tick);
  }

  for (let c = 1; c < cols; c++) {
    const x = c * cardW;
    const tick = document.createElement('div');
    tick.className = 'cut-tick cut-tick--v';
    tick.style.left = `${x}px`;
    tick.style.height = `${8 * scale}px`;
    page.appendChild(tick);
  }
}

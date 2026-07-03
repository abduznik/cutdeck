import { parseInput } from './parser';
import { computeGrid, getPaperPreset, PAPER_PRESETS, type GridConfig } from './grid';
import { CardRenderer } from './cardRenderer';
import { generatePdf } from './pdf';
import { renderPreview } from './preview';

// DOM refs
const textarea = document.getElementById('card-input') as HTMLTextAreaElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const dropZone = document.getElementById('drop-zone') as HTMLElement;
const dropHint = document.getElementById('drop-hint') as HTMLElement;

const gridRows = document.getElementById('grid-rows') as HTMLInputElement;
const gridCols = document.getElementById('grid-cols') as HTMLInputElement;
const paperSize = document.getElementById('paper-size') as HTMLSelectElement;
const fontSizeRange = document.getElementById('font-size-range') as HTMLInputElement;
const fontSizeLabel = document.getElementById('font-size-label') as HTMLElement;

const cardCountEl = document.getElementById('card-count') as HTMLElement;
const sheetInfoEl = document.getElementById('sheet-info') as HTMLElement;
const pageInfoEl = document.getElementById('page-info') as HTMLElement;
const errorListEl = document.getElementById('error-list') as HTMLElement;
const warnListEl = document.getElementById('warn-list') as HTMLElement;

const previewContainer = document.getElementById('preview-container') as HTMLElement;
const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
const statusEl = document.getElementById('gen-status') as HTMLElement;

let renderer: CardRenderer | null = null;

function getConfig(): GridConfig {
  const paper = getPaperPreset(paperSize.value);
  return {
    paperSize: paperSize.value,
    rows: parseInt(gridRows.value, 10) || paper.defaultRows,
    cols: parseInt(gridCols.value, 10) || paper.defaultCols,
  };
}

function updateSummary(cards: ReturnType<typeof parseInput>['cards'], errors: ReturnType<typeof parseInput>['errors']) {
  const config = getConfig();
  const grid = computeGrid(config, cards.length);

  cardCountEl.textContent = `${cards.length} card${cards.length !== 1 ? 's' : ''} parsed`;
  sheetInfoEl.textContent = `${grid.cardsPerPage} per sheet → ${grid.totalSheets} sheet${grid.totalSheets !== 1 ? 's' : ''} (${grid.totalPages} pages)`;

  const paper = getPaperPreset(config.paperSize);
  const cardWmm = grid.cardWidthMm.toFixed(1);
  const cardHmm = grid.cardHeightMm.toFixed(1);
  pageInfoEl.textContent = `${paper.label} ${grid.cols}×${grid.rows} — card cell ${cardWmm}×${cardHmm} mm`;

  // Errors
  errorListEl.innerHTML = '';
  for (const err of errors) {
    const li = document.createElement('li');
    li.className = 'error-item';
    li.textContent = `L${err.line}: ${err.reason} — "${truncate(err.text, 50)}"`;
    errorListEl.appendChild(li);
  }

  // Pre-generation warnings
  warnListEl.innerHTML = '';
  if (grid.totalSheets > 1) {
    const li = document.createElement('li');
    li.className = 'warn-item';
    li.textContent = `${cards.length} cards exceeds ${grid.cardsPerPage}/sheet — will generate ${grid.totalPages} PDF pages`;
    warnListEl.appendChild(li);
  }
  for (let i = 0; i < cards.length; i++) {
    for (const w of cards[i].warnings) {
      const li = document.createElement('li');
      li.className = 'warn-item';
      li.textContent = `Card ${i + 1}: ${w}`;
      warnListEl.appendChild(li);
    }
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

let updateTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleUpdate(): void {
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = setTimeout(doUpdate, 120);
}

function doUpdate(): void {
  const { cards, errors } = parseInput(textarea.value);
  updateSummary(cards, errors);
  renderPreview(previewContainer, cards, getConfig());
}

// File handling
function handleFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    textarea.value = reader.result as string;
    doUpdate();
  };
  reader.readAsText(file);
}

// Drag & drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer?.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) handleFile(file);
});

// Text input
textarea.addEventListener('input', scheduleUpdate);

// Config changes
gridRows.addEventListener('input', doUpdate);
gridCols.addEventListener('input', doUpdate);
paperSize.addEventListener('change', () => {
  const paper = getPaperPreset(paperSize.value);
  gridRows.value = String(paper.defaultRows);
  gridCols.value = String(paper.defaultCols);
  doUpdate();
});
fontSizeRange.addEventListener('input', () => {
  fontSizeLabel.textContent = `${fontSizeRange.value}px`;
  doUpdate();
});

// PDF generation
downloadBtn.addEventListener('click', async () => {
  const { cards, errors } = parseInput(textarea.value);
  if (cards.length === 0) {
    statusEl.textContent = 'No cards to export';
    return;
  }

  const config = getConfig();
  const grid = computeGrid(config, cards.length);

  downloadBtn.disabled = true;
  statusEl.textContent = `Rendering ${cards.length} cards…`;

  // Create renderer
  const paper = getPaperPreset(config.paperSize);
  const pxPerMm = 3.78; // ~96dpi
  const cardWidthPx = Math.round(grid.cardWidthMm * pxPerMm);
  const cardHeightPx = Math.round(grid.cardHeightMm * pxPerMm);

  renderer?.destroy();
  renderer = new CardRenderer({
    cardWidthPx,
    cardHeightPx,
    minFontSize: 6,
    maxFontSize: parseInt(fontSizeRange.value, 10),
  });

  const renderedCards = [];
  for (let i = 0; i < cards.length; i++) {
    statusEl.textContent = `Rendering card ${i + 1}/${cards.length}…`;
    const rendered = await renderer.renderCard(cards[i]);
    // Merge warnings
    cards[i].warnings.push(...rendered.frontWarnings, ...rendered.backWarnings);
    renderedCards.push(rendered);
    // Yield to UI
    await new Promise((r) => setTimeout(r, 0));
  }

  statusEl.textContent = 'Assembling PDF…';
  await new Promise((r) => setTimeout(r, 0));

  const pdfBytes = generatePdf({
    gridConfig: config,
    cards,
    renderedCards,
  });

  // Download
  const buf = new ArrayBuffer(pdfBytes.length);
  new Uint8Array(buf).set(pdfBytes);
  const blob = new Blob([buf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'flashcards.pdf';
  a.click();
  URL.revokeObjectURL(url);

  // Post-generation summary
  const allWarnings = cards.flatMap((c, i) =>
    c.warnings.map((w) => `Card ${i + 1}: ${w}`)
  );
  if (allWarnings.length > 0) {
    warnListEl.innerHTML = '';
    for (const w of allWarnings) {
      const li = document.createElement('li');
      li.className = 'warn-item';
      li.textContent = w;
      warnListEl.appendChild(li);
    }
  }

  statusEl.textContent = `Done — ${grid.totalPages} pages, ${grid.totalSheets} sheets`;
  downloadBtn.disabled = false;
});

// Initial render
doUpdate();

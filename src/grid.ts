export interface PaperSize {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  defaultRows: number;
  defaultCols: number;
}

export interface GridConfig {
  paperSize: string;
  rows: number;
  cols: number;
}

export interface GridDimensions {
  paperWidthMm: number;
  paperHeightMm: number;
  rows: number;
  cols: number;
  cardWidthMm: number;
  cardHeightMm: number;
  cardsPerPage: number;
  totalSheets: number;
  totalPages: number;
}

export const PAPER_PRESETS: PaperSize[] = [
  { id: 'a4', label: 'A4', widthMm: 210, heightMm: 297, defaultRows: 2, defaultCols: 5 },
  { id: 'letter', label: 'Letter', widthMm: 215.9, heightMm: 279.4, defaultRows: 2, defaultCols: 5 },
  { id: 'a5', label: 'A5', widthMm: 148, heightMm: 210, defaultRows: 2, defaultCols: 3 },
];

export function getPaperPreset(id: string): PaperSize {
  return PAPER_PRESETS.find(p => p.id === id) || PAPER_PRESETS[0];
}

export function computeGrid(config: GridConfig, totalCards: number): GridDimensions {
  const paper = getPaperPreset(config.paperSize);
  const rows = Math.max(1, config.rows);
  const cols = Math.max(1, config.cols);
  const cardsPerPage = rows * cols;
  const totalSheets = totalCards > 0 ? Math.ceil(totalCards / cardsPerPage) : 0;

  return {
    paperWidthMm: paper.widthMm,
    paperHeightMm: paper.heightMm,
    rows,
    cols,
    cardWidthMm: paper.widthMm / cols,
    cardHeightMm: paper.heightMm / rows,
    cardsPerPage,
    totalSheets,
    totalPages: totalSheets * 2,
  };
}

export function mmToPt(mm: number): number {
  return mm * 72 / 25.4;
}

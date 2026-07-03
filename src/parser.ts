export interface Card {
  front: string;
  back: string;
  frontRtl: boolean;
  backRtl: boolean;
  frontHasLatex: boolean;
  backHasLatex: boolean;
  frontHasImage: boolean;
  backHasImage: boolean;
  frontImageUrl: string | null;
  backImageUrl: string | null;
  warnings: string[];
}

export interface ParseResult {
  cards: Card[];
  errors: { line: number; text: string; reason: string }[];
  delimiter: 'pipe' | 'tab' | null;
}

const BLANK = /^\s*$/;

// Unicode ranges for RTL scripts
const RTL_RANGES = [
  /[\u0590-\u05FF]/, // Hebrew
  /[\u0600-\u06FF]/, // Arabic
  /[\u0750-\u077F]/, // Arabic Supplement
  /[\u08A0-\u08FF]/, // Arabic Extended-A
  /[\uFB1D-\uFB4F]/, // Hebrew and Yiddish
  /[\uFB50-\uFDFF]/, // Arabic Presentation Forms-A
  /[\uFE70-\uFEFF]/, // Arabic Presentation Forms-B
];

const LATEX_INLINE = /\$[^$]+\$/;
const LATEX_BLOCK = /\$\$[\s\S]+?\$\$/;
const IMAGE_MARKDOWN = /!\[.*?\]\((.+?)\)/;

function isRtl(text: string): boolean {
  let rtlCount = 0;
  let ltrCount = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code <= 0x20) continue; // skip whitespace/control
    let isRtlChar = false;
    for (const range of RTL_RANGES) {
      if (range.test(ch)) {
        isRtlChar = true;
        break;
      }
    }
    if (isRtlChar) rtlCount++;
    else if (code > 0x7F || /[a-zA-Z0-9]/.test(ch)) ltrCount++;
  }
  return rtlCount > ltrCount;
}

function extractImageUrl(text: string): string | null {
  const m = text.match(IMAGE_MARKDOWN);
  return m ? m[1] : null;
}

function hasLatex(text: string): boolean {
  return LATEX_BLOCK.test(text) || LATEX_INLINE.test(text);
}

function hasImage(text: string): boolean {
  return IMAGE_MARKDOWN.test(text);
}

function parseLine(line: string, warnings: string[]): Card | null {
  // Already trimmed and validated by caller
  const card: Card = {
    front: '',
    back: '',
    frontRtl: false,
    backRtl: false,
    frontHasLatex: false,
    backHasLatex: false,
    frontHasImage: false,
    backHasImage: false,
    frontImageUrl: null,
    backImageUrl: null,
    warnings,
  };

  card.frontRtl = isRtl(card.front);
  card.backRtl = isRtl(card.back);
  card.frontHasLatex = hasLatex(card.front);
  card.backHasLatex = hasLatex(card.back);
  card.frontHasImage = hasImage(card.front);
  card.backHasImage = hasImage(card.back);
  card.frontImageUrl = extractImageUrl(card.front);
  card.backImageUrl = extractImageUrl(card.back);

  return card;
}

export function parseInput(raw: string): ParseResult {
  const lines = raw.split(/\r?\n/);
  const cards: Card[] = [];
  const errors: ParseResult['errors'] = [];
  let delimiter: ParseResult['delimiter'] = null;

  // Auto-detect delimiter from first non-blank line
  for (const line of lines) {
    if (BLANK.test(line)) continue;
    if (line.includes('\t')) {
      delimiter = 'tab';
    } else if (line.includes('|')) {
      delimiter = 'pipe';
    }
    break;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (BLANK.test(line)) continue;

    let parts: string[];
    if (delimiter === 'tab') {
      parts = line.split('\t');
    } else if (delimiter === 'pipe') {
      const idx = line.indexOf('|');
      if (idx === -1) {
        errors.push({ line: i + 1, text: line, reason: 'No delimiter found' });
        continue;
      }
      parts = [line.slice(0, idx), line.slice(idx + 1)];
    } else {
      if (line.includes('\t')) {
        parts = line.split('\t');
        delimiter = 'tab';
      } else if (line.includes('|')) {
        const idx = line.indexOf('|');
        parts = [line.slice(0, idx), line.slice(idx + 1)];
        delimiter = 'pipe';
      } else {
        errors.push({ line: i + 1, text: line, reason: 'No delimiter found' });
        continue;
      }
    }

    if (parts.length < 2) {
      errors.push({ line: i + 1, text: line, reason: `Expected 2 columns, found ${parts.length}` });
      continue;
    }

    const front = parts[0].trim();
    const back = parts[1].trim();

    if (!front && !back) {
      errors.push({ line: i + 1, text: line, reason: 'Both columns empty' });
      continue;
    }

    const cardWarnings: string[] = [];
    const card: Card = {
      front,
      back,
      frontRtl: isRtl(front),
      backRtl: isRtl(back),
      frontHasLatex: hasLatex(front),
      backHasLatex: hasLatex(back),
      frontHasImage: hasImage(front),
      backHasImage: hasImage(back),
      frontImageUrl: extractImageUrl(front),
      backImageUrl: extractImageUrl(back),
      warnings: cardWarnings,
    };

    cards.push(card);
  }

  return { cards, errors, delimiter };
}

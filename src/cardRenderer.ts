import type { Card } from './parser';

const SCALE = 4;

export type TextAlign = 'normal' | 'center';

export interface RenderedCard {
  front: string;
  back: string;
  frontWarnings: string[];
  backWarnings: string[];
}

interface RenderOptions {
  cardWidthPx: number;
  cardHeightPx: number;
  minFontSize: number;
  maxFontSize: number;
  textAlign: TextAlign;
  autoFont: boolean;
}

function buildContentHtml(text: string): string {
  let html = escapeHtml(text);

  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => {
    try {
      return (window as any).katex.renderToString(decodeHtml(tex), {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return `<span class="katex-error">LaTeX error</span>`;
    }
  });

  html = html.replace(/\$([^$\n]+?)\$/g, (_m, tex: string) => {
    try {
      return (window as any).katex.renderToString(decodeHtml(tex), {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      return `<span class="katex-error">LaTeX error</span>`;
    }
  });

  html = html.replace(
    /!\[(.*?)\]\((.+?)\)/g,
    '<img src="$2" alt="$1" style="max-width:100%;max-height:100%;object-fit:contain;display:block;margin:0 auto;">'
  );

  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function decodeHtml(s: string): string {
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value;
}

/**
 * Create card face DOM. Landscape card (wide), text rotated -90° so it reads
 * in portrait orientation (bottom-to-top when card is horizontal).
 */
function createCardFace(
  outer: HTMLElement,
  text: string,
  rtl: boolean,
  fontSize: number,
  textAlign: TextAlign
): { images: HTMLImageElement[] } {
  outer.innerHTML = '';

  const cardW = outer.clientWidth;
  const cardH = outer.clientHeight;

  const inner = document.createElement('div');
  inner.className = 'card-rotated-inner';
  inner.style.width = `${cardW}px`;
  inner.style.height = `${cardH}px`;
  inner.style.fontSize = `${fontSize}px`;
  inner.style.lineHeight = '1.35';

  if (textAlign === 'center') {
    inner.style.display = 'flex';
    inner.style.alignItems = 'center';
    inner.style.justifyContent = 'center';
    inner.style.textAlign = 'center';
  }

  if (rtl) {
    inner.style.direction = 'rtl';
    if (textAlign !== 'center') inner.style.textAlign = 'right';
  } else {
    inner.style.direction = 'ltr';
    if (textAlign !== 'center') inner.style.textAlign = 'left';
  }

  const content = document.createElement('div');
  content.className = 'card-content';
  content.innerHTML = buildContentHtml(text);
  inner.appendChild(content);
  outer.appendChild(inner);

  const images: HTMLImageElement[] = [];
  outer.querySelectorAll('img').forEach((img) => {
    images.push(img as HTMLImageElement);
  });

  return { images };
}

function waitForImages(images: HTMLImageElement[]): Promise<void> {
  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
          } else {
            img.onload = () => resolve();
            img.onerror = () => {
              img.style.display = 'none';
              resolve();
            };
          }
        })
    )
  ).then(() => {});
}

function findFittingFontSize(
  outer: HTMLElement,
  text: string,
  rtl: boolean,
  minSize: number,
  maxSize: number,
  textAlign: TextAlign
): number {
  // Check if a given font size overflows the container
  function overflows(size: number): boolean {
    createCardFace(outer, text, rtl, size, textAlign);
    const inner = outer.querySelector('.card-rotated-inner') as HTMLElement;
    if (!inner) return false;
    // Temporarily remove overflow:hidden to measure true content height
    const prevOverflow = inner.style.overflow;
    inner.style.overflow = 'visible';
    const overflows = inner.scrollHeight > inner.clientHeight + 1 || inner.scrollWidth > inner.clientWidth + 1;
    inner.style.overflow = prevOverflow;
    return overflows;
  }

  // First check if max fits
  if (!overflows(maxSize)) return maxSize;

  // Linear shrink from max
  let size = maxSize;
  while (size > minSize) {
    size -= 0.5;
    if (!overflows(size)) return size;
  }

  return minSize;
}

const OFFSCREEN_STYLE = `
  position:fixed; left:-9999px; top:-9999px;
  pointer-events:none;
  background:#fff; color:#111;
  font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
  overflow:hidden;
  word-break:break-word;
  box-sizing:border-box;
`;

export class CardRenderer {
  private container: HTMLElement;
  private options: RenderOptions;

  constructor(options: RenderOptions) {
    this.container = document.createElement('div');
    this.container.style.cssText = OFFSCREEN_STYLE;
    this.container.style.width = `${options.cardWidthPx}px`;
    this.container.style.height = `${options.cardHeightPx}px`;
    document.body.appendChild(this.container);
    this.options = options;
  }

  destroy(): void {
    this.container.remove();
  }

  async renderCard(card: Card): Promise<RenderedCard> {
    const { cardWidthPx: w, cardHeightPx: h, minFontSize, maxFontSize, textAlign, autoFont } = this.options;
    const frontWarnings: string[] = [];
    const backWarnings: string[] = [];

    // --- Front ---
    const frontMax = autoFont ? maxFontSize : maxFontSize;
    const frontSize = findFittingFontSize(
      this.container, card.front, card.frontRtl, minFontSize, frontMax, textAlign
    );
    if (frontSize <= minFontSize && card.front) {
      createCardFace(this.container, card.front, card.frontRtl, frontSize, textAlign);
      const inner = this.container.querySelector('.card-rotated-inner') as HTMLElement;
      if (inner) {
        const prev = inner.style.overflow;
        inner.style.overflow = 'visible';
        const overflowed = inner.scrollHeight > inner.clientHeight + 1 || inner.scrollWidth > inner.clientWidth + 1;
        inner.style.overflow = prev;
        if (overflowed) frontWarnings.push('Front text may overflow at minimum font size');
      }
    }
    const frontImg = await this.renderFace(card.front, card.frontRtl, frontSize);

    // --- Back ---
    const backMax = autoFont ? maxFontSize : maxFontSize;
    const backSize = findFittingFontSize(
      this.container, card.back, card.backRtl, minFontSize, backMax, textAlign
    );
    if (backSize <= minFontSize && card.back) {
      createCardFace(this.container, card.back, card.backRtl, backSize, textAlign);
      const inner = this.container.querySelector('.card-rotated-inner') as HTMLElement;
      if (inner) {
        const prev = inner.style.overflow;
        inner.style.overflow = 'visible';
        const overflowed = inner.scrollHeight > inner.clientHeight + 1 || inner.scrollWidth > inner.clientWidth + 1;
        inner.style.overflow = prev;
        if (overflowed) backWarnings.push('Back text may overflow at minimum font size');
      }
    }
    const backImg = await this.renderFace(card.back, card.backRtl, backSize);

    return { front: frontImg, back: backImg, frontWarnings, backWarnings };
  }

  private async renderFace(text: string, rtl: boolean, fontSize: number): Promise<string> {
    createCardFace(this.container, text, rtl, fontSize, this.options.textAlign);
    const inner = this.container.querySelector('.card-rotated-inner') as HTMLElement;
    if (inner) await waitForImages(Array.from(inner.querySelectorAll('img')));

    // Wait for KaTeX @font-face fonts to finish loading before html2canvas captures
    await document.fonts.ready;

    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(this.container, {
      scale: SCALE,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: this.options.cardWidthPx,
      height: this.options.cardHeightPx,
    });

    return canvas.toDataURL('image/png');
  }
}

/** Preview renderer. When maxFontSize is provided, uses findFittingFontSize
 *  on the already-attached container to auto-size per card. */
export function renderPreviewFace(
  container: HTMLElement,
  text: string,
  rtl: boolean,
  textAlign: TextAlign,
  maxFontSize: number | null
): void {
  container.innerHTML = '';

  const cardW = container.clientWidth;
  const cardH = container.clientHeight;

  // Auto-size: find largest font that fits, or use a sensible default
  let fontSize: number;
  if (maxFontSize !== null) {
    fontSize = findFittingFontSize(container, text, rtl, 6, maxFontSize, textAlign);
  } else {
    fontSize = Math.min(cardW, cardH) * 0.12;
  }

  createCardFace(container, text, rtl, fontSize, textAlign);
}

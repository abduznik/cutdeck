import type { Card } from './parser';

const SCALE = 4;

export interface RenderedCard {
  front: string; // data URL
  back: string;  // data URL
  frontWarnings: string[];
  backWarnings: string[];
}

interface RenderOptions {
  cardWidthPx: number;
  cardHeightPx: number;
  minFontSize: number;
  maxFontSize: number;
}

function buildContentHtml(text: string): string {
  let html = escapeHtml(text);

  // Block LaTeX: $$...$$
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

  // Inline LaTeX: $...$
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

  // Images: ![alt](url)
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

function createCardFace(
  container: HTMLElement,
  text: string,
  rtl: boolean,
  fontSize: number
): { images: HTMLImageElement[] } {
  container.innerHTML = '';
  container.style.fontSize = `${fontSize}px`;
  container.style.lineHeight = '1.35';
  if (rtl) {
    container.style.direction = 'rtl';
    container.style.textAlign = 'right';
  } else {
    container.style.direction = 'ltr';
    container.style.textAlign = 'left';
  }

  const content = document.createElement('div');
  content.className = 'card-content';
  content.innerHTML = buildContentHtml(text);
  container.appendChild(content);

  const images: HTMLImageElement[] = [];
  container.querySelectorAll('img').forEach((img) => {
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
  container: HTMLElement,
  text: string,
  rtl: boolean,
  width: number,
  height: number,
  minSize: number,
  maxSize: number
): number {
  let size = maxSize;
  const step = 0.5;

  while (size >= minSize) {
    const { images } = createCardFace(container, text, rtl, size);
    // Synchronous check — images may not be loaded yet but we measure layout
    const overflows =
      container.scrollHeight > container.clientHeight + 1 ||
      container.scrollWidth > container.clientWidth + 1;

    if (!overflows) return size;
    size -= step;
  }

  return minSize;
}

const OFFSCREEN_STYLE = `
  position:fixed; left:-9999px; top:-9999px;
  visibility:hidden; pointer-events:none;
  background:#fff; color:#111;
  font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
  overflow:hidden;
  word-break:break-word;
  padding:4px;
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
    const { cardWidthPx: w, cardHeightPx: h, minFontSize, maxFontSize } = this.options;
    const frontWarnings: string[] = [];
    const backWarnings: string[] = [];

    // --- Front ---
    const frontSize = findFittingFontSize(
      this.container, card.front, card.frontRtl, w, h, minFontSize, maxFontSize
    );
    if (frontSize <= minFontSize && card.front) {
      const { images } = createCardFace(this.container, card.front, card.frontRtl, frontSize);
      const overflows =
        this.container.scrollHeight > this.container.clientHeight + 1 ||
        this.container.scrollWidth > this.container.clientWidth + 1;
      if (overflows) {
        frontWarnings.push('Front text may overflow at minimum font size');
      }
    }
    const frontImg = await this.renderFace(card.front, card.frontRtl, frontSize);

    // --- Back ---
    const backSize = findFittingFontSize(
      this.container, card.back, card.backRtl, w, h, minFontSize, maxFontSize
    );
    if (backSize <= minFontSize && card.back) {
      const { images } = createCardFace(this.container, card.back, card.backRtl, backSize);
      const overflows =
        this.container.scrollHeight > this.container.clientHeight + 1 ||
        this.container.scrollWidth > this.container.clientWidth + 1;
      if (overflows) {
        backWarnings.push('Back text may overflow at minimum font size');
      }
    }
    const backImg = await this.renderFace(card.back, card.backRtl, backSize);

    return {
      front: frontImg,
      back: backImg,
      frontWarnings,
      backWarnings,
    };
  }

  private async renderFace(text: string, rtl: boolean, fontSize: number): Promise<string> {
    const { images } = createCardFace(this.container, text, rtl, fontSize);
    await waitForImages(images);

    // Use html2canvas
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

// Lightweight preview renderer (no canvas, just DOM)
export function renderPreviewFace(
  container: HTMLElement,
  text: string,
  rtl: boolean
): void {
  container.innerHTML = '';
  if (rtl) {
    container.style.direction = 'rtl';
    container.style.textAlign = 'right';
  } else {
    container.style.direction = 'ltr';
    container.style.textAlign = 'left';
  }

  const content = document.createElement('div');
  content.className = 'card-content';
  content.innerHTML = buildContentHtml(text);
  container.appendChild(content);
}

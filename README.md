# cutdeck

Flashcard-to-print-PDF generator. Paste flashcards or drop a file, get a print-ready double-sided PDF to cut into individual cards.

## How it works

- **Page 1** of each sheet: card fronts (terms) in the configured grid.
- **Page 2** of each sheet: card backs (definitions), mirrored horizontally per row so that when printed double-sided (flip on long edge) and cut, each front lines up with its correct back.
- Dashed hairline cut guides are drawn between cards.

## Input format

One card per line. Delimiter is auto-detected:

```
term | definition
term | definition
```

Tab-separated works too — paste directly from spreadsheets or Anki TSV export without reformatting. Blank lines are ignored. Lines without a valid delimiter are flagged inline with line number and content.

**File upload:** Accepts `.txt`, `.csv`, `.tsv` via file picker or drag-and-drop. Same parsing as textarea input.

### Content per field (front or back)

**Plain text** — just type.

**LaTeX/KaTeX:**
- Inline: `$E = mc^2$`
- Block: `$$\int_0^\infty e^{-x} dx = 1$$`

**Images:**
```
![alt text](https://example.com/image.png)
```
Scaled to fit the cell without overflowing, preserving aspect ratio.

**RTL (Hebrew/Arabic):** Auto-detected per field via Unicode range analysis. Mixed-direction content (e.g. Hebrew term with an inline LaTeX formula or English acronym) renders correctly per-field — the bidi algorithm is applied to each field independently, not to the whole card.

## Paper sizes and grid

Each paper size has its own default grid (rows × columns):

| Paper  | Default grid | Cards/sheet | Cut lines            |
|--------|-------------|-------------|----------------------|
| A4     | 2 × 5       | 10          | 1 vertical, 4 horizontal |
| Letter | 2 × 5       | 10          | 1 vertical, 4 horizontal |
| A5     | 2 × 3       | 6           | 1 vertical, 2 horizontal |

Rows and columns are user-overridable. Card cell dimensions adjust automatically.

### Adding a new paper size

In `src/grid.ts`, add an entry to `PAPER_PRESETS`:

```ts
{ id: 'b5', label: 'B5', widthMm: 176, heightMm: 250, defaultRows: 2, defaultCols: 4 }
```

Then add a corresponding `<option>` in the paper size `<select>` in `index.html`.

## Auto-sizing

Font size auto-shrinks per card to fit its cell at the current grid density. The "Max font" slider sets the upper bound. If content still doesn't fit at the minimum readable size (6px), a warning is shown per-card rather than shrinking further.

## Overflow / pagination

When cards exceed one sheet's capacity, the PDF auto-paginates across multiple front/back page pairs. A warning is shown before generation: e.g. "42 cards exceeds 10 per sheet — will generate 84 PDF pages." Front/back pairing and mirroring are maintained correctly across every sheet.

## Rasterization tradeoff

Card content is rendered via `html2canvas` at 4× scale and embedded as PNG images in the PDF. This is a deliberate raster-not-vector tradeoff: KaTeX, inline images, and RTL bidi text all require real browser layout to render correctly together. Vector text would require manual typesetting of every glyph, which is not feasible for mixed content with math and images. The 4× scale ensures print-quality resolution (≈384 DPI at 96 base DPI).

## Summary display

Before and after generation, the UI shows:
- Total cards parsed
- Cards per sheet
- Total physical sheets required
- Total PDF pages (explicitly noted as 2× sheet count)
- Per-card warnings (font too small, failed LaTeX parse, missing image)

## Local dev

```sh
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## Build

```sh
npm run build
```

Output goes to `dist/`. Static files only — no server needed.

## Deploy to GitHub Pages

1. Push to a GitHub repo.
2. In Settings → Pages, set source to "GitHub Actions".
3. Add a workflow (`.github/workflows/deploy.yml`):

```yaml
name: Deploy
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Or serve `dist/` from any static host.

## Stack

- TypeScript + Vite
- jsPDF for PDF assembly
- KaTeX for LaTeX rendering
- html2canvas for card rasterization
- No framework, no backend, no analytics

import { type ChartImageFormat, downloadChartAs, estimateTextWidth } from '@/lib/chartExport';
import {
  type ConfusionCount,
  type OrderedScale,
  scaleDistance,
} from '@/features/views/common/columnComparisonModel';

/** How an empty code is shown, on screen and in the image. */
export const displayLabel = (value: string): string => (value === '' ? '(blank)' : value);

/** Agreement on the diagonal, in light green, for every matrix (Chao, 16 Nov 2026). */
export const AGREEMENT_SHADE = 'color-mix(in srgb, var(--color-chart-3) 28%, transparent)';

/** The darkest disagreement: the two ends of a scale, or a code outside it. */
export const FAR_APART_SHADE = 'color-mix(in srgb, var(--color-chart-4) 60%, transparent)';

/** The key's line for the orange shading on a scale. */
export const SCALE_KEY_TEXT =
  'Orange: how far apart the two codes are on the scale. Darkest: the two ends, or a code outside the scale.';

/**
 * A cell's shade: light green where the two codes agree; on a scale, a
 * disagreement in orange by how far apart its two codes are; otherwise none.
 */
export const cellShade = (
  scale: OrderedScale | null,
  reference: string,
  comparison: string,
): string | null => {
  if (reference === comparison) return AGREEMENT_SHADE;
  const distance = scale ? scaleDistance(scale, reference, comparison) : null;
  if (!distance) return null;
  return `color-mix(in srgb, var(--color-chart-4) ${String(Math.round(12 + 48 * distance))}%, transparent)`;
};

/** Whole counts as they are; the shares of a multi-coder coincidence matrix to one decimal. */
export const formatCount = (count: number): string =>
  Number.isInteger(count) ? String(count) : count.toFixed(1);

/** The codes of a matrix, in scale order on a scale (codes outside it last), else alphabetical. */
export const matrixCodes = (rows: readonly ConfusionCount[], scale: OrderedScale | null) => {
  const scalePosition = new Map(
    [...(scale?.levels ?? []), ...(scale?.outside ?? [])].map(
      (label, index) => [label, index] as const,
    ),
  );
  return Array.from(new Set(rows.flatMap((row) => [row.reference, row.comparison]))).toSorted(
    (a, b) =>
      (scalePosition.get(a) ?? Infinity) - (scalePosition.get(b) ?? Infinity) || a.localeCompare(b),
  );
};

/** Looks up the count for a pair of codes, 0 when no text got that pair. */
export const matrixCount = (rows: readonly ConfusionCount[]) => {
  const countByPair = new Map(
    rows.map((row) => [JSON.stringify([row.reference, row.comparison]), row.count]),
  );
  return (reference: string, comparison: string): number =>
    countByPair.get(JSON.stringify([reference, comparison])) ?? 0;
};

/** What the image shows: the same text and matrix as the popup. */
export interface AgreementMatrixImage {
  /** The score, first and in bold, such as "Cohen’s Kappa, a versus b: κ 0.712". */
  title: string;
  /** A grey line under the title, such as the Data Block's name. */
  subtitle?: string;
  /** The popup's description: the method, then any codebook notes. */
  paragraphs: readonly string[];
  /** A line just above the matrix, such as what a coincidence matrix counts. */
  caption?: string;
  rows: readonly ConfusionCount[];
  scale: OrderedScale | null;
  rowAxis: string;
  columnAxis: string;
  agreementKey: string;
}

const FONT = 'system-ui,-apple-system,sans-serif';
const PAD = 16;
const TITLE_FONT = 14;
const TITLE_LINE = 20;
const BODY_FONT = 12;
const BODY_LINE = 17;
const BLOCK_GAP = 8;
const CELL_FONT = 12;
const CELL_H = 24;
const CELL_GAP = 4;
const CELL_PAD = 10;
const MIN_CELL_W = 36;
const AXIS_W = 22;
const AXIS_H = 22;
const KEY_SWATCH_W = 16;
const KEY_GRADIENT_W = 32;
const KEY_SWATCH_H = 10;
const KEY_TEXT_GAP = 6;
/** The title wraps past this width only when the matrix is wider. */
const TITLE_WRAP_W = 560;
/** Like the popup's text (24rem), the description wraps here unless the matrix is wider. */
const BODY_WRAP_W = 400;
/** Bold glyphs run a little wider than the estimate for regular ones. */
const BOLD = 1.08;
/** Room for a viewer that draws the SVG in a slightly wider font than the browser measured. */
const FONT_SLACK = 1.04;

const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let measureContext: OffscreenCanvasRenderingContext2D | null | undefined;

/**
 * A text's width in the image's font. The browser measures it where it can,
 * so the image is as wide as its text (Chao, 19 Nov 2026: the estimate ran
 * about a fifth too wide and left white space on the right); without a
 * canvas, as in tests, the estimate stands in.
 */
const measure = (text: string, font: number, weight = 400): number => {
  if (measureContext === undefined) {
    measureContext =
      typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(1, 1).getContext('2d');
  }
  if (!measureContext) return estimateTextWidth(text, font) * (weight >= 600 ? BOLD : 1);
  measureContext.font = `${String(weight)} ${String(font)}px ${FONT}`;
  return measureContext.measureText(text).width * FONT_SLACK;
};

/** Breaks a text into lines no wider than `width`, word by word; a long word keeps its own line. */
const wrap = (text: string, font: number, width: number, weight = 400): string[] => {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next, font, weight) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const textLine = (
  text: string,
  x: number,
  y: number,
  font: number,
  fill: string,
  extra = '',
): string =>
  `<text x="${String(x)}" y="${String(y)}" font-family="${FONT}" font-size="${String(font)}" fill="${fill}"${extra}>${esc(text)}</text>`;

interface TextBlock {
  lines: string[];
  font: number;
  weight: number;
  lineHeight: number;
  fill: string;
  /** Space above the block. */
  gap: number;
}

/**
 * Draws the popup of an intercoder reliability score as an SVG: the score,
 * its description, the matrix with its axes and shading, and the key
 * (Chao, 19 Nov 2026). Drawn from the data rather than copied from the
 * screen, so it reads the same in any theme and at any window size. The
 * image is as wide as its widest line or the matrix, whichever is wider.
 */
/** Called by: `downloadAgreementMatrixImage`, and its tests. */
export const buildAgreementMatrixSvg = (image: AgreementMatrixImage): string => {
  const codes = matrixCodes(image.rows, image.scale);
  const count = matrixCount(image.rows);
  const rowLabelW =
    Math.max(0, ...codes.map((code) => measure(displayLabel(code), CELL_FONT, 600))) + CELL_PAD;
  const columnW = codes.map((columnCode) =>
    Math.max(
      MIN_CELL_W,
      measure(displayLabel(columnCode), CELL_FONT, 600) + CELL_PAD,
      ...codes.map(
        (rowCode) => measure(formatCount(count(rowCode, columnCode)), CELL_FONT, 500) + CELL_PAD,
      ),
    ),
  );
  const cellsW = rowLabelW + columnW.reduce((total, width) => total + width + CELL_GAP, 0);
  const columnAxisText = `${image.columnAxis} →`;
  const columnAxisW = measure(columnAxisText, CELL_FONT, 500);
  // A column name wider than the cells widens the table, so it stays over them.
  const tableW = Math.max(cellsW, columnAxisW);
  const tableSpan = AXIS_W + tableW;

  // Text first, wrapped, so the image can be as wide as what it holds.
  const bodyWrapW = Math.max(tableSpan, BODY_WRAP_W);
  const blocks: TextBlock[] = [
    {
      lines: wrap(image.title, TITLE_FONT, Math.max(tableSpan, TITLE_WRAP_W), 600),
      font: TITLE_FONT,
      weight: 600,
      lineHeight: TITLE_LINE,
      fill: '#111827',
      gap: 0,
    },
  ];
  const bodyBlock = (text: string, fill: string, gap: number): TextBlock => ({
    lines: wrap(text, BODY_FONT, bodyWrapW),
    font: BODY_FONT,
    weight: 400,
    lineHeight: BODY_LINE,
    fill,
    gap,
  });
  if (image.subtitle) blocks.push(bodyBlock(image.subtitle, '#6b7280', 0));
  for (const paragraph of image.paragraphs) blocks.push(bodyBlock(paragraph, '#374151', BLOCK_GAP));
  if (image.caption) blocks.push(bodyBlock(image.caption, '#6b7280', BLOCK_GAP));

  const keyRows: { swatch: string; swatchW: number; lines: string[] }[] = [];
  const keyRow = (swatch: string, swatchW: number, text: string) => {
    keyRows.push({
      swatch,
      swatchW,
      lines: wrap(text, BODY_FONT, bodyWrapW - AXIS_W - swatchW - KEY_TEXT_GAP),
    });
  };
  keyRow(
    `<rect width="${String(KEY_SWATCH_W)}" height="${String(KEY_SWATCH_H)}" rx="2" fill="${AGREEMENT_SHADE}"/>`,
    KEY_SWATCH_W,
    image.agreementKey,
  );
  const defs: string[] = [];
  if (image.scale) {
    // Fading from transparent orange, not from "transparent" (black), keeps the fade free of grey.
    defs.push(
      `<linearGradient id="far-apart"><stop offset="0" stop-color="${FAR_APART_SHADE}" stop-opacity="0"/><stop offset="1" stop-color="${FAR_APART_SHADE}"/></linearGradient>`,
    );
    keyRow(
      `<rect width="${String(KEY_GRADIENT_W)}" height="${String(KEY_SWATCH_H)}" rx="2" fill="url(#far-apart)"/>`,
      KEY_GRADIENT_W,
      SCALE_KEY_TEXT,
    );
  }

  const contentW = Math.max(
    tableSpan,
    ...blocks.flatMap((block) =>
      block.lines.map((line) => measure(line, block.font, block.weight)),
    ),
    ...keyRows.flatMap((row) =>
      row.lines.map((line) => AXIS_W + row.swatchW + KEY_TEXT_GAP + measure(line, BODY_FONT)),
    ),
  );
  const width = Math.ceil(contentW + 2 * PAD);

  const parts: string[] = [];
  let y = PAD;
  for (const block of blocks) {
    y += block.gap;
    for (const line of block.lines) {
      y += block.lineHeight;
      parts.push(
        textLine(
          line,
          PAD,
          y - (block.lineHeight - block.font) / 2 - 2,
          block.font,
          block.fill,
          block.weight === 400 ? '' : ` font-weight="${String(block.weight)}"`,
        ),
      );
    }
  }

  // The column axis: its name and an arrow, centred over the table, ruled below.
  y += BLOCK_GAP;
  const tableX = PAD + AXIS_W;
  parts.push(
    textLine(
      columnAxisText,
      tableX + tableW / 2,
      y + AXIS_H - 7,
      CELL_FONT,
      '#111827',
      ' font-weight="500" text-anchor="middle"',
    ),
  );
  y += AXIS_H;
  parts.push(
    `<line x1="${String(tableX)}" y1="${String(y)}" x2="${String(tableX + tableW)}" y2="${String(y)}" stroke="#d1d5db" stroke-width="1"/>`,
  );
  y += CELL_GAP;

  // A row name longer than the rows are tall gets room above and below them.
  const rowAxisText = `← ${image.rowAxis}`;
  const gridH = (codes.length + 1) * (CELL_H + CELL_GAP) - CELL_GAP;
  const rowAxisRoom = Math.max(0, measure(rowAxisText, CELL_FONT, 500) + 8 - gridH);
  const gridTop = y;
  y += rowAxisRoom / 2;

  // The header row of codes.
  const columnX: number[] = [];
  let x = tableX + rowLabelW;
  for (const [index, code] of codes.entries()) {
    const cellW = columnW[index] ?? MIN_CELL_W;
    columnX.push(x);
    parts.push(
      textLine(
        displayLabel(code),
        x + cellW / 2,
        y + CELL_H - 7,
        CELL_FONT,
        '#4b5563',
        ' font-weight="600" text-anchor="middle"',
      ),
    );
    x += cellW + CELL_GAP;
  }
  y += CELL_H + CELL_GAP;

  // One row per code: its label, then a shaded cell per column.
  for (const rowCode of codes) {
    parts.push(
      textLine(
        displayLabel(rowCode),
        tableX + rowLabelW - CELL_PAD / 2,
        y + CELL_H - 7,
        CELL_FONT,
        '#4b5563',
        ' font-weight="600" text-anchor="end"',
      ),
    );
    for (const [index, columnCode] of codes.entries()) {
      const cellX = columnX[index] ?? 0;
      const cellW = columnW[index] ?? MIN_CELL_W;
      const shade = cellShade(image.scale, rowCode, columnCode);
      if (shade) {
        parts.push(
          `<rect x="${String(cellX)}" y="${String(y)}" width="${String(cellW)}" height="${String(CELL_H)}" rx="3" fill="${shade}"/>`,
        );
      }
      parts.push(
        textLine(
          formatCount(count(rowCode, columnCode)),
          cellX + cellW / 2,
          y + CELL_H - 7,
          CELL_FONT,
          '#111827',
          ' font-weight="500" text-anchor="middle"',
        ),
      );
    }
    y += CELL_H + CELL_GAP;
  }
  y += rowAxisRoom / 2;

  // The row axis: its name and an arrow, read upward beside the grid, ruled on its right.
  const gridBottom = y - CELL_GAP;
  const axisX = PAD + AXIS_W / 2;
  const axisY = (gridTop + gridBottom) / 2;
  parts.push(
    `<text x="${String(axisX)}" y="${String(axisY)}" transform="rotate(-90 ${String(axisX)} ${String(axisY)})" dominant-baseline="central" font-family="${FONT}" font-size="${String(CELL_FONT)}" font-weight="500" text-anchor="middle" fill="#111827">${esc(rowAxisText)}</text>`,
    `<line x1="${String(PAD + AXIS_W - 2)}" y1="${String(gridTop)}" x2="${String(PAD + AXIS_W - 2)}" y2="${String(gridBottom)}" stroke="#d1d5db" stroke-width="1"/>`,
  );

  // The key below the table.
  y += BLOCK_GAP;
  for (const row of keyRows) {
    const keyTextX = tableX + row.swatchW + KEY_TEXT_GAP;
    parts.push(
      `<g transform="translate(${String(tableX)},${String(y + (BODY_LINE - KEY_SWATCH_H) / 2)})">${row.swatch}</g>`,
    );
    for (const line of row.lines) {
      y += BODY_LINE;
      parts.push(textLine(line, keyTextX, y - 4, BODY_FONT, '#374151'));
    }
  }
  const height = Math.ceil(y + PAD);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}">`,
    defs.length ? `<defs>${defs.join('')}</defs>` : '',
    `<rect width="${String(width)}" height="${String(height)}" fill="#ffffff"/>`,
    ...parts,
    '</svg>',
  ].join('\n');
};

/**
 * Saves the matrix image as SVG, PNG or JPEG through the chart download path,
 * which turns the theme colours into plain ones for the white background.
 * Called by: `AgreementMatrixDownloadDialog`.
 */
export const downloadAgreementMatrixImage = async (
  image: AgreementMatrixImage,
  options: { fileStem: string; fileSuffix: string; format: ChartImageFormat },
): Promise<void> => {
  const svg = new DOMParser().parseFromString(buildAgreementMatrixSvg(image), 'image/svg+xml')
    .documentElement as unknown as SVGSVGElement;
  await downloadChartAs(svg, {
    nodeName: options.fileStem,
    toolSuffix: options.fileSuffix,
    format: options.format,
    // The image is drawn at its own size; scale 2 keeps PNG and JPEG sharp.
    scale: 2,
  });
};

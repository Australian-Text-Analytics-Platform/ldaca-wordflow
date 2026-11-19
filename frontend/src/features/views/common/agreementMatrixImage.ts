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
const MIN_TEXT_W = 480;
/** Bold glyphs run a little wider than the estimate for regular ones. */
const BOLD = 1.08;

const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Breaks a text into lines no wider than `width`, word by word; a long word keeps its own line. */
const wrap = (text: string, font: number, width: number): string[] => {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && estimateTextWidth(next, font) > width) {
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

/**
 * Draws the popup of an intercoder reliability score as an SVG: the score,
 * its description, the matrix with its axes and shading, and the key
 * (Chao, 19 Nov 2026). Drawn from the data rather than copied from the
 * screen, so it reads the same in any theme and at any window size.
 */
/** Called by: `downloadAgreementMatrixImage`, and its tests. */
export const buildAgreementMatrixSvg = (image: AgreementMatrixImage): string => {
  const codes = matrixCodes(image.rows, image.scale);
  const count = matrixCount(image.rows);
  const rowLabelW =
    Math.max(0, ...codes.map((code) => estimateTextWidth(displayLabel(code), CELL_FONT) * BOLD)) +
    CELL_PAD;
  const columnW = codes.map((columnCode) =>
    Math.max(
      MIN_CELL_W,
      estimateTextWidth(displayLabel(columnCode), CELL_FONT) * BOLD + CELL_PAD,
      ...codes.map(
        (rowCode) =>
          estimateTextWidth(formatCount(count(rowCode, columnCode)), CELL_FONT) + CELL_PAD,
      ),
    ),
  );
  const tableW = rowLabelW + columnW.reduce((total, width) => total + width + CELL_GAP, 0);
  const textW = Math.max(MIN_TEXT_W, AXIS_W + tableW);
  const width = Math.ceil(textW + 2 * PAD);

  const parts: string[] = [];
  let y = PAD;

  for (const line of wrap(image.title, TITLE_FONT * BOLD, textW)) {
    y += TITLE_LINE;
    parts.push(textLine(line, PAD, y - 5, TITLE_FONT, '#111827', ' font-weight="600"'));
  }
  if (image.subtitle) {
    for (const line of wrap(image.subtitle, BODY_FONT, textW)) {
      y += BODY_LINE;
      parts.push(textLine(line, PAD, y - 4, BODY_FONT, '#6b7280'));
    }
  }
  for (const paragraph of image.paragraphs) {
    y += BLOCK_GAP;
    for (const line of wrap(paragraph, BODY_FONT, textW)) {
      y += BODY_LINE;
      parts.push(textLine(line, PAD, y - 4, BODY_FONT, '#374151'));
    }
  }
  if (image.caption) {
    y += BLOCK_GAP;
    for (const line of wrap(image.caption, BODY_FONT, textW)) {
      y += BODY_LINE;
      parts.push(textLine(line, PAD, y - 4, BODY_FONT, '#6b7280'));
    }
  }

  // The column axis: its name and an arrow, centred over the table, ruled below.
  y += BLOCK_GAP;
  const tableX = PAD + AXIS_W;
  parts.push(
    textLine(
      `${image.columnAxis} →`,
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
  const tableTop = y;
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

  // The row axis: its name and an arrow, read upward beside the rows, ruled on its right.
  const tableBottom = y - CELL_GAP;
  const axisX = PAD + AXIS_W / 2;
  const axisY = (tableTop + tableBottom) / 2;
  parts.push(
    `<text x="${String(axisX)}" y="${String(axisY)}" transform="rotate(-90 ${String(axisX)} ${String(axisY)})" dominant-baseline="central" font-family="${FONT}" font-size="${String(CELL_FONT)}" font-weight="500" text-anchor="middle" fill="#111827">${esc(`← ${image.rowAxis}`)}</text>`,
    `<line x1="${String(PAD + AXIS_W - 2)}" y1="${String(tableTop - CELL_H - CELL_GAP)}" x2="${String(PAD + AXIS_W - 2)}" y2="${String(tableBottom)}" stroke="#d1d5db" stroke-width="1"/>`,
  );

  // The key below the table.
  const keyRows: { swatch: string; swatchW: number; text: string }[] = [
    {
      swatch: `<rect width="${String(KEY_SWATCH_W)}" height="${String(KEY_SWATCH_H)}" rx="2" fill="${AGREEMENT_SHADE}"/>`,
      swatchW: KEY_SWATCH_W,
      text: image.agreementKey,
    },
  ];
  const defs: string[] = [];
  if (image.scale) {
    // Fading from transparent orange, not from "transparent" (black), keeps the fade free of grey.
    defs.push(
      `<linearGradient id="far-apart"><stop offset="0" stop-color="${FAR_APART_SHADE}" stop-opacity="0"/><stop offset="1" stop-color="${FAR_APART_SHADE}"/></linearGradient>`,
    );
    keyRows.push({
      swatch: `<rect width="${String(KEY_GRADIENT_W)}" height="${String(KEY_SWATCH_H)}" rx="2" fill="url(#far-apart)"/>`,
      swatchW: KEY_GRADIENT_W,
      text: SCALE_KEY_TEXT,
    });
  }
  y += BLOCK_GAP;
  for (const row of keyRows) {
    const keyTextX = tableX + row.swatchW + KEY_TEXT_GAP;
    const lines = wrap(row.text, BODY_FONT, PAD + textW - keyTextX);
    parts.push(
      `<g transform="translate(${String(tableX)},${String(y + (BODY_LINE - KEY_SWATCH_H) / 2)})">${row.swatch}</g>`,
    );
    for (const line of lines) {
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

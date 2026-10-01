/**
 * Shared identity colours for Data Blocks, input cards and analysis charts.
 * Graph and list surfaces derive theme-aware fills from these source colours;
 * saturated surfaces use foregroundForVizColor for readable text.
 */
/** Neutral grey — the default for new/un-analysed blocks. */
export const GREY = '#6b7280';

export const VIZ_PALETTE: string[] = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#9333ea',
  '#d97706',
  '#0d9488',
  '#db2777',
  '#4f46e5',
  '#65a30d',
  '#0891b2',
  '#92400e',
  GREY,
];

/** Dark foreground candidate for saturated Data Block identity surfaces. */
const VIZ_TINT_FOREGROUND = '#111827';

/** Light foreground candidate for saturated Data Block identity surfaces. */
const VIZ_LIGHT_FOREGROUND = '#ffffff';

/** WCAG relative luminance of an ``#rrggbb`` colour. */
function relativeLuminance(hex: string): number {
  const linearChannel = (offset: number): number => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearChannel(1) + 0.7152 * linearChannel(3) + 0.0722 * linearChannel(5);
}

/** Contrast ratio between two valid ``#rrggbb`` colours. */
function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Chooses the higher-contrast foreground for a saturated Data Block colour.
 * Callers provide a normalized ``#rrggbb`` colour.
 */
export function foregroundForVizColor(background: string): string {
  return contrastRatio(VIZ_LIGHT_FOREGROUND, background) >
    contrastRatio(VIZ_TINT_FOREGROUND, background)
    ? VIZ_LIGHT_FOREGROUND
    : VIZ_TINT_FOREGROUND;
}

/**
 * Interpolates between two hex colours for topic bubble intensity scales.
 * Used by: topicModelingGraph to blend two corpus colours for each bubble.
 * Flow: parse both hex colors into RGB triples, linearly interpolate each channel by t, then return an rgb() string.
 */
export function interpolateVizColor(colorA: string, colorB: string, t: number): string {
  // Called twice by interpolateVizColor to parse the two endpoint colours into RGB channels.
  const parse = (color: string): [number, number, number] => {
    const parts = color
      .replace('#', '')
      .match(/.{2}/g)
      ?.map((value) => parseInt(value, 16)) ?? [0, 0, 0];
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  };

  const [r1, g1, b1] = parse(colorA);
  const [r2, g2, b2] = parse(colorB);

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

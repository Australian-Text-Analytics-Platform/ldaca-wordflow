export type ChartExportFormat = 'svg' | 'png' | 'jpeg';
export const CHART_FORMATS = [
  { value: 'png', label: 'PNG' },
  { value: 'svg', label: 'SVG' },
  { value: 'jpeg', label: 'JPEG' },
] satisfies { value: ChartExportFormat; label: string }[];

/** Capture the displayed chart before any asynchronous image preparation. */
export async function buildChartExport(
  svg: SVGSVGElement,
  format: ChartExportFormat,
): Promise<Blob> {
  const viewBox = svg
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const width =
    [Number(svg.getAttribute('width')), svg.clientWidth, viewBox?.[2] ?? 0].find(
      (value) => Number.isFinite(value) && value > 0,
    ) ?? 400;
  const height =
    [Number(svg.getAttribute('height')), svg.clientHeight, viewBox?.[3] ?? 0].find(
      (value) => Number.isFinite(value) && value > 0,
    ) ?? 200;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const background = getComputedStyle(document.documentElement)
    .getPropertyValue('--vscode-surface-background')
    .trim();
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.style.backgroundColor = background;
  const snapshot = new Blob([new XMLSerializer().serializeToString(clone)], {
    type: 'image/svg+xml;charset=utf-8',
  });
  if (format === 'svg') return snapshot;

  const url = URL.createObjectURL(snapshot);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => {
        resolve();
      };
      image.onerror = () => {
        reject(new Error('Could not prepare the chart image.'));
      };
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * 3));
    canvas.height = Math.max(1, Math.round(height * 3));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas rendering is unavailable.');
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Could not export the chart image.'));
        },
        format === 'jpeg' ? 'image/jpeg' : 'image/png',
        format === 'jpeg' ? 0.92 : undefined,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

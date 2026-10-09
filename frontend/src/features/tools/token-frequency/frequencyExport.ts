import { wrapFigureText } from '../common/figureText';
import type { ChartExportFormat } from '../common/chartExport';
type FrequencyExportFormat = 'csv' | 'markdown';
export type DownloadFormat = ChartExportFormat | FrequencyExportFormat;

export async function buildFrequencyBundle(
  blob: Blob,
  filename: string,
  stopwords: string[],
): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const name = filename.replace(/[\\/]/g, '_');
  zip.file(name, await blob.arrayBuffer());
  zip.file(`${name.replace(/\.[^.]+$/, '')}-stopwords.txt`, stopwords.join('\n'));
  return zip.generateAsync({ type: 'blob' });
}

/** Freeze the same descriptive legend into direct images and their ZIP copies. */
export function frequencyFigure(
  svg: SVGSVGElement,
  title: string,
  sources: { label: string; color: string }[],
  blend: boolean,
): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const box = clone.getAttribute('viewBox')?.split(/\s+/).map(Number);
  const width = Number(clone.getAttribute('width')) || box?.[2] || 600;
  const height = Number(clone.getAttribute('height')) || box?.[3] || 400;
  const namespace = 'http://www.w3.org/2000/svg';
  const foreground =
    getComputedStyle(document.documentElement).getPropertyValue('--vscode-foreground').trim() ||
    getComputedStyle(document.documentElement).color;
  const labels = [
    { label: title, color: foreground },
    ...sources,
    ...(blend
      ? [
          {
            label: 'Colours blend from Reference to Study according to relative frequency.',
            color: foreground,
          },
        ]
      : []),
  ];
  let y = height + 24;
  for (const source of labels)
    for (const line of wrapFigureText(source.label, Math.max(12, Math.floor((width - 24) / 8)))) {
      const text = document.createElementNS(namespace, 'text');
      text.setAttribute('x', '12');
      text.setAttribute('y', String(y));
      text.setAttribute('fill', source.color);
      text.setAttribute('font-size', '14');
      text.setAttribute('font-family', 'sans-serif');
      text.textContent = line;
      clone.append(text);
      y += 22;
    }
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(y + 8));
  clone.setAttribute('viewBox', `0 0 ${String(width)} ${String(y + 8)}`);
  return clone;
}

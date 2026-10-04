import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildChartBlob, findSvgInContainer } from '../chartExport';

const createChartSvg = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '640');
  svg.setAttribute('height', '240');
  svg.innerHTML = [
    '<defs><clipPath id="clip"><rect width="640" height="240" /></clipPath></defs>',
    '<style>.series{stroke:#123456;fill:none}</style>',
    '<path class="series" clip-path="url(#clip)" d="M0 10 L640 20" />',
  ].join('');
  return svg;
};

describe('chartExport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('preserves ECharts SVG definitions and styles in composed SVG output', async () => {
    const { blob, filename } = await buildChartBlob(createChartSvg(), {
      nodeName: 'Corpus',
      toolSuffix: 'trends',
      format: 'svg',
      header: [{ label: 'Title', value: 'Trends' }],
      legend: [{ label: 'Alpha', color: '#123456', type: 'line' }],
    });
    const text = await blob.text();

    expect(filename).toBe('Corpus_trends.svg');
    expect(text).toContain('<clipPath id="clip">');
    expect(text).toContain('.series{stroke:#123456;fill:none}');
    expect(text).toContain('Trends');
    expect(text).toContain('Alpha');
  });

  it.each([
    ['png', 'image/png'],
    ['jpeg', 'image/jpeg'],
  ] as const)('rasterizes ECharts SVG for %s output', async (format, mimeType) => {
    const context = {
      scale: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      fillStyle: '',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => {
      callback(new Blob(['bitmap'], { type: type ?? mimeType }));
    });
    vi.stubGlobal(
      'Image',
      class TestImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-chart');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const { blob } = await buildChartBlob(createChartSvg(), {
      nodeName: 'Corpus',
      toolSuffix: 'trends',
      format,
    });

    expect(blob.type).toBe(mimeType);
    expect(context.drawImage).toHaveBeenCalled();
  });

  it('finds the chart SVG while ignoring control icons', () => {
    const container = document.createElement('div');
    const button = document.createElement('button');
    button.append(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const chart = createChartSvg();
    container.append(button, chart);

    expect(findSvgInContainer(container)).toBe(chart);
  });

  it('gives long legend labels their own width, wrapping rows (issue 281)', async () => {
    const legend = [
      { label: 'Reference: Crisis@Housing-2023-5', color: '#2563eb' },
      { label: 'Used about equally, for the corpus sizes', color: '#888888' },
      { label: 'Study: Crisis@Housing-2008', color: '#dc2626' },
    ];
    const { blob } = await buildChartBlob(createChartSvg(), {
      nodeName: 'Corpus',
      toolSuffix: 'wordcloud',
      format: 'svg',
      legend,
    });
    const text = await blob.text();
    const placed = legend.map((item) => {
      const match = new RegExp(
        `<text x="([\\d.]+)" y="([\\d.]+)"[^>]*>${item.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</text>`,
      ).exec(text);
      return { x: Number(match?.[1]), y: Number(match?.[2]), length: item.label.length };
    });
    // Each entry starts after the previous label ends, or on a new row.
    for (let index = 1; index < placed.length; index += 1) {
      const previous = placed[index - 1];
      const current = placed[index];
      if (!previous || !current) continue;
      const sameRow = previous.y === current.y;
      if (sameRow) expect(current.x).toBeGreaterThan(previous.x + previous.length * 5.8);
      else expect(current.y).toBeGreaterThan(previous.y);
    }
  });
});

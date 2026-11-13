import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildChartBlob, CHART_PLOT_ATTRIBUTE, findSvgInContainer } from '../chartExport';

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

  describe('theme colours', () => {
    // The range slider and grid lines take their colours from the theme.
    const createThemedSvg = () => {
      const svg = createChartSvg();
      svg.innerHTML = [
        '<path id="grid" d="M0 0 L640 0" fill="none" stroke="var(--test-lines)" />',
        '<path id="filler" d="M0 0 L640 10" fill="color-mix(in srgb, var(--test-focus) 22%, transparent)" />',
        '<path id="plain" d="M0 0 L640 20" fill="#123456" />',
      ].join('');
      return svg;
    };
    let themeStyle: HTMLStyleElement;
    beforeEach(() => {
      themeStyle = document.createElement('style');
      themeStyle.textContent =
        '[data-theme="light-2026"] { --test-lines: #10101066; --test-focus: #004cb5; }';
      document.head.append(themeStyle);
    });
    afterEach(() => {
      themeStyle.remove();
    });

    const exportedSvg = async (svg: SVGSVGElement) => {
      const { blob } = await buildChartBlob(svg, { format: 'svg' });
      return new DOMParser().parseFromString(await blob.text(), 'image/svg+xml');
    };

    it('writes the light theme colours as plain rgb() values', async () => {
      const painted: Record<string, number[]> = {
        '#10101066': [16, 16, 16, 102],
        'color-mix(in srgb, #004cb5 22%, transparent)': [0, 76, 181, 56],
      };
      let fillStyle = '';
      const context = {
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        getImageData: vi.fn(() => ({ data: painted[fillStyle] ?? [0, 0, 0, 0] })),
        set fillStyle(value: string) {
          fillStyle = value;
        },
        get fillStyle() {
          return fillStyle;
        },
      };
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
      const svg = createThemedSvg();

      const doc = await exportedSvg(svg);

      expect(doc.getElementById('grid')?.getAttribute('stroke')).toBe('rgba(16, 16, 16, 0.4)');
      expect(doc.getElementById('filler')?.getAttribute('fill')).toBe('rgba(0, 76, 181, 0.22)');
      expect(doc.getElementById('plain')?.getAttribute('fill')).toBe('#123456');
      // The chart on the page keeps its theme colours.
      expect(svg.querySelector('#grid')?.getAttribute('stroke')).toBe('var(--test-lines)');
      expect(document.querySelector('[data-theme]')).toBeNull();
    });

    it('substitutes the theme values when no canvas is available', async () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

      const doc = await exportedSvg(createThemedSvg());

      expect(doc.getElementById('grid')?.getAttribute('stroke')).toBe('#10101066');
      expect(doc.getElementById('filler')?.getAttribute('fill')).toBe(
        'color-mix(in srgb, #004cb5 22%, transparent)',
      );
    });
  });

  it('finds the chart SVG in the plot, not a help icon before it', () => {
    // The Trends toolbar has a Spacing help icon, a link with the button role
    // (issue 335), before the chart.
    const container = document.createElement('div');
    const button = document.createElement('button');
    button.append(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const help = document.createElement('a');
    help.setAttribute('role', 'button');
    help.append(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const plot = document.createElement('div');
    plot.setAttribute(CHART_PLOT_ATTRIBUTE, '');
    const chart = createChartSvg();
    plot.append(chart);
    container.append(button, help, plot);

    expect(findSvgInContainer(container)).toBe(chart);
  });

  it('finds no chart SVG when no chart is drawn', () => {
    const container = document.createElement('div');
    container.append(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));

    expect(findSvgInContainer(container)).toBeNull();
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

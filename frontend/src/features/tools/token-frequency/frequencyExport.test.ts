import { Blob as NodeBlob } from 'node:buffer';
import JSZip from 'jszip';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildFrequencyBundle } from './frequencyExport';
import { buildChartExport, saveGeneratedExport } from '../common/chartExport';

const native = vi.hoisted(() => ({ active: false, invoke: vi.fn() }));
vi.mock('@/lib/isTauri', () => ({ isTauri: () => native.active }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }));

beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
  native.active = false;
  native.invoke.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:frequency-export');
  URL.revokeObjectURL = vi.fn();
  document.documentElement.style.setProperty('--vscode-surface-background', '#f5f5f5');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty('--vscode-surface-background');
});

it('snapshots SVG dimensions and content without changing the displayed chart', async () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 320 180');
  svg.innerHTML = '<text>猫 &amp; dog</text>';
  const result = buildChartExport(svg, 'svg');
  svg.textContent = 'changed';
  expect(await (await result).text()).toContain('猫 &amp; dog');
  expect(await (await result).text()).toContain('width="320" height="180"');
  expect(svg).not.toHaveAttribute('width');
});

it.each([
  ['png', '#f5f5f5'],
  ['jpeg', '#171717'],
] as const)(
  'renders %s at triple size with the captured theme surface %s',
  async (format, background) => {
    document.documentElement.style.setProperty('--vscode-surface-background', background);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100');
    svg.setAttribute('height', '80');
    vi.stubGlobal(
      'Image',
      class {
        onload?: () => void;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback, mime) => {
        callback(new Blob(['image'], { type: mime }));
      });
    const result = await buildChartExport(svg, format);
    expect(context.fillStyle).toBe(background);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 300, 240);
    expect(toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      `image/${format}`,
      format === 'jpeg' ? 0.92 : undefined,
    );
    expect(result.type).toBe(`image/${format}`);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:frequency-export');
  },
);

it('bundles exact original bytes and stopwords while keeping Unicode filenames in one directory', async () => {
  const primary = 'token,frequency\n猫,18446744073709551615';
  const bundle = await buildFrequencyBundle(new Blob([primary]), '日本/words.csv', ['the', 'and']);
  const zip = await JSZip.loadAsync(await bundle.arrayBuffer());
  expect(Object.keys(zip.files)).toEqual(['日本_words.csv', '日本_words-stopwords.txt']);
  expect(await zip.file('日本_words.csv')?.async('string')).toBe(primary);
  expect(await zip.file('日本_words-stopwords.txt')?.async('string')).toBe('the\nand');
});

it('downloads generated browser files with a temporary anchor and deferred URL cleanup', async () => {
  vi.useFakeTimers();
  let attached = false;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    attached = this.isConnected;
    expect(this.download).toBe('日本.svg');
  });
  await expect(saveGeneratedExport(new Blob(['svg']), '日本.svg')).resolves.toBe('日本.svg');
  expect(attached).toBe(true);
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:frequency-export');
});

it('retains native cancellation and task-owned error identities', async () => {
  native.active = true;
  native.invoke.mockResolvedValueOnce(null);
  await expect(saveGeneratedExport(new Blob(['abc']), 'words.svg')).resolves.toBeNull();
  expect(native.invoke).toHaveBeenCalledWith('save_generated_export', {
    suggestedName: 'words.svg',
    bytes: [97, 98, 99],
  });
  native.invoke.mockRejectedValueOnce({
    code: 'export_failed',
    message: 'Disk full',
    task_id: 'export-1',
  });
  await expect(saveGeneratedExport(new Blob(['abc']), 'words.svg')).rejects.toMatchObject({
    message: 'Disk full',
    code: 'export_failed',
    taskId: 'export-1',
  });
});

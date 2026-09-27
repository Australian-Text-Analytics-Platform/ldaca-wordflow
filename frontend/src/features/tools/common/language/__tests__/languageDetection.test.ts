import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fileset: vi.fn(),
  create: vi.fn(),
  detect: vi.fn(),
}));
vi.mock('@mediapipe/tasks-text', () => ({
  FilesetResolver: { forTextTasks: mocks.fileset },
  LanguageDetector: { createFromModelPath: mocks.create },
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.fileset.mockResolvedValue({ local: true });
  mocks.create.mockResolvedValue({ detect: mocks.detect });
  mocks.detect.mockReturnValue({ languages: [{ languageCode: 'EN-us' }] });
});

describe('local MediaPipe language detection', () => {
  it('shares initialization and resolves all assets within the application origin', async () => {
    const { detectLanguageIso6391 } = await import('../languageDetection');
    expect(
      await detectLanguageIso6391('The first document', undefined, 'http://127.0.0.1:1234'),
    ).toBe('en');
    expect(await detectLanguageIso6391('The second document')).toBe('en');
    expect(mocks.fileset).toHaveBeenCalledOnce();
    expect(mocks.fileset).toHaveBeenCalledWith('http://127.0.0.1:1234/api/resources/language');
    expect(mocks.create).toHaveBeenCalledWith(
      { local: true },
      'http://127.0.0.1:1234/api/resources/language/language-detector.tflite',
    );
  });

  it('normalizes whitespace and bounds text without loading the detector for empty input', async () => {
    const { detectLanguageIso6391 } = await import('../languageDetection');
    expect(await detectLanguageIso6391(' \n\t ')).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
    await detectLanguageIso6391(` \n${'word\t'.repeat(6000)}`);
    expect(mocks.detect.mock.calls[0]?.[0]).toBe('word '.repeat(4000));
  });

  it('allows initialization retry after a failed model load', async () => {
    mocks.create.mockRejectedValueOnce(new Error('Model not ready'));
    const { detectLanguageIso6391 } = await import('../languageDetection');
    await expect(detectLanguageIso6391('words')).rejects.toThrow('Model not ready');
    expect(await detectLanguageIso6391('words')).toBe('en');
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it('does not detect obsolete text after cancellation while shared model loading finishes', async () => {
    let loaded!: (detector: { detect: typeof mocks.detect }) => void;
    mocks.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          loaded = resolve;
        }),
    );
    const { detectLanguageIso6391 } = await import('../languageDetection');
    const controller = new AbortController();
    const pending = detectLanguageIso6391('obsolete', controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => {
      expect(mocks.create).toHaveBeenCalledOnce();
    });
    controller.abort();
    loaded({ detect: mocks.detect });
    await rejected;
    expect(mocks.detect).not.toHaveBeenCalled();
    expect(await detectLanguageIso6391('current')).toBe('en');
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it('does not initialize for already cancelled requests', async () => {
    const { detectLanguageIso6391 } = await import('../languageDetection');
    const controller = new AbortController();
    controller.abort();
    await expect(detectLanguageIso6391('words', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

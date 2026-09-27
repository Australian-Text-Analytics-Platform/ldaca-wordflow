import type { LanguageDetector as MediaPipeLanguageDetector } from '@mediapipe/tasks-text';
import { normaliseIso6391LanguageCode } from './languages';

const MAX_DETECTION_CHARS = 20_000;
let detectorPromise: Promise<MediaPipeLanguageDetector> | null = null;

function getLanguageDetector(base: string): Promise<MediaPipeLanguageDetector> {
  detectorPromise ??= import('@mediapipe/tasks-text')
    .then(async ({ FilesetResolver, LanguageDetector }) => {
      const assetRoot = `${base}/api/resources/language/`;
      const fileset = await FilesetResolver.forTextTasks(assetRoot.slice(0, -1));
      return LanguageDetector.createFromModelPath(fileset, `${assetRoot}language-detector.tflite`);
    })
    .catch((error: unknown) => {
      detectorPromise = null;
      throw error;
    });
  return detectorPromise;
}

/** Local, advisory detection. Shared asset loading may finish after a caller cancels. */
export async function detectLanguageIso6391(
  text: string,
  signal?: AbortSignal,
  base = '',
): Promise<string | null> {
  signal?.throwIfAborted();
  const sample = text.replace(/\s+/g, ' ').trim().slice(0, MAX_DETECTION_CHARS);
  if (!sample) return null;
  const detector = await getLanguageDetector(base);
  signal?.throwIfAborted();
  const result = detector.detect(sample);
  signal?.throwIfAborted();
  return normaliseIso6391LanguageCode(result.languages[0]?.languageCode);
}

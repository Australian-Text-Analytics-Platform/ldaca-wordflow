import { ProjectError } from '@/api/client';
import { isTauri } from '@/lib/isTauri';
/** Native installation owns accepted bytes; browser downloads use the captured Blob. */
export async function saveGeneratedExport(blob: Blob, filename: string): Promise<string | null> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      return await invoke<string | null>('save_generated_export', {
        suggestedName: filename,
        bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
      });
    } catch (error) {
      throw ProjectError.fromNative(error);
    }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  }
  return filename;
}

import { useEffect } from 'react';
import { hasRunningUpload, useUploadTasksStore } from '@/stores/uploadTasksStore';

/**
 * Asks before the page is reloaded or closed while an upload is still sending
 * (issue 260): a browser upload cannot continue once the page is gone.
 */
export function useUploadLeaveGuard(): void {
  const uploading = useUploadTasksStore((state) => hasRunningUpload(state.uploads));
  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Some WebKit and older Chromium builds prompt only when returnValue is set.
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- still needed for those browsers
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [uploading]);
}

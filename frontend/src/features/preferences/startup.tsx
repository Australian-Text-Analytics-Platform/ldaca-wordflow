import { createRoot } from 'react-dom/client';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { initializePreferences, resetPreferences, reportPreferenceFailure } from './preferences';

export async function withPreferences(
  container: HTMLElement,
  base: string,
  render: () => Promise<void> | void,
) {
  try {
    const stop = await initializePreferences(base);
    import.meta.hot?.dispose(stop);
    await render();
  } catch (error) {
    const root = createRoot(container);
    root.render(
      <main className="p-6">
        <Toaster />
        <h1>Could not load preferences</h1>
        <p>{error instanceof Error ? error.message : String(error)}</p>
        <p>
          The preferences file has been preserved. Retry after correcting it, or explicitly reset
          it.
        </p>
        <Button
          onClick={() => {
            window.location.reload();
          }}
        >
          Retry
        </Button>
        <Button
          onClick={() => {
            void resetPreferences(base)
              .then(() => {
                window.location.reload();
              })
              .catch(reportPreferenceFailure);
          }}
        >
          Reset preferences
        </Button>
      </main>,
    );
  }
}

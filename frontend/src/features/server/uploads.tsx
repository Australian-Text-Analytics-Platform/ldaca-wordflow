import { create } from 'zustand';
import { request } from '@/api/client';
import { Button } from '@/components/ui/button';
import { OperationError } from '@/features/project/OperationError';
import { uploadFile, type Library } from './api';
type Card = {
  id: string;
  base: string;
  library: Library;
  name: string;
  file: File;
  sent: number;
  total: number;
  status: 'uploading' | 'finishing' | 'success' | 'failed' | 'uncertain';
  controller: AbortController;
  error?: unknown;
  note?: string;
};
export const useUploads = create<{
  cards: Card[];
  revision: number;
  visibleLibraries: Partial<Record<Library, number>>;
}>(() => ({ cards: [], revision: 0, visibleLibraries: {} }));
function update(id: string, patch: Partial<Card>) {
  useUploads.setState((state) => ({
    cards: state.cards.map((card) => (card.id === id ? { ...card, ...patch } : card)),
  }));
}
async function refreshUpload(id: string) {
  const card = useUploads.getState().cards.find((card) => card.id === id);
  if (!card) return;
  try {
    const response = await request(card.base, '/api/server/files/{library}', 'get', {
      path: { library: card.library },
    });
    await response.json();
    update(id, {
      note: 'Destination refreshed. Check its files before retrying; the server may have finished the upload.',
      error: undefined,
    });
    useUploads.setState((state) => ({ revision: state.revision + 1 }));
  } catch (error) {
    update(id, { error });
  }
}
export function startUpload(
  base: string,
  library: Library,
  file: File,
  folder = '',
  replacing?: string,
) {
  const id = replacing ?? crypto.randomUUID();
  const name = folder ? `${folder}/${file.name}` : file.name;
  const controller = new AbortController();
  const card: Card = {
    id,
    base,
    library,
    name,
    file,
    sent: 0,
    total: file.size,
    status: 'uploading',
    controller,
  };
  useUploads.setState((state) => ({
    cards: replacing
      ? state.cards.map((old) => (old.id === id ? card : old))
      : [...state.cards, card],
  }));
  return uploadFile(
    base,
    library,
    file,
    controller.signal,
    (sent, total) => update(id, { sent, total, status: sent >= total ? 'finishing' : 'uploading' }),
    name,
  ).then(
    (published) => {
      update(id, { name: published.name, sent: file.size, status: 'success' });
      useUploads.setState((state) => ({ revision: state.revision + 1 }));
      return published;
    },
    (error: unknown) => {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
        update(id, {
          status: 'uncertain',
          note: 'Cancellation requested. The server may already have finished. Refresh the destination or dismiss this card.',
        });
        void refreshUpload(id);
      } else {
        update(id, { status: 'failed', error });
      }
      return undefined;
    },
  );
}
export function UploadCards({ library }: { library?: Library }) {
  const cards = useUploads((state) => state.cards);
  const open = useUploads((state) => state.visibleLibraries);
  const visible = cards.filter((card) =>
    library ? card.library === library : !open[card.library],
  );
  if (!visible.length) return null;
  return (
    <aside
      aria-label="Uploads"
      className={
        library
          ? 'space-y-2'
          : 'fixed bottom-3 right-3 z-40 max-h-[45vh] w-[min(26rem,90vw)] space-y-2 overflow-auto rounded-md bg-surface p-2 shadow-lg'
      }
    >
      {visible.map((card) => (
        <div
          key={card.id}
          className="space-y-2 rounded-md border bg-surface p-3 text-body-secondary"
        >
          <p className="break-all font-medium">{card.name}</p>
          <p>
            {card.status === 'success'
              ? 'Uploaded'
              : card.status === 'finishing'
                ? 'Finishing…'
                : card.status === 'failed'
                  ? 'Upload failed'
                  : card.status === 'uncertain'
                    ? 'Cancellation unconfirmed'
                    : `${card.sent.toLocaleString()} / ${card.total.toLocaleString()} bytes`}
          </p>
          {(card.status === 'uploading' || card.status === 'finishing') && (
            <>
              <progress
                aria-label={`Upload ${card.name}`}
                className="w-full"
                max={card.total || 1}
                value={card.sent}
              />
              <Button size="sm" variant="outline" onClick={() => card.controller.abort()}>
                Cancel upload
              </Button>
            </>
          )}
          {card.note && <p>{card.note}</p>}
          {card.error != null && (
            <OperationError
              title={
                card.status === 'uncertain'
                  ? 'Could not refresh destination'
                  : 'Could not upload file'
              }
              error={card.error}
              onRetry={
                card.status === 'failed'
                  ? () =>
                      startUpload(
                        card.base,
                        card.library,
                        card.file,
                        card.name.split('/').slice(0, -1).join('/'),
                        card.id,
                      )
                  : () => {
                      void refreshUpload(card.id);
                    }
              }
            />
          )}
          {card.status === 'uncertain' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void refreshUpload(card.id);
              }}
            >
              Refresh destination
            </Button>
          )}
          {['success', 'failed', 'uncertain'].includes(card.status) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                useUploads.setState((state) => ({
                  cards: state.cards.filter((item) => item.id !== card.id),
                }))
              }
            >
              Dismiss
            </Button>
          )}
        </div>
      ))}
    </aside>
  );
}

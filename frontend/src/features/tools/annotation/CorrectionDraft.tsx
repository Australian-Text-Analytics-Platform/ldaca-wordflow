import type { ReactNode } from 'react';
import * as api from '@/features/project/api';
import { Button } from '@/components/ui/button';
import { EditingLeaveDialog } from '@/features/table-editing/EditingLeaveDialog';
import { useTableEditing } from '@/features/table-editing/useTableEditing';

export type CorrectionEditor = ReturnType<typeof useTableEditing>;
export interface CorrectionSession {
  session: api.CellEditSession;
  setup: api.AnnotationSetup;
  preview: boolean;
  analysisId: string | null;
}
/** A single shared editor owns patches even when a fresh Preview clears its predictions. */
export function CorrectionDraft({
  base,
  value,
  review,
  onFinished,
  onUseExamples,
  children,
}: {
  base: string;
  value: CorrectionSession;
  review: Omit<api.AnnotationReview, 'changes'>;
  onFinished: () => void;
  onUseExamples: () => void;
  children: (editor: CorrectionEditor) => ReactNode;
}) {
  const editor = useTableEditing({
    base,
    session: value.session,
    onFinished,
    allowRowChanges: false,
    initialPageSize: 10,
    readPages: !value.preview,
    review: value.preview ? undefined : review,
    liveDependencies: value.setup.codebook
      ? [api.objectRef(value.setup.codebook.source)]
      : undefined,
  });
  return (
    <>
      {children(editor)}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-description text-label-secondary">
          {editor.changedCells} changed cells{editor.modified ? ' · Includes unsaved changes' : ''}
        </span>
        <Button
          variant="ghost"
          disabled={editor.busy}
          onClick={() => {
            void editor
              .saveAsync()
              .then(onUseExamples)
              .catch(() => {
                /* The shared observer reports Save failures. */
              });
          }}
        >
          Save and use as examples
        </Button>
        <Button variant="outline" disabled={editor.busy} onClick={editor.cancel}>
          Cancel
        </Button>
        <Button disabled={editor.busy} onClick={editor.save}>
          {editor.saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <EditingLeaveDialog id={value.session.session_id} editor={editor} />
    </>
  );
}

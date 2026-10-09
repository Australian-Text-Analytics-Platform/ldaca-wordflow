import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dependencyGraph } from './api';
import { dependentSelection } from './deletionSelection';
import { targetKey, type ObjectRef } from './objects';
import { OperationError } from './OperationError';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export function DeleteObjectsDialog({
  base,
  roots,
  onClose,
  deleteNodes,
}: {
  base: string;
  roots: ObjectRef[];
  onClose: () => void;
  deleteNodes: (objects: ObjectRef[]) => Promise<boolean>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const [chosen, setChosen] = useState<ObjectRef[] | null>(null);
  const [failure, setFailure] = useState<unknown>();
  const catalogue = useQuery({
    queryKey: ['native', base, 'graph', 'deletion'],
    queryFn: ({ signal }) => dependencyGraph(base, signal),
    staleTime: 0,
    meta: { reportError: false },
  });
  const affected = catalogue.data ? dependentSelection(catalogue.data, roots) : [];
  const selectedForDelete = chosen ?? affected;
  const included = new Set(selectedForDelete.map(targetKey));

  const handleDelete = async () => {
    if (!selectedForDelete.length || isDeleting || !catalogue.isSuccess) return;
    setIsDeleting(true);
    try {
      setFailure(undefined);
      if (await deleteNodes(selectedForDelete)) onClose();
    } catch (error) {
      setFailure(error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !isDeleting) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {selectedForDelete.length} data block
            {selectedForDelete.length === 1 ? '' : 's'}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This cannot be undone. SQL-dependent Data Blocks are included. Unticking an entry also
            keeps its selected sources:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-60 overflow-y-auto rounded-sm border bg-panel/40 p-2 text-body">
          {affected.map((item) => (
            <li key={targetKey(item)}>
              <label className="flex items-center gap-2 p-1">
                <input
                  type="checkbox"
                  checked={included.has(targetKey(item))}
                  disabled={isDeleting}
                  onChange={(event) => {
                    if (!catalogue.data) return;
                    if (event.target.checked)
                      setChosen(dependentSelection(catalogue.data, [...selectedForDelete, item]));
                    else {
                      const keep = new Set(
                        dependentSelection(catalogue.data, [item], true).map(targetKey),
                      );
                      setChosen(selectedForDelete.filter((object) => !keep.has(targetKey(object))));
                    }
                  }}
                />
                {item.schema === 'data' ? item.name : `${item.schema}.${item.name}`}
              </label>
            </li>
          ))}
        </ul>
        {catalogue.isPending && <p role="status">Checking dependent Data Blocks…</p>}
        {(catalogue.error != null || failure !== undefined) && (
          <OperationError
            title="Could not delete Data Blocks"
            error={failure ?? catalogue.error}
            onRetry={() => {
              if (failure) void handleDelete();
              else void catalogue.refetch();
            }}
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button
            asChild
            variant="destructive"
            disabled={isDeleting || !selectedForDelete.length || !catalogue.isSuccess}
          >
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
              disabled={isDeleting || !selectedForDelete.length || !catalogue.isSuccess}
            >
              {isDeleting ? 'Deleting…' : `Delete ${String(selectedForDelete.length)}`}
            </AlertDialogAction>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

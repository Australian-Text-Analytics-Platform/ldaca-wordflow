import type { EditableCell } from '@/features/table-editing/useTableEditing';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';

export function AnnotationLabelCell({
  cell,
  codes,
  hasCodebook,
  loading,
}: {
  cell: EditableCell;
  codes?: { code: string; description: string }[];
  hasCodebook: boolean;
  loading: boolean;
}) {
  if (!hasCodebook)
    return (
      <div className="flex min-w-40 items-center gap-1">
        <Input
          aria-label={`Edit ${cell.column.name}`}
          value={cell.value ?? ''}
          placeholder={cell.value === null ? 'None' : undefined}
          disabled={cell.disabled}
          onChange={(event) => {
            cell.onChange(event.target.value);
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={cell.disabled}
          onClick={() => {
            cell.onChange(null);
          }}
        >
          None
        </Button>
        {cell.changed && <span className="sr-only">Unsaved</span>}
      </div>
    );
  const valid =
    cell.value === null ? true : codes?.some((code) => code.code === cell.value?.trim());
  const options =
    codes?.map((code) => ({
      value: JSON.stringify(code.code),
      label: code.code,
    })) ?? [];
  if (cell.value !== null && !options.some((o) => o.value === JSON.stringify(cell.value)))
    options.unshift({
      value: JSON.stringify(cell.value),
      label: valid === false ? `${cell.value} (not in current Codebook)` : cell.value,
    });
  return (
    <div className="flex min-w-40 flex-col gap-1">
      <SearchableSelect
        ariaLabel={`Edit ${cell.column.name}`}
        disabled={cell.disabled || loading}
        value={JSON.stringify(cell.value)}
        pinnedOptions={[{ value: 'null', label: 'None' }]}
        options={options}
        onChange={(value) => {
          cell.onChange(JSON.parse(value) as string | null);
        }}
      />
      {cell.changed && <span className="text-description text-label-secondary">Unsaved</span>}
      {valid === false && (
        <span className="text-description text-label-secondary">Not in current Codebook</span>
      )}
    </div>
  );
}

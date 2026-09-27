import { Input } from '@/components/ui/input';
import { useInlineRename } from '@/lib/rename/useInlineRename';

interface RenameInputProps {
  column: string;
  onSubmit: (column: string, value: string) => Promise<boolean>;
  onCancel: () => void;
}

/**
 * Inline column-name editor opened by double-clicking a header or from its
 * menu. Follows the shared rename rule (issue 210).
 */
export function RenameInput({ column, onSubmit, onCancel }: RenameInputProps) {
  const { inputProps } = useInlineRename({
    original: column,
    onSubmit: (name) => onSubmit(column, name),
    onClose: onCancel,
  });

  return (
    <Input
      {...inputProps}
      className="h-7 w-40 truncate text-label-secondary"
      aria-label={`Rename column ${column}`}
    />
  );
}

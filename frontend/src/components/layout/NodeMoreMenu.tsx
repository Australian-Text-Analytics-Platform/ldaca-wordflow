import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';

/** Shared by graph and sidebar nodes; hosts supply only supported actions. */
export function NodeMoreMenu({
  onEditSql,
  onEditTable,
  collisionBoundary,
}: {
  onEditSql?: () => void;
  onEditTable?: () => void;
  collisionBoundary?: Element | null;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={!onEditSql && !onEditTable}>More</DropdownMenuSubTrigger>
      {(onEditSql ?? onEditTable) && (
        <DropdownMenuSubContent collisionBoundary={collisionBoundary} collisionPadding={8}>
          {onEditSql && (
            <DropdownMenuItem onSelect={onEditSql}>Edit SQL Definition</DropdownMenuItem>
          )}
          {onEditTable && <DropdownMenuItem onSelect={onEditTable}>Edit Table</DropdownMenuItem>}
        </DropdownMenuSubContent>
      )}
    </DropdownMenuSub>
  );
}

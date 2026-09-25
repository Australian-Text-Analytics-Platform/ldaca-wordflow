import { type ReactNode, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import HelpIcon from '@/components/help/HelpIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { DisabledReasonTooltip } from '@/components/ui/disabled-reason-tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { acceptPlaceholderOnTab } from '@/features/views/common/placeholderTabFill';
import { useWorkspaceActions } from '@/features/workspace/common/hooks/useWorkspaceActions';
import { PreviewTable } from '../components/PreviewTable';
import { usePreprocessingPreview } from '../hooks/usePreprocessingPreview';
import type { DerivationBody } from './builderTypes';

export interface BuilderToolCardProps {
  title: string;
  /** One line saying what the tool makes, shown under the title (issue 159). */
  subtitle?: string;
  icon: ReactNode;
  helpKey: string;
  helpLabel: string;
  tooltip: string;
  renderNodeInputsPanel?: () => ReactNode;
  workspaceId: string | null;
  sourceNodeId: string | null;
  /** Preview identity, such as "segment". */
  operation: string;
  /** The derivation to preview, or null while the form is incomplete. */
  previewBody: DerivationBody | null;
  /** Shown in place of the preview while the form is incomplete. */
  incompleteMessage: string;
  nameLabel?: string;
  name: string;
  namePlaceholder: string;
  onNameChange: (name: string) => void;
  createLabel: string;
  canCreate: boolean;
  /** Creates the Data Block(s) and returns the success message. */
  onCreate: () => Promise<string>;
  /** A one-line result summary from the previewed row count. */
  summary?: (totalRows: number | null | undefined) => ReactNode;
  previewTitle: string;
  previewDescription: string;
  onAlert: (message: string) => void;
  children: ReactNode;
}

/**
 * Shared layout for the Data Builder tools added in issues 148 to 151: inputs,
 * the tool's form, a name and Create button, and the server preview below.
 */
export function BuilderToolCard({
  title,
  subtitle,
  icon,
  helpKey,
  helpLabel,
  tooltip,
  renderNodeInputsPanel,
  workspaceId,
  sourceNodeId,
  operation,
  previewBody,
  incompleteMessage,
  nameLabel = 'New data block name',
  name,
  namePlaceholder,
  onNameChange,
  createLabel,
  canCreate,
  onCreate,
  summary,
  previewTitle,
  previewDescription,
  onAlert,
  children,
}: BuilderToolCardProps) {
  const { previewDerivation } = useWorkspaceActions();
  const [creating, setCreating] = useState(false);
  const request = workspaceId && previewBody ? { workspaceId, body: previewBody } : null;
  const preview = usePreprocessingPreview({
    request,
    identity:
      request && sourceNodeId
        ? { workspaceId: request.workspaceId, operation, nodeIds: [sourceNodeId] }
        : null,
    fetcher: ({ request: current, page, pageSize, signal }) =>
      previewDerivation({
        workspaceId: current.workspaceId,
        body: current.body,
        page,
        pageSize,
        signal,
      }),
  });

  const disabledReason = !sourceNodeId
    ? 'Select a data block first'
    : !canCreate
      ? incompleteMessage
      : undefined;

  const create = async () => {
    setCreating(true);
    try {
      toast.success(await onCreate());
    } catch (error) {
      onAlert(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  };

  const totalRows = previewBody ? preview.pagination?.total_rows : undefined;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            {icon}
            {title}
            <HelpIcon targetKey={helpKey} label={helpLabel} tooltip={tooltip} />
          </CardTitle>
          {subtitle ? <p className="pt-1 text-body text-description">{subtitle}</p> : null}
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {renderNodeInputsPanel?.()}
          {children}
          {summary && previewBody && !preview.loading && !preview.error ? (
            <p role="status" className="text-body text-description">
              {summary(totalRows)}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-wrap items-center gap-3 border-t pt-4">
          <div className="flex min-w-64 flex-1 items-center gap-2">
            <Label htmlFor={`${operation}-name`} className="shrink-0">
              {nameLabel}
            </Label>
            <Input
              id={`${operation}-name`}
              value={name}
              placeholder={namePlaceholder}
              onChange={(event) => {
                onNameChange(event.target.value);
              }}
              // Tab takes the suggested name so it can be edited (issue 156).
              onKeyDown={(event) => {
                acceptPlaceholderOnTab({ event, value: name, setValue: onNameChange });
              }}
              className="min-w-0 flex-1"
            />
          </div>
          <DisabledReasonTooltip reason={creating ? undefined : disabledReason}>
            <Button
              type="button"
              size="sm"
              onClick={() => void create()}
              disabled={creating || disabledReason !== undefined}
              className="shrink-0"
            >
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {createLabel}
            </Button>
          </DisabledReasonTooltip>
        </CardFooter>
      </Card>

      <PreviewTable
        title={previewTitle}
        description={previewDescription}
        columns={preview.columns}
        data={preview.data}
        pagination={preview.pagination}
        loading={preview.loading}
        error={preview.error}
        ready={Boolean(previewBody) && preview.ready}
        readyMessage={previewBody ? undefined : incompleteMessage}
        page={preview.page}
        pageSize={preview.pageSize}
        onPageSizeChange={preview.setPageSize}
        onPageChange={preview.setPage}
      />
    </div>
  );
}

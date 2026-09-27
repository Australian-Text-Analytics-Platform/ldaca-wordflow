import type { ReactNode } from 'react';
import { Layers, Loader2, Plus } from 'lucide-react';

import HelpIcon from '@/components/help/HelpIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DisabledReasonTooltip } from '@/components/ui/disabled-reason-tooltip';
import { PreviewTable } from '../components/PreviewTable';
import { SubTabActivityTag } from '../components/SubTabActivityTag';
import { acceptPlaceholderOnTab } from '@/features/tools/common/placeholderTabFill';
import { useConcatSubTab, type ConcatSubTabProps } from './hooks/useConcatSubTab';

type ConcatSubTabComponentProps = ConcatSubTabProps & {
  renderNodeInputsPanel?: () => ReactNode;
};

/**
 * Renders the Concatenate preprocessing sub-tab. It consumes `useConcatSubTab`
 * so schema analysis, preview fetching, and apply behavior stay out of the
 * JSX layout.
 * Rendered by `DataPreprocessingFeature`; `useConcatSubTab` supplies its model.
 * Flow: collect selected nodes/schema analysis from its hook, render node ordering and alignment
 * guidance, preview concatenation results, then expose apply controls.
 */
export function ConcatSubTab(props: ConcatSubTabComponentProps) {
  const { renderNodeInputsPanel } = props;
  const { form, statusMessage, preview, apply, showActivityTag } = useConcatSubTab(props);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-0 pb-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Concatenate Datasets
                <HelpIcon
                  targetKey="preprocessing.concat.tab"
                  label="Concat sub-tab overview"
                  tooltip="Stack compatible data blocks vertically into a single data block."
                />
              </CardTitle>
            </div>
            <SubTabActivityTag active={showActivityTag} verb="Concatenating" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {renderNodeInputsPanel?.()}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Schema status</Label>
              <HelpIcon targetKey="preprocessing.concat.schema-status" label="Schema status" />
            </div>
            <div className="rounded-md border border-surface-border-foreground/40 bg-panel/40 px-3 py-2 text-body text-description">
              {statusMessage}
            </div>
          </div>

          <label className="flex items-center gap-2 text-body">
            <Checkbox
              id="concat-deduplicate"
              checked={form.deduplicate}
              onCheckedChange={(checked) => {
                form.setDeduplicate(checked === true);
              }}
            />
            <span>Remove identical complete rows after stacking</span>
            <HelpIcon
              targetKey="preprocessing.concat.deduplicate"
              label="Deduplicate stacked rows"
              tooltip="Use UNION BY NAME to remove duplicate result rows."
            />
          </label>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center gap-3 border-t pt-4">
          <div className="flex min-w-0 flex-[1_1_20rem] flex-wrap items-center gap-2">
            <Label htmlFor="concat-new-node-name" className="shrink-0">
              New data block name
            </Label>
            <HelpIcon targetKey="preprocessing.concat.new-node-name" label="Concat output name" />
            <Input
              id="concat-new-node-name"
              value={form.value}
              placeholder={form.placeholder}
              onChange={(event) => {
                form.setValue(event.target.value);
              }}
              onKeyDown={(event) => {
                acceptPlaceholderOnTab({ event, value: form.value, setValue: form.setValue });
              }}
              className="min-w-32 flex-1"
            />
          </div>
          <DisabledReasonTooltip reason={apply.disabledReason}>
            <Button
              type="button"
              size="sm"
              onClick={() => void apply.run()}
              disabled={apply.disabled}
              className="shrink-0"
            >
              {apply.isBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Concatenating…
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Data Block
                </>
              )}
            </Button>
          </DisabledReasonTooltip>
          <HelpIcon targetKey="preprocessing.common.apply-button" label="Apply action" />
        </CardFooter>
      </Card>

      <PreviewTable
        title={
          <span className="flex items-center gap-2">
            Preview concat output
            <HelpIcon targetKey="preprocessing.common.preview" label="Preview table" />
          </span>
        }
        description="Inspect a sample of the stacked rows before creating the data block."
        columns={preview.columns}
        schema={preview.schema}
        data={preview.data}
        pagination={preview.pagination}
        loading={preview.loading}
        error={preview.error}
        ready={preview.ready}
        readyMessage={preview.readyMessage}
        page={preview.page}
        pageSize={preview.pageSize}
        onPageSizeChange={preview.onPageSizeChange}
        onPageChange={preview.onPageChange}
      />
    </div>
  );
}

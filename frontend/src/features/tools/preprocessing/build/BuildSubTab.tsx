import { useRef, type ReactNode } from 'react';
import type { EditorView } from '@codemirror/view';
import { Calculator, Code2, Loader2 } from 'lucide-react';
import HelpIcon from '@/components/help/HelpIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DisabledReasonTooltip } from '@/components/ui/disabled-reason-tooltip';
import { identifier } from '@/features/project/api';
import { takeMostRecent } from '@/features/project/common/utils/selectionUtils';
import { PreviewTable } from '../components/PreviewTable';
import { SubTabActivityTag } from '../components/SubTabActivityTag';
import { SqlEditor } from '../sql/SqlEditor';
import { ColumnPicker } from './components/ColumnPicker';
import { BubbleBuilder } from './components/BubbleBuilder';
import { useBuildSubTab, type BuildSubTabProps } from './hooks/useBuildSubTab';

type Props = BuildSubTabProps & {
  renderNodeInputsPanel?: () => ReactNode;
  outputNameInput?: ReactNode;
};
export function BuildSubTab(props: Props) {
  const [node] = takeMostRecent(props.selectedNodes, 1);
  return <BuildSubTabContent key={node?.id ?? 'none'} {...props} />;
}
function BuildSubTabContent(props: Props) {
  const build = useBuildSubTab(props);
  const { draft, preview, apply, activeNode, columns } = build;
  const editor = useRef<EditorView | null>(null);
  const insertColumn = (column: string) => {
    const view = editor.current;
    if (view) {
      view.dispatch(view.state.replaceSelection(identifier(column)));
      view.focus();
    } else build.setSql(`${draft.sql?.expression ?? ''}${identifier(column)}`);
  };
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Calculator className="size-5" />
              Build a column
              <HelpIcon targetKey="preprocessing.build.tab" label="Build overview" />
            </CardTitle>
            <SubTabActivityTag active={apply.loading} verb="Applying" />
          </div>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4">
          {props.renderNodeInputsPanel?.()}
          {draft.sql ? (
            <section className="flex min-w-0 flex-col gap-3" aria-label="SQL expression editor">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">SQL expression</h3>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={build.parsing}
                  onClick={build.returnToBuilder}
                >
                  {build.parsing && <Loader2 className="animate-spin" />}Return to bubble builder
                </Button>
              </div>
              <p className="text-body text-description">
                Write one DuckDB expression. Returning to the builder converts supported expressions
                to bubbles and keeps other fragments as editable SQL.
              </p>
              <SqlEditor
                value={draft.sql.expression}
                onChange={build.setSql}
                onCreateEditor={(view) => {
                  editor.current = view;
                }}
                minHeight="8rem"
                placeholder={'concat_ws(\' \', "first_name", "last_name")'}
                disabled={!activeNode}
              />
              <div>
                <ColumnPicker columns={columns} onColumn={insertColumn} disabled={!activeNode} />
              </div>
              {(build.parseError ?? preview.error) && (
                <p role="status" className="whitespace-pre-wrap break-words text-body text-error">
                  {build.parseError ?? preview.error}
                </p>
              )}
            </section>
          ) : (
            <>
              <BubbleBuilder build={build} />
              <section className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">{build.isDraft ? 'Draft SQL' : 'SQL expression'}</h3>
                  <Button variant="ghost" size="sm" disabled={!activeNode} onClick={build.editSql}>
                    <Code2 />
                    Edit SQL expression
                  </Button>
                </div>
                <pre className="whitespace-pre-wrap break-all rounded-md bg-editor p-3 text-body text-description">
                  {build.expression}
                </pre>
                {build.isDraft && (
                  <p className="text-body text-description">
                    Complete the marked inputs or operations in the builder or SQL editor.
                  </p>
                )}
              </section>
              {preview.error && (
                <p role="status" className="whitespace-pre-wrap break-words text-body text-error">
                  {preview.error}
                </p>
              )}
            </>
          )}
          {build.validationError && (
            <p
              role="status"
              className={build.incomplete ? 'text-body text-description' : 'text-body text-error'}
            >
              {build.validationError}
            </p>
          )}
          <div>
            <Button
              variant="outline"
              size="sm"
              disabled={!draft.visual.roots.length && !draft.sql}
              onClick={build.clear}
            >
              Clear builder
            </Button>
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center gap-3 border-t border-surface-border bg-panel/20 py-4">
          {props.outputNameInput}
          <label className="flex min-w-0 flex-[1_1_16rem] flex-wrap items-center gap-2 text-body font-medium">
            Column name
            <Input
              className="min-w-32 flex-1"
              value={draft.column}
              onChange={(event) => {
                build.setColumn(event.target.value);
              }}
              disabled={!activeNode}
              placeholder="new_column"
            />
          </label>
          <DisabledReasonTooltip reason={apply.disabledReason}>
            <Button
              size="sm"
              disabled={!apply.canApply}
              onClick={() => {
                void apply.handleApply();
              }}
            >
              {apply.loading && <Loader2 className="animate-spin" />}
              Create Data Block
            </Button>
          </DisabledReasonTooltip>
        </CardFooter>
      </Card>
      <PreviewTable
        title="Preview"
        description={
          preview.outdated
            ? 'Outdated preview — showing the last successful result.'
            : 'Shows the computed column. Refreshes automatically as the expression changes.'
        }
        columns={preview.columns}
        schema={preview.schema}
        data={preview.data}
        pagination={preview.pagination}
        loading={preview.loading}
        error={draft.sql || preview.schema?.length ? null : preview.error}
        ready={preview.ready || Boolean(preview.schema?.length)}
        readyMessage={
          !activeNode
            ? 'Select an input Data Block.'
            : 'Configure an expression to preview results.'
        }
        page={preview.page}
        pageSize={preview.pageSize}
        onPageSizeChange={preview.setPageSize}
        onPageChange={preview.setPage}
      />
    </div>
  );
}

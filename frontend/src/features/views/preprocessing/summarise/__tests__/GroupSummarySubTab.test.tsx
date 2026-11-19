import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateDay, Field, Int64, Utf8 } from 'apache-arrow';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { BuilderInput } from '../../builder/builderTypes';
import { GroupSummarySubTab } from '../GroupSummarySubTab';

vi.mock('@/features/workspace/common/hooks/useWorkspaceActions', () => ({
  useWorkspaceActions: () => ({ createDerivedNode: vi.fn() }),
}));
vi.mock('../../builder/BuilderToolCard', () => ({
  BuilderToolCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

window.HTMLElement.prototype.scrollIntoView = vi.fn();

const columns: BuilderInput['columns'] = [
  { name: 'speaker', kind: 'text', typeLabel: 'text', field: new Field('speaker', new Utf8()) },
  { name: 'speech', kind: 'text', typeLabel: 'text', field: new Field('speech', new Utf8()) },
  {
    name: 'year',
    kind: 'number',
    typeLabel: 'whole number',
    field: new Field('year', new Int64()),
  },
  { name: 'held', kind: 'date', typeLabel: 'date', field: new Field('held', new DateDay()) },
];

describe('Aggregate: the columns to summarise', () => {
  it("shows each column's type as the Data Editor's symbol, not as words", async () => {
    const user = userEvent.setup();
    render(
      <GroupSummarySubTab
        input={{ id: 'node-1', name: 'speeches', column: 'speech', columns }}
        workspaceId="workspace-1"
        onAlert={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Group by column' }));
    await user.click(screen.getByRole('option', { name: 'speaker' }));

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByTitle('speech')).toBeInTheDocument();
    expect(within(rows[0]).getByTitle('text')).toHaveTextContent('Aa');
    expect(within(rows[1]).getByTitle('whole number')).toHaveTextContent('123');
    expect(within(rows[2]).getByTitle('date')).toBeInTheDocument();
    expect(screen.queryByText('whole number')).not.toBeInTheDocument();
    // The summary menus keep their names.
    expect(screen.getByRole('combobox', { name: 'Summary of year' })).toBeInTheDocument();
    // The chosen group column, outside the list, carries its symbol too.
    expect(screen.getAllByTitle('text')).toHaveLength(2);
  });
});

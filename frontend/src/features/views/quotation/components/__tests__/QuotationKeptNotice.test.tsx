import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceNodeInfo } from '@/api';
import { QuotationKeptNotice } from '../QuotationKeptNotice';
import { keptQuotationBlocks } from '../keptQuotationBlocks';

const mocks = vi.hoisted(() => ({ deleteNode: vi.fn() }));
vi.mock('@/features/workspace/common/hooks/useWorkspaceActions', () => ({
  useWorkspaceActions: () => ({ deleteNode: mocks.deleteNode }),
}));

const kept = (sourceId: string) =>
  ({
    id: 'kept-1',
    name: 'Obesity · quotations in progress',
    shape: [1200, 2],
    provenance: {
      type: 'derivation',
      operation: { kind: 'quotation_progress', column: 'document', engine_type: 'local' },
      inputs: [{ role: 'source', value: { type: 'node', node_id: sourceId } }],
    },
  }) as unknown as WorkspaceNodeInfo;

describe('QuotationKeptNotice (issue 381)', () => {
  beforeEach(() => {
    mocks.deleteNode.mockReset().mockResolvedValue(undefined);
  });

  it('finds the kept quotations of this Data Block only', () => {
    expect(keptQuotationBlocks([kept('obesity'), kept('other')], 'obesity')).toEqual([
      { id: 'kept-1', name: 'Obesity · quotations in progress', texts: 1200 },
    ]);
  });

  it('says a Run continues from kept quotations and removes them after asking', async () => {
    const user = userEvent.setup();
    render(
      <QuotationKeptNotice
        nodes={[kept('obesity')]}
        sourceNodeId="obesity"
        checkedCount={null}
        documentCount={null}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      /Quotations for 1,200 texts from a Run that didn't finish are kept in .*Run continues from there\./,
    );
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(mocks.deleteNode).toHaveBeenCalledWith('kept-1');
    });
  });

  it('marks a Run that Stop kept', () => {
    render(
      <QuotationKeptNotice
        nodes={[kept('obesity')]}
        sourceNodeId="obesity"
        checkedCount={5000}
        documentCount={26163}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      'Stopped early: 5,000 of 26,163 documents checked. Run continues from there.',
    );
  });
});

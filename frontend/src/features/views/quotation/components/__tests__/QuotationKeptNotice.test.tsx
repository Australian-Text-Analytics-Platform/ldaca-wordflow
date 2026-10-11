import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceNodeInfo } from '@/api';
import { QuotationKeptNotice } from '../QuotationKeptNotice';
import { keptQuotationBlocks, resumesFromKeptQuotations } from '../keptQuotationBlocks';

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
    const blocks = keptQuotationBlocks([kept('obesity'), kept('other')], 'obesity');
    expect(blocks).toEqual([
      {
        id: 'kept-1',
        name: 'Obesity · quotations in progress',
        texts: 1200,
        column: 'document',
        engineType: 'local',
        engineId: null,
      },
    ]);
    // Run reads Resume only for the same column and engine.
    expect(
      resumesFromKeptQuotations(blocks, {
        column: 'document',
        engineType: 'local',
        engineId: null,
      }),
    ).toBe(true);
    expect(
      resumesFromKeptQuotations(blocks, { column: 'title', engineType: 'local', engineId: null }),
    ).toBe(false);
    expect(
      resumesFromKeptQuotations(blocks, {
        column: 'document',
        engineType: 'remote',
        engineId: 'x',
      }),
    ).toBe(false);
  });

  it('says a Run continues from kept quotations and removes them after asking', async () => {
    const user = userEvent.setup();
    render(
      <QuotationKeptNotice
        nodes={[kept('obesity')]}
        sourceNodeId="obesity"
        checkedCount={null}
        documentCount={null}
        settings={{ column: 'document', engineType: 'local', engineId: null }}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      /Quotations for 1,200 texts from a Run that didn't finish are kept in .*Resume continues from there\./,
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
        settings={{ column: 'document', engineType: 'local', engineId: null }}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      'Stopped early: 5,000 of 26,163 documents checked. Resume continues from there.',
    );
  });

  it('says which text column resumes kept quotations of another column', () => {
    render(
      <QuotationKeptNotice
        nodes={[kept('obesity')]}
        sourceNodeId="obesity"
        checkedCount={null}
        documentCount={null}
        settings={{ column: 'first_sentence', engineType: 'local', engineId: null }}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      'Choose the “document” text column to resume.',
    );
  });
});

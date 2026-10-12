import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnotationClassDescriptionsEditor } from '../AnnotationClassDescriptionsEditor';

const mocks = vi.hoisted(() => ({
  rows: [] as { class: string; description: string }[],
  save: vi.fn(),
}));

vi.mock('../../hooks/useAnnotationClassDescriptions', () => ({
  normalizeClassDescriptionRows: (rows: { class: string; description: string }[] = []) =>
    rows.map((row) => ({ ...row })),
  useAnnotationClassDescriptions: () => ({
    canLoad: true,
    rows: mocks.rows,
    query: { isError: false, isLoading: false },
  }),
}));
vi.mock('@/features/workspace/common/hooks/useWorkspaceActions', () => ({
  useWorkspaceActions: () => ({ saveAnnotationClasses: mocks.save }),
}));

const renderEditor = () =>
  render(
    <AnnotationClassDescriptionsEditor
      workspaceId="ws"
      nodeId="codebook"
      classColumn="class"
      descriptionColumn="description"
    />,
  );

describe('AnnotationClassDescriptionsEditor codebook check (issue 389)', () => {
  beforeEach(() => {
    mocks.save.mockReset().mockResolvedValue(undefined);
  });

  it('suggests a fix on the card and lets the person choose a description', async () => {
    const user = userEvent.setup();
    mocks.rows = [
      { class: 'protest', description: 'Reports of protests' },
      { class: 'other', description: 'Anything else' },
      { class: 'protest', description: 'Rallies or activism' },
    ];
    renderEditor();

    expect(screen.getByRole('status')).toHaveTextContent(
      '“protest” has 2 different descriptions. Choose one, merge them, or rename one of the codes.',
    );
    expect(screen.getByRole('status')).toHaveTextContent('AI Preview and Run wait');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('group', { name: 'Description for “protest”' })).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Use description 2 for protest' }));

    expect(within(dialog).queryByRole('status')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.save.mock.calls[0]?.[3]).toEqual([
      { class: 'protest', description: 'Rallies or activism' },
      { class: 'other', description: 'Anything else' },
    ]);
  });

  it('merges descriptions or removes repeated rows only when asked', async () => {
    const user = userEvent.setup();
    mocks.rows = [
      { class: 'protest', description: 'Reports of protests' },
      { class: 'other', description: 'Anything else' },
      { class: 'protest', description: 'Rallies' },
      { class: 'other', description: 'Anything else' },
    ];
    renderEditor();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('status')).toHaveTextContent(
      '“other” appears more than once with the same description. Remove the repeated rows.',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Merge the descriptions for protest' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Remove repeated rows' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.save.mock.calls[0]?.[3]).toEqual([
      { class: 'protest', description: 'Reports of protests; Rallies' },
      { class: 'other', description: 'Anything else' },
    ]);
  });

  it('shows no suggestion for a clean codebook', () => {
    mocks.rows = [
      { class: 'protest', description: 'Reports of protests' },
      { class: 'other', description: 'Anything else' },
    ];
    renderEditor();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

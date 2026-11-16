import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useCodebookDraftStore } from '../../codebookDraftStore';
import { AnnotationClassDescriptionsEditor } from '../AnnotationClassDescriptionsEditor';

const mocks = vi.hoisted(() => ({
  rows: [] as { class: string; description: string }[],
  taskContext: '',
  scale: false,
  outsideScale: [] as string[],
  save: vi.fn(),
}));

vi.mock('../../hooks/useAnnotationClassDescriptions', () => ({
  normalizeClassDescriptionRows: (rows: { class: string; description: string }[] = []) =>
    rows.map((row) => ({ ...row })),
  useAnnotationClassDescriptions: () => ({
    canLoad: true,
    rows: mocks.rows,
    taskContext: mocks.taskContext,
    scale: mocks.scale,
    outsideScale: mocks.outsideScale,
    query: { isError: false, isLoading: false },
  }),
}));
vi.mock('@/features/workspace/common/hooks/useWorkspaceActions', () => ({
  useWorkspaceActions: () => ({ saveAnnotationClasses: mocks.save }),
}));

// The app provides tooltips from its layout; the help icons need one here.
const renderEditor = () =>
  render(
    <TooltipProvider>
      <AnnotationClassDescriptionsEditor
        workspaceId="ws"
        nodeId="codebook"
        classColumn="class"
        descriptionColumn="description"
      />
    </TooltipProvider>,
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

    // Matched by text: the dialog also holds the drag-and-drop live region (role status).
    expect(within(dialog).queryByText(/different descriptions/)).toBeNull();
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

    expect(within(dialog).getByText(/appears more than once/)).toHaveTextContent(
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

describe('AnnotationClassDescriptionsEditor Task context (issue 408)', () => {
  beforeEach(() => {
    mocks.save.mockReset().mockResolvedValue(undefined);
    mocks.rows = [{ class: 'support', description: 'Supports the claim' }];
    mocks.taskContext = '';
  });

  it('saves the Task context as one reserved row after the codes', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/Task context/),
      '  Posts from a workers forum.  ',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.save.mock.calls[0]?.[3]).toEqual([
      { class: 'support', description: 'Supports the claim' },
      { class: '__task_context__', description: 'Posts from a workers forum.' },
    ]);
  });

  it('shows a saved Task context and removes the row when it is cleared', async () => {
    const user = userEvent.setup();
    mocks.taskContext = 'Posts from a workers forum.';
    renderEditor();

    expect(screen.getByText('Task context:')).toBeInTheDocument();
    expect(screen.getByText(/Posts from a workers forum\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');
    const field = within(dialog).getByLabelText(/Task context/);
    expect(field).toHaveValue('Posts from a workers forum.');
    await user.clear(field);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.save.mock.calls[0]?.[3]).toEqual([
      { class: 'support', description: 'Supports the claim' },
    ]);
  });

  it('refuses a code named like the reserved row', async () => {
    const user = userEvent.setup();
    mocks.rows = [{ class: '__Task_Context__', description: '' }];
    renderEditor();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));

    expect(mocks.save).not.toHaveBeenCalled();
  });
});

describe('AnnotationClassDescriptionsEditor ordered scale (Chao, 16 Nov 2026)', () => {
  beforeEach(() => {
    mocks.save.mockReset().mockResolvedValue(undefined);
    mocks.rows = [
      { class: 'High', description: 'Asks for action today' },
      { class: 'Low', description: 'No time pressure' },
    ];
    mocks.taskContext = 'Support emails.';
    mocks.scale = false;
    mocks.outsideScale = [];
    useCodebookDraftStore.setState({ drafts: {} });
  });

  it('turns the codes into levels and saves the scale row before the Task context', async () => {
    const user = userEvent.setup();
    renderEditor();
    expect(screen.queryByTestId('codebook-scale-note')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');
    // Every code can be dragged into order, categories too.
    expect(within(dialog).getByRole('button', { name: 'Drag code 1 to reorder' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Drag code 2 to reorder' })).toBeVisible();
    await user.click(within(dialog).getByRole('switch', { name: 'Ordered scale' }));
    expect(within(dialog).getByTestId('codebook-unsaved-badge')).toBeVisible();
    expect(within(dialog).getByLabelText('Level 1')).toHaveValue('High');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.save.mock.calls[0]?.[3]).toEqual([
      { class: 'High', description: 'Asks for action today' },
      { class: 'Low', description: 'No time pressure' },
      { class: '__scale__', description: expect.stringContaining('Ordered scale') },
      { class: '__task_context__', description: 'Support emails.' },
    ]);
  });

  it('shows a saved scale on the card and drops the row when turned off', async () => {
    const user = userEvent.setup();
    mocks.scale = true;
    renderEditor();
    expect(screen.getByTestId('codebook-scale-note')).toHaveTextContent('Ordered scale:');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('switch', { name: 'Ordered scale' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.save.mock.calls[0]?.[3]).toEqual([
      { class: 'High', description: 'Asks for action today' },
      { class: 'Low', description: 'No time pressure' },
      { class: '__task_context__', description: 'Support emails.' },
    ]);
  });

  it('keeps Not applicable outside the scale, below the levels', async () => {
    const user = userEvent.setup();
    mocks.rows = [
      { class: 'Not applicable', description: 'Not a request' },
      { class: 'Low', description: 'No time pressure' },
      { class: 'High', description: 'Asks for action today' },
    ];
    renderEditor();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('switch', { name: 'Ordered scale' }));
    await user.click(within(dialog).getByRole('button', { name: 'Move code 1 outside the scale' }));
    // It moved below the levels, under its own heading.
    expect(within(dialog).getByText('Outside the scale (not levels)')).toBeVisible();
    expect(within(dialog).getByLabelText('Code 3')).toHaveValue('Not applicable');
    expect(within(dialog).getByRole('button', { name: 'Make code 3 a level' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.save.mock.calls[0]?.[3]).toEqual([
      { class: 'Low', description: 'No time pressure' },
      { class: 'High', description: 'Asks for action today' },
      { class: '__scale__', description: expect.stringContaining('Ordered scale') },
      { class: 'Not applicable', description: 'Not a request' },
      { class: '__task_context__', description: 'Support emails.' },
    ]);
  });

  it('reads codes below the scale row as outside the scale', async () => {
    const user = userEvent.setup();
    mocks.scale = true;
    mocks.rows = [
      { class: 'Low', description: 'No time pressure' },
      { class: 'High', description: 'Asks for action today' },
      { class: 'Not applicable', description: 'Not a request' },
    ];
    mocks.outsideScale = ['Not applicable'];
    renderEditor();
    expect(screen.getByTestId('codebook-scale-note')).toHaveTextContent(
      'Outside the scale: Not applicable.',
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByTestId('codebook-unsaved-badge')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Make code 3 a level' }));
    expect(within(dialog).getByTestId('codebook-unsaved-badge')).toBeVisible();
    expect(within(dialog).getByLabelText('Level 3')).toHaveValue('Not applicable');
  });

  it('needs at least two levels on a scale', async () => {
    const user = userEvent.setup();
    mocks.scale = true;
    mocks.rows = [
      { class: 'Low', description: '' },
      { class: 'Not applicable', description: '' },
    ];
    mocks.outsideScale = ['Not applicable'];
    renderEditor();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));

    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('refuses a code named like the scale row', async () => {
    const user = userEvent.setup();
    mocks.rows = [{ class: '__SCALE__', description: '' }];
    renderEditor();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));

    expect(mocks.save).not.toHaveBeenCalled();
  });
});

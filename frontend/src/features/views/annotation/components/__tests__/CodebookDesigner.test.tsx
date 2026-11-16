import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { AnnotationProviderConfigurationView } from '@/features/provider-credentials/providerCredentialsStore';
import {
  type CodeDesignerSettings,
  type DesignerOutcome,
  type DesignerStage,
  parseCodeDesignerSettings,
} from '../../codebookDesigner';
import type * as CodebookDesignerModule from '../../codebookDesigner';
import { useCodebookDraftStore } from '../../codebookDraftStore';
import { AnnotationClassDescriptionsEditor } from '../AnnotationClassDescriptionsEditor';

const mocks = vi.hoisted(() => ({
  rows: [] as { class: string; description: string }[],
  taskContext: '',
  scale: false,
  outsideScale: [] as string[],
  save: vi.fn(),
  run: vi.fn(),
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
vi.mock('../../codebookDesigner', async (importOriginal) => ({
  ...(await importOriginal<typeof CodebookDesignerModule>()),
  runCodebookDesigner: mocks.run,
}));
vi.mock('../ModelNameCombobox', () => ({
  ModelNameCombobox: ({
    id,
    value,
    onChange,
  }: {
    id: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <input
      id={id}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  ),
}));
vi.mock('../AddAnnotationProviderDialog', () => ({ AddAnnotationProviderDialog: () => null }));

const provider = {
  id: 'provider-1',
  name: 'OpenAI',
  provider: 'openai',
  base_url: null,
  has_api_key: true,
  credentialRevision: 1,
} as unknown as AnnotationProviderConfigurationView;

const onSettingsChange = vi.fn();

function Harness({ initial = {} }: { initial?: Partial<CodeDesignerSettings> }) {
  const [settings, setSettings] = useState<CodeDesignerSettings>({
    ...parseCodeDesignerSettings(undefined),
    ...initial,
  });
  return (
    <TooltipProvider>
      <AnnotationClassDescriptionsEditor
        workspaceId="ws"
        nodeId="codebook"
        classColumn="class"
        descriptionColumn="description"
        designer={{
          tabId: 'tab-1',
          settings,
          onSettingsChange: (patch) => {
            onSettingsChange(patch);
            setSettings((current) => ({ ...current, ...patch }));
          },
          source: { nodeId: 'tweets', name: 'tweets', textColumn: 'text' },
          configurations: [provider],
          providerModels: { 'provider-1': 'gpt-test' },
          fallbackProviderId: 'provider-1',
          fallbackModel: 'gpt-test',
        }}
      />
    </TooltipProvider>
  );
}

const draftOutcome: DesignerOutcome = {
  kind: 'draft',
  codes: [
    { name: 'Promise', definition: 'Jobs created or protected.' },
    { name: 'Cuts', definition: 'Jobs lost or at risk.' },
    { name: 'Other', definition: 'Anything else.' },
  ],
  sampled: 100,
};

describe('AI Code Designer in the Edit codebook window (Chao, 15 Nov 2026)', () => {
  beforeEach(() => {
    mocks.rows = [];
    mocks.taskContext = '';
    mocks.scale = false;
    mocks.outsideScale = [];
    mocks.save.mockReset().mockResolvedValue(undefined);
    mocks.run.mockReset();
    onSettingsChange.mockReset();
    useCodebookDraftStore.setState({ drafts: {} });
  });

  it('waits for a brief, then drafts codes into the window unsaved', async () => {
    const user = userEvent.setup();
    mocks.run.mockImplementation(
      ({ onStage }: { onStage: (stage: DesignerStage, sampled?: number) => void }) => {
        onStage('waiting', 100);
        return Promise.resolve(draftOutcome);
      },
    );
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const editor = screen.getByRole('dialog');
    const designButton = within(editor).getByRole('button', { name: 'AI Code Designer' });
    expect(designButton).toBeDisabled();

    await user.type(within(editor).getByLabelText(/Brief for the AI Code Designer/), 'Jobs talk');
    expect(within(editor).getByTestId('codebook-brief-words')).toHaveTextContent('2 / 250 words');
    // The button is drawn afresh once it has no disabled reason.
    await user.click(within(editor).getByRole('button', { name: 'AI Code Designer' }));

    const designer = await screen.findByTestId('codebook-designer-dialog');
    expect(within(designer).getByTestId('codebook-designer-disclaimer')).toHaveTextContent(
      'Sends up to 100 texts from tweets',
    );
    // The system prompt shows only under Advanced.
    expect(within(designer).queryByLabelText('System prompt')).toBeNull();
    await user.click(
      within(designer).getByRole('switch', { name: "Show the designer's system prompt" }),
    );
    expect(
      (within(designer).getByLabelText('System prompt') as HTMLTextAreaElement).value,
    ).toContain('first-draft codebook');
    await user.click(within(designer).getByRole('button', { name: 'Design codebook' }));

    await waitFor(() => expect(screen.queryByTestId('codebook-designer-dialog')).toBeNull());
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws',
        nodeId: 'tweets',
        request: expect.objectContaining({
          brief: 'Jobs talk',
          max_classes: 3,
          sample_size: 100,
          reasoning_effort: 'high',
          text_column: 'text',
          model: 'gpt-test',
        }),
      }),
    );
    expect(within(editor).getByLabelText('Code 1')).toHaveValue('Promise');
    expect(within(editor).getByLabelText('Code 3')).toHaveValue('Other');
    expect(within(editor).getByTestId('codebook-unsaved-badge')).toHaveTextContent(
      'AI draft, not saved',
    );

    // Saving the draft as it came keeps the brief in step.
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ briefStale: false, designedSignature: expect.any(String) }),
    );
  });

  it('designs an ordered scale when the codebook is a scale', async () => {
    const user = userEvent.setup();
    mocks.scale = true;
    mocks.run.mockResolvedValue({
      kind: 'draft',
      codes: [
        { name: '1 Low', definition: 'No time pressure.', outsideScale: false },
        { name: '2 High', definition: 'Asks for action today.', outsideScale: false },
        { name: 'Not applicable', definition: 'Not a request.', outsideScale: true },
      ],
      sampled: 100,
    } satisfies DesignerOutcome);
    render(<Harness initial={{ brief: 'How urgent is the email?' }} />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const editor = screen.getByRole('dialog');
    expect(within(editor).getByLabelText('Maximum levels')).toBeVisible();
    expect(within(editor).getByText('plus “Not applicable”')).toBeVisible();
    await user.click(within(editor).getByRole('button', { name: 'AI Code Designer' }));

    const designer = await screen.findByTestId('codebook-designer-dialog');
    expect(designer).toHaveTextContent('Drafts an ordered scale of up to 3 levels');
    await user.click(
      within(designer).getByRole('switch', { name: "Show the designer's system prompt" }),
    );
    expect(
      (within(designer).getByLabelText('System prompt') as HTMLTextAreaElement).value,
    ).toContain('first-draft ordered scale');
    await user.click(within(designer).getByRole('button', { name: 'Design codebook' }));

    await waitFor(() => expect(screen.queryByTestId('codebook-designer-dialog')).toBeNull());
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          scale: true,
          system_prompt: expect.stringContaining('first-draft ordered scale'),
        }),
      }),
    );
    expect(within(editor).getByLabelText('Level 1')).toHaveValue('1 Low');
    expect(within(editor).getByLabelText('Code 3')).toHaveValue('Not applicable');
    expect(within(editor).getByRole('button', { name: 'Make code 3 a level' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(editor).getByRole('switch', { name: 'Ordered scale' })).toBeChecked();
  });

  it('warns before replacing existing codes, and suggests a fresh codebook', async () => {
    const user = userEvent.setup();
    mocks.rows = [{ class: 'Mine', description: 'Hand-made.' }];
    render(<Harness initial={{ brief: 'Jobs talk' }} />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'AI Code Designer' }));

    const warning = screen.getByRole('alertdialog');
    expect(warning).toHaveTextContent('Replace the codes in this codebook?');
    expect(warning).toHaveTextContent('Create new');
    await user.click(within(warning).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('codebook-designer-dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'AI Code Designer' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Continue' }),
    );
    expect(await screen.findByTestId('codebook-designer-dialog')).toBeVisible();
  });

  it('locks the designer while it works; Stop cancels', async () => {
    const user = userEvent.setup();
    let release: ((outcome: DesignerOutcome) => void) | undefined;
    let signal: AbortSignal | undefined;
    mocks.run.mockImplementation(
      (args: { signal: AbortSignal; onStage: (stage: DesignerStage) => void }) => {
        signal = args.signal;
        args.onStage('waiting');
        return new Promise<DesignerOutcome>((resolve) => {
          release = resolve;
        });
      },
    );
    render(<Harness initial={{ brief: 'Jobs talk' }} />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'AI Code Designer' }));
    const designer = await screen.findByTestId('codebook-designer-dialog');
    await user.click(within(designer).getByRole('button', { name: 'Design codebook' }));

    expect(within(designer).getByTestId('codebook-designer-stage')).toHaveTextContent(
      'Waiting for gpt-test',
    );
    expect(within(designer).queryByRole('button', { name: 'Close' })).toBeNull();
    fireEvent.keyDown(designer, { key: 'Escape' });
    expect(screen.getByTestId('codebook-designer-dialog')).toBeVisible();

    await user.click(within(designer).getByRole('button', { name: 'Stop' }));
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      release?.({ kind: 'stopped' });
      await Promise.resolve();
    });
    expect(await within(designer).findByText('Stopped. Nothing was changed.')).toBeVisible();
  });

  it('keeps typed changes when the window closes, and asks before Cancel discards them', async () => {
    const user = userEvent.setup();
    mocks.rows = [{ class: 'Mine', description: 'Hand-made.' }];
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.type(screen.getByLabelText('Code 1'), ' too');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('codebook-unsaved-note')).toHaveTextContent('unsaved changes');
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Code 1')).toHaveValue('Mine too');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const confirm = screen.getByRole('alertdialog');
    expect(confirm).toHaveTextContent('Discard unsaved changes?');
    await user.click(within(confirm).getByRole('button', { name: 'Discard' }));
    expect(screen.queryByTestId('codebook-unsaved-note')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Code 1')).toHaveValue('Mine');
  });

  it('greys the brief once codes are changed by hand and saved, until the brief is edited', async () => {
    const user = userEvent.setup();
    mocks.rows = [{ class: 'Mine', description: 'Hand-made.' }];
    render(<Harness initial={{ brief: 'Jobs talk' }} />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.type(screen.getByLabelText('Code 1'), ' too');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(onSettingsChange).toHaveBeenCalledWith({ briefStale: true });

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const brief = screen.getByLabelText(/Brief for the AI Code Designer/);
    expect(brief).toHaveAttribute('data-stale', 'true');
    expect(brief).toHaveValue('Jobs talk');
    expect(screen.getByRole('button', { name: 'AI Code Designer' })).toBeDisabled();

    await user.type(brief, '!');
    expect(brief).not.toHaveAttribute('data-stale');
    expect(screen.getByRole('button', { name: 'AI Code Designer' })).toBeEnabled();
  });
});

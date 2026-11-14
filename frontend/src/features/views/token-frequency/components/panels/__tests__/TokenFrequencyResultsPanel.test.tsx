import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TokenFrequencyResponse } from '@/api';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TokenFrequencyResultsPanel } from '../TokenFrequencyResultsPanel';

vi.mock('@/components/help/HelpIcon', () => ({ default: () => null }));
vi.mock('@/features/views/common/hooks/useDetectedColumnLanguage', () => ({
  useDetectedColumnLanguage: () => ({ detectedLanguage: null, isDetecting: false }),
}));
const { singleSectionSpy, unifiedSectionSpy } = vi.hoisted(() => ({
  singleSectionSpy: vi.fn(),
  unifiedSectionSpy: vi.fn(),
}));

vi.mock('../../results/TokenFrequencySingleTokenSection', () => ({
  TokenFrequencySingleTokenSection: (props: unknown) => {
    singleSectionSpy(props);
    return null;
  },
}));
vi.mock('../../results/TokenFrequencyUnifiedTokenSection', () => ({
  TokenFrequencyUnifiedTokenSection: (props: unknown) => {
    unifiedSectionSpy(props);
    return null;
  },
}));

const baseProps = {
  results: { statistics: [] } as unknown as TokenFrequencyResponse,
  isRunning: false,
  stopWords: 'the, and',
  onStopWordsChange: vi.fn(),
  onStopWordsApply: vi.fn(),
  onStopWordsListChange: vi.fn(),
  stopWordsLanguageSource: { workspaceId: 'workspace-1', nodeId: 'node-1', column: 'text' },
  onSortStopWords: vi.fn(),
  stopWordsEnabled: false,
  onStopWordsEnabledChange: vi.fn(),
  tokenLimitInput: '25',
  onTokenLimitInputChange: vi.fn(),
  onTokenLimitBlur: vi.fn(),
  applyCloudTokenLimit: vi.fn(),
  tokenLimitError: null,
  isApplyingTokenLimit: false,
  appliedStopCount: 2,
  normalizedNodeResults: [],
  nodeDisplayResults: [],
  lastCompareNodeIds: [],
  appliedStopSet: new Set<string>(),
  effectiveTokenLimit: 25,
  defaultTokenLimit: 25,
  computeDisplayName: vi.fn((nodeId: string) => nodeId),
  getColorForNode: vi.fn(() => '#2563eb'),
  onDownloadWordCloud: vi.fn(),
  onTokenClick: vi.fn(),
  onTokenRightClick: vi.fn(),
  registerWordCloudRef: vi.fn(),
  onDownloadFrequencyCsv: vi.fn(),
};

describe('TokenFrequencyResultsPanel stop words', () => {
  it('preserves saved words while disabled and exposes the enable action', async () => {
    const user = userEvent.setup();
    const onStopWordsEnabledChange = vi.fn();
    render(
      <TooltipProvider>
        <TokenFrequencyResultsPanel
          {...baseProps}
          onStopWordsEnabledChange={onStopWordsEnabledChange}
        />
      </TooltipProvider>,
    );

    // The list editor opens on request; the count stays in the settings row.
    expect(
      screen.queryByRole('textbox', { name: 'Stop words filter (2)' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit list' }));
    const editor = screen.getByRole('textbox', { name: 'Stop words filter (2)' });
    expect(editor).toHaveValue('the, and');
    expect(editor).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Apply Stop Words' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Default' })).not.toBeInTheDocument();
    // Picking a language switches the filter on, so the dropdown stays usable.
    expect(screen.getByRole('combobox', { name: 'Stop words language' })).toHaveTextContent(
      'Saved list (2 words)',
    );
    expect(screen.getByRole('combobox', { name: 'Stop words language' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Sort' })).toBeDisabled();

    await user.click(screen.getByRole('switch', { name: 'Enable stop words' }));
    expect(onStopWordsEnabledChange).toHaveBeenCalledWith(true);
  });

  it('switches the filter on after a list is picked while it is off (#238)', async () => {
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    const user = userEvent.setup();
    const onStopWordsEnabledChange = vi.fn();
    const onStopWordsListChange = vi.fn();
    render(
      <TooltipProvider>
        <TokenFrequencyResultsPanel
          {...baseProps}
          onStopWordsEnabledChange={onStopWordsEnabledChange}
          onStopWordsListChange={onStopWordsListChange}
        />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Stop words language' }));
    await user.click(screen.getByRole('option', { name: /^English \(\d+ words\)$/ }));

    await waitFor(() => {
      expect(onStopWordsEnabledChange).toHaveBeenCalledWith(true);
    });
    expect(onStopWordsListChange).toHaveBeenCalled();
  });

  it('places one persistent result-level filter before the Cloud/List selector', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <TooltipProvider>
        <TokenFrequencyResultsPanel {...baseProps} />
      </TooltipProvider>,
    );

    const filterCard = screen.getByTestId('token-frequency-token-filter-card');
    const filterInput = screen.getByRole('textbox', { name: 'Filter tokens' });
    const viewTabs = screen.getByTestId('token-frequency-results-view-tabs');

    expect(filterCard.compareDocumentPosition(viewTabs)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getAllByText('Filter tokens')).toHaveLength(1);
    expect(screen.getByTestId('token-frequency-token-filter-card-content')).toHaveClass(
      'flex-wrap',
    );

    await user.type(filterInput, 'pre*');
    await waitFor(() => {
      expect(singleSectionSpy.mock.lastCall?.[0]).toMatchObject({ tokenFilter: 'pre*' });
      expect(unifiedSectionSpy.mock.lastCall?.[0]).toMatchObject({ tokenFilter: 'pre*' });
    });

    await user.click(screen.getByRole('tab', { name: 'List view' }));
    expect(filterInput).toHaveValue('pre*');

    rerender(
      <TooltipProvider>
        <TokenFrequencyResultsPanel
          {...baseProps}
          results={{ statistics: [] } as unknown as TokenFrequencyResponse}
        />
      </TooltipProvider>,
    );
    expect(filterInput).toHaveValue('pre*');

    await user.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(filterInput).toHaveValue('');
  });

  it('keeps display settings in one row that wraps by the pane, not the window', () => {
    render(
      <TooltipProvider>
        <TokenFrequencyResultsPanel {...baseProps} />
      </TooltipProvider>,
    );

    const settings = screen.getByTestId('token-frequency-display-settings');
    expect(settings.innerHTML).not.toMatch(/\b(sm|md|lg):grid-cols/);
    expect(screen.getByRole('spinbutton', { name: 'Cloud display limit (10–100)' })).toBeVisible();
    expect(screen.getByRole('spinbutton', { name: /List display limit/ })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit list' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('shows which words are hidden while the list is closed and the filter is on', () => {
    render(
      <TooltipProvider>
        <TokenFrequencyResultsPanel
          {...baseProps}
          stopWordsEnabled
          stopWords="the, and, of, a, to, in, is, it, that, was"
        />
      </TooltipProvider>,
    );

    expect(screen.getByTestId('token-frequency-stop-words-preview')).toHaveTextContent(
      'Hidden words: the, and, of, a, to, in, is, it and 2 more',
    );
  });

  it('opens the list when the filter is switched on with no words yet', async () => {
    const user = userEvent.setup();
    const onStopWordsEnabledChange = vi.fn();
    render(
      <TooltipProvider>
        <TokenFrequencyResultsPanel
          {...baseProps}
          stopWords=""
          appliedStopCount={0}
          onStopWordsEnabledChange={onStopWordsEnabledChange}
        />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('switch', { name: 'Enable stop words' }));
    expect(onStopWordsEnabledChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('textbox', { name: 'Stop words filter (0)' })).toBeInTheDocument();
  });
});

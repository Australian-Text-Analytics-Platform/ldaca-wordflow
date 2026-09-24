import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StopWordListSource } from '../../utils/stopWordListSources';
import { WORDFLOW_CLASSIC_STOPWORD_LISTS } from '@/lib/wordflowClassicStopwords';
import { WORDFLOW_CLASSIC_STOPWORDS } from '@/lib/wordflowClassicStopwordsData';
import { StopWordsLanguageSelect } from '../StopWordsLanguageSelect';

vi.mock('@/features/views/common/hooks/useDetectedColumnLanguage', () => ({
  useDetectedColumnLanguage: () => ({ detectedLanguage: 'en', isDetecting: false }),
}));

function Harness({
  initialWords = [],
  sources = [],
}: {
  initialWords?: string[];
  sources?: StopWordListSource[];
}) {
  const [words, setWords] = useState(initialWords);
  return (
    <>
      <StopWordsLanguageSelect
        words={words}
        onWordsChange={setWords}
        workspaceId="workspace-1"
        nodeId="node-1"
        column="text"
        sources={sources}
      />
      <output data-testid="words">{words.join('|')}</output>
    </>
  );
}

const pickOption = async (user: ReturnType<typeof userEvent.setup>, name: string | RegExp) => {
  await user.click(screen.getByRole('combobox', { name: 'Stop words language' }));
  await user.click(screen.getByRole('option', { name }));
};

describe('StopWordsLanguageSelect', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('stacks real language lists on top of custom words', async () => {
    const user = userEvent.setup();
    render(<Harness initialWords={['university']} />);

    await pickOption(user, 'English (Detected)');
    await waitFor(() => {
      expect(screen.getByTestId('words').textContent).toContain('about');
    });
    await user.click(screen.getByRole('combobox', { name: 'Stop words language' }));
    await user.click(screen.getByRole('option', { name: /^Show all languages/ }));
    await user.click(screen.getByRole('option', { name: 'Chinese' }));
    await waitFor(() => {
      expect(screen.getByTestId('words').textContent).toContain('的');
    });

    const words = screen.getByTestId('words').textContent.split('|');
    expect(words[0]).toBe('university');
    expect(words).toContain('about');
    expect(new Set(words).size).toBe(words.length);
    expect(screen.getByRole('combobox', { name: 'Stop words language' })).toHaveTextContent(
      `Saved list (${String(words.length)} words)`,
    );
  });

  it('clears the list back to the language prompt', async () => {
    const user = userEvent.setup();
    render(<Harness initialWords={['the', 'and']} />);

    await pickOption(user, 'Clear stop words');

    expect(screen.getByTestId('words')).toHaveTextContent('');
    expect(screen.getByRole('combobox', { name: 'Stop words language' })).toHaveTextContent(
      'Select language',
    );
  });

  it("appends a copy of another tab's list under From other tabs", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initialWords={['the']}
        sources={[
          {
            tabId: 'freq-1',
            label: 'Frequency · Analysis 1',
            words: ['university', 'the', 'staff'],
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Stop words language' }));
    expect(screen.getByText('From other tabs')).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Frequency · Analysis 1 (3 words)' }));

    expect(screen.getByTestId('words')).toHaveTextContent('the|university|staff');
  });

  it('hides the From other tabs group when no other tab has a list', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('combobox', { name: 'Stop words language' }));

    expect(screen.queryByText('From other tabs')).not.toBeInTheDocument();
  });

  it('orders groups as other tabs, Wordflow classic lists, then the stopword library', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        sources={[{ tabId: 'freq-1', label: 'Frequency · Analysis 1', words: ['university'] }]}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Stop words language' }));
    const labels = ['From other tabs', 'Wordflow classic lists', 'Languages (stopword library)'];
    const positions = labels.map((label) => document.body.textContent.indexOf(label));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((left, right) => left - right)).toEqual(positions);
  });

  it('appends the revised Wordflow classic English list', async () => {
    const user = userEvent.setup();
    render(<Harness initialWords={['university']} />);

    await pickOption(user, 'English (231 words)');

    await waitFor(() => {
      expect(screen.getByTestId('words').textContent.split('|')).toEqual(
        expect.arrayContaining(['university', 'um', 'uh', 'aren', 'ought']),
      );
    });
  });

  it('keeps classic list metadata in step with the restored words', () => {
    for (const list of WORDFLOW_CLASSIC_STOPWORD_LISTS) {
      expect(WORDFLOW_CLASSIC_STOPWORDS[list.iso6391]).toHaveLength(list.wordCount);
    }
    expect(Object.keys(WORDFLOW_CLASSIC_STOPWORDS).sort()).toEqual(
      WORDFLOW_CLASSIC_STOPWORD_LISTS.map((list) => list.iso6391).sort(),
    );
  });

  it('shows only the detected library language until the list is expanded', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('combobox', { name: 'Stop words language' }));
    expect(screen.getByRole('option', { name: 'English (Detected)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Afrikaans' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /^Show all languages \(\d+\)$/ }));

    // The menu stays open and lists every other library language in place.
    expect(screen.getByRole('option', { name: 'Afrikaans' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'English (Detected)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^Show all languages/ })).not.toBeInTheDocument();

    // Closing collapses the list again for the next visit.
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('combobox', { name: 'Stop words language' }));
    expect(screen.queryByRole('option', { name: 'Afrikaans' })).not.toBeInTheDocument();
  });
});

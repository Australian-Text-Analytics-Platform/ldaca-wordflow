import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StopWordsLanguageSelect } from '../StopWordsLanguageSelect';

vi.mock('@/features/views/common/hooks/useDetectedColumnLanguage', () => ({
  useDetectedColumnLanguage: () => ({ detectedLanguage: 'en', isDetecting: false }),
}));

function Harness({ initialWords = [] }: { initialWords?: string[] }) {
  const [words, setWords] = useState(initialWords);
  return (
    <>
      <StopWordsLanguageSelect
        words={words}
        onWordsChange={setWords}
        workspaceId="workspace-1"
        nodeId="node-1"
        column="text"
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

    await pickOption(user, 'English (Recommended)');
    await waitFor(() => {
      expect(screen.getByTestId('words').textContent).toContain('about');
    });
    await pickOption(user, 'Chinese');
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
});

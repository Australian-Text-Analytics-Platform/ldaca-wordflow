import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { CodebookEditorSplit } from '../CodebookEditorSplit';

const STORAGE_KEY = 'ldaca.layout.codebookEditorBriefHeight';

describe('CodebookEditorSplit', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('puts the brief above a divider and the codebook below, each in its own pane', () => {
    render(
      <CodebookEditorSplit top={<p>Brief</p>}>
        <p>Task context</p>
        <p>Codes</p>
      </CodebookEditorSplit>,
    );
    expect(screen.getByTestId('codebook-editor-brief-pane')).toHaveTextContent('Brief');
    expect(screen.getByTestId('codebook-editor-codebook-pane')).toHaveTextContent(
      'Task contextCodes',
    );
    expect(
      screen.getByRole('separator', { name: 'Resize the brief and the codebook' }),
    ).toBeInTheDocument();
  });

  it('remembers a height set with the keyboard, and double-click resets it', () => {
    render(
      <CodebookEditorSplit top={<p>Brief</p>}>
        <p>Codes</p>
      </CodebookEditorSplit>,
    );
    const divider = screen.getByRole('separator');
    fireEvent.keyDown(divider, { key: 'ArrowDown' });
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    expect(stored).toBeGreaterThanOrEqual(64);
    expect(screen.getByTestId('codebook-editor-brief-pane')).toHaveStyle({
      height: `${String(stored)}px`,
    });

    fireEvent.doubleClick(divider);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId('codebook-editor-brief-pane')).not.toHaveStyle({
      height: `${String(stored)}px`,
    });
  });

  it('opens at the remembered height', () => {
    window.localStorage.setItem(STORAGE_KEY, '220');
    render(
      <CodebookEditorSplit top={<p>Brief</p>}>
        <p>Codes</p>
      </CodebookEditorSplit>,
    );
    expect(screen.getByTestId('codebook-editor-brief-pane')).toHaveStyle({ height: '220px' });
  });

  it('has no divider without a brief', () => {
    render(
      <CodebookEditorSplit top={null}>
        <p>Codes</p>
      </CodebookEditorSplit>,
    );
    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.getByTestId('codebook-editor-codebook-pane')).toHaveTextContent('Codes');
  });
});

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { NodeSelectionList, type NodeSelectionItem } from '../NodeSelectionList';
import { NodeColumnSelector } from '../NodeColumnSelector';

const name = 'A long corpus name with Unicode 文 and several identifying words';
const item: NodeSelectionItem = {
  kind: 'available',
  id: 'corpus',
  node: {
    id: 'corpus',
    name,
    color: null,
    document: 'text',
    tokenizerModel: null,
  },
};
function clip(element: HTMLElement, width = 80) {
  element.style.overflowX = 'hidden';
  Object.defineProperties(element, {
    scrollWidth: { configurable: true, value: 200 },
    clientWidth: { configurable: true, value: width },
  });
}
it('keeps a full name and selected value accessible through keyboard focus', async () => {
  render(
    <NodeSelectionList
      items={[item]}
      palette={['#2563eb']}
      maxCompare={2}
      renderNodeBody={() => (
        <NodeColumnSelector
          label="Stopword column"
          value="text"
          columns={['text']}
          onChange={vi.fn()}
        />
      )}
    />,
  );
  const nameElement = screen.getByText(name);
  clip(nameElement);
  fireEvent.focus(nameElement);
  await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent(name));
  fireEvent.blur(nameElement);
  clip(screen.getByText('text'));
  fireEvent.focus(screen.getByRole('combobox'));
  await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('text'));
  expect(screen.getByText('Stopword column:')).toBeInTheDocument();
});
it('keeps remove controls available for name-only and unavailable cards', () => {
  const remove = vi.fn();
  render(
    <NodeSelectionList
      items={[
        item,
        {
          kind: 'unavailable',
          id: 'gone',
          selection: { id: 'gone', name: 'Gone', column: 'text' },
        },
      ]}
      palette={['#2563eb']}
      maxCompare={2}
      onRemoveNode={remove}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: `Remove ${name}` }));
  expect(remove).toHaveBeenCalledWith('corpus');
  expect(screen.getByRole('group', { name: 'Gone unavailable' })).toHaveTextContent(
    'Selected column: text',
  );
});

it('opens name tooltips immediately and keeps color controls in the tinted header', async () => {
  render(
    <NodeSelectionList
      items={[item]}
      palette={['#2563eb']}
      maxCompare={2}
      renderHeaderControl={() => <button type="button">Color</button>}
      renderNodeBody={() => <span>Column controls</span>}
    />,
  );
  const header = screen.getByTestId('node-input-card-header');
  expect(header).toContainElement(screen.getByRole('button', { name: 'Color' }));
  expect(header.style.backgroundColor).toContain('color-mix');
  expect(header).not.toContainElement(screen.getByText('Column controls'));
  clip(screen.getByText(name));
  vi.useFakeTimers();
  try {
    fireEvent.pointerMove(screen.getByText(name), { pointerType: 'mouse' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent(name);
  } finally {
    vi.useRealTimers();
  }
});
it('uses a neutral header without color controls and no empty body for a name-only card', () => {
  render(<NodeSelectionList items={[item]} palette={['#2563eb']} maxCompare={2} />);
  expect(screen.getByTestId('node-input-card-header').style.backgroundColor).toBe('');
  expect(screen.queryByTestId('node-input-card-content')).not.toBeInTheDocument();
});

it('does not show a tooltip for a fully visible name or selected value', async () => {
  render(
    <NodeSelectionList
      items={[item]}
      palette={['#2563eb']}
      maxCompare={2}
      renderNodeBody={() => (
        <NodeColumnSelector label="Column" value="text" columns={['text']} onChange={vi.fn()} />
      )}
    />,
  );
  const title = screen.getByText(name);
  clip(title, 200);
  fireEvent.focus(title);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.blur(title);
  clip(screen.getByText('text'), 200);
  fireEvent.focus(screen.getByRole('combobox'));
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.blur(screen.getByRole('combobox'));
  clip(title);
  fireEvent.focus(title);
  await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent(name));
  fireEvent.blur(title);
  clip(title, 250);
  fireEvent.focus(title);
  await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
});

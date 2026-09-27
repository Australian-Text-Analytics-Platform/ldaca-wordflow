import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { WorkspaceSelectionTabs } from '../WorkspaceSelectionTabs';

vi.mock('@/components/help/HelpIcon', () => ({
  default: ({ label }: { label?: string }) => <button type="button">{label}</button>,
}));

const tabs = [
  { id: 'node-1', label: 'zeta tweets', isActive: true },
  { id: 'node-2', label: 'Alpha speeches', isActive: false },
  { id: 'node-3', label: 'beta letters', isActive: false },
];

beforeAll(() => {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => true);
});

afterAll(() => {
  vi.restoreAllMocks();
});

function renderSelectionTabs(
  overrides: Partial<Parameters<typeof WorkspaceSelectionTabs>[0]> = {},
) {
  const props = {
    shouldShowTabs: true,
    tabs,
    tabPosition: 1,
    totalTabs: 3,
    onTabChange: vi.fn(),
    onTabClose: vi.fn(),
    onTabReorder: vi.fn(),
    onTabRename: vi.fn(),
    ...overrides,
  };
  const view = render(<WorkspaceSelectionTabs {...props} />);
  return { ...props, ...view };
}

describe('WorkspaceSelectionTabs', () => {
  it('shows the Data Editor title, its help, and one tab per Data Block (issue 206)', () => {
    const { rerender, ...props } = renderSelectionTabs({ shouldShowTabs: false });
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();

    rerender(<WorkspaceSelectionTabs {...props} shouldShowTabs />);
    expect(screen.getByRole('heading', { name: 'Data Editor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Data Editor' })).toBeInTheDocument();
    const tablist = screen.getByRole('tablist', { name: 'Data Block tabs' });
    expect(within(tablist).getAllByRole('tab')).toHaveLength(3);
  });

  it('wires activate, close, and reorder intents to the selection owner', () => {
    const { onTabChange, onTabClose, onTabReorder } = renderSelectionTabs({
      tabs: tabs.slice(0, 2),
    });
    const [first, second] = screen.getAllByRole('tab');

    fireEvent.pointerDown(second!, { button: 0, pointerId: 1, clientX: 50 });
    fireEvent.pointerUp(second!, { pointerId: 1, clientX: 50 });
    fireEvent.click(screen.getAllByRole('button', { name: /close tab/i })[0]!);
    fireEvent.pointerDown(first!, { button: 0, pointerId: 2, clientX: 0 });
    fireEvent.pointerMove(first!, { pointerId: 2, clientX: 50 });
    fireEvent.pointerUp(first!, { pointerId: 2, clientX: 50 });

    expect(onTabChange).toHaveBeenCalledWith('node-2');
    expect(onTabClose).toHaveBeenCalledWith('node-1');
    expect(onTabReorder).toHaveBeenCalledWith(['node-2', 'node-1']);
  });

  it('renames the Data Block when its active tab is double-clicked', async () => {
    const user = userEvent.setup();
    const { onTabRename } = renderSelectionTabs();

    fireEvent.doubleClick(screen.getAllByRole('tab')[0]!);
    const input = screen.getByRole('textbox', { name: /rename tab/i });
    await user.clear(input);
    await user.type(input, 'tweets 2020{Enter}');

    expect(onTabRename).toHaveBeenCalledWith('node-1', 'tweets 2020');
  });

  it('lists every tab alphabetically and switches from the list', async () => {
    const user = userEvent.setup();
    const { onTabChange } = renderSelectionTabs();

    await user.click(screen.getByRole('button', { name: 'All Data Block tabs' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Alpha speeches',
      'beta letters',
      'zeta tweets',
    ]);
    await user.click(items[1]!);

    expect(onTabChange).toHaveBeenCalledWith('node-3');
  });
});

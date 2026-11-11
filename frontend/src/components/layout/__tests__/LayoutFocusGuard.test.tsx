import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useModalLayerStore } from '@/features/guidance/modalLayerStore';
import { useUIStore } from '@/stores';
import { useLayoutFocusStore } from '@/stores/layoutFocusStore';
import { LayoutFocusGuard } from '../LayoutFocusGuard';

const workspace = vi.hoisted(() => ({ id: 'project-1' }));
vi.mock('@/features/workspace/common/hooks/useWorkspaceData', () => ({
  useWorkspaceData: () => ({ currentWorkspaceId: workspace.id }),
}));

afterEach(() => {
  useLayoutFocusStore.setState({ maximised: null });
  useModalLayerStore.setState({ count: 0 });
  workspace.id = 'project-1';
});

const maximise = () => {
  act(() => {
    useLayoutFocusStore.getState().maximise('analysis');
  });
};

describe('LayoutFocusGuard', () => {
  it('restores the layout on Escape', () => {
    render(<LayoutFocusGuard />);
    maximise();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(useLayoutFocusStore.getState().maximised).toBeNull();
  });

  it('leaves Escape to a field, a menu, an open dialog, or whatever handled it', () => {
    render(
      <>
        <LayoutFocusGuard />
        <input aria-label="Search term" />
        <div role="menu">
          <button type="button">Item</button>
        </div>
      </>,
    );
    maximise();
    fireEvent.keyDown(screen.getByLabelText('Search term'), { key: 'Escape' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Item' }), { key: 'Escape' });
    expect(useLayoutFocusStore.getState().maximised).toBe('analysis');

    act(() => {
      useModalLayerStore.setState({ count: 1 });
    });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(useLayoutFocusStore.getState().maximised).toBe('analysis');
    act(() => {
      useModalLayerStore.setState({ count: 0 });
    });

    const handled = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    handled.preventDefault();
    document.body.dispatchEvent(handled);
    expect(useLayoutFocusStore.getState().maximised).toBe('analysis');

    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(useLayoutFocusStore.getState().maximised).toBe('analysis');
  });

  it('restores the layout when the view or the Project changes', () => {
    const { rerender } = render(<LayoutFocusGuard />);
    maximise();
    act(() => {
      useUIStore.getState().setCurrentView('concordance');
    });
    expect(useLayoutFocusStore.getState().maximised).toBeNull();

    maximise();
    workspace.id = 'project-2';
    rerender(<LayoutFocusGuard />);
    expect(useLayoutFocusStore.getState().maximised).toBeNull();
  });
});

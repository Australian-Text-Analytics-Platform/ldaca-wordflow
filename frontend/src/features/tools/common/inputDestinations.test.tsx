import type { ObjectRef } from '@/features/project/objects';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import {
  InputDestinationChooser,
  ToolInputScope,
  useInputDestination,
  useInputDestinations,
} from './inputDestinations';
import type { NodeAddRejection } from './nodeInputs/nodeInputsCore';
function Destination({
  label,
  add,
  disabled = false,
}: {
  label: string;
  add: (targets: ObjectRef[]) => NodeAddRejection[];
  disabled?: boolean;
}) {
  useInputDestination(label, add, disabled);
  return null;
}
beforeEach(() => useInputDestinations.setState({ destinations: [], selection: null }));
it('adds immediately to the sole active destination and reports rejected additions', () => {
  const add = vi.fn().mockReturnValue([{ nodeId: 'A', reason: 'already added' }]);
  const warning = vi.spyOn(toast, 'warning');
  render(
    <ToolInputScope value={{ base: 'one', tool: 'filter', active: true }}>
      <Destination label="Left input" add={add} />
    </ToolInputScope>,
  );
  act(() => useInputDestinations.getState().add('one', 'filter', ['A']));
  expect(add).toHaveBeenCalledExactlyOnceWith([{ schema: 'data', name: 'A' }]);
  expect(warning).toHaveBeenCalledWith('already added');
  expect(useInputDestinations.getState().selection).toBeNull();
});
it('registers the relative browser API base as a valid project scope', () => {
  const add = vi.fn(() => []);
  render(
    <ToolInputScope value={{ base: '', tool: 'filter', active: true }}>
      <Destination label="Input" add={add} />
    </ToolInputScope>,
  );
  act(() => useInputDestinations.getState().add('', 'filter', ['A']));
  expect(add).toHaveBeenCalledExactlyOnceWith([{ schema: 'data', name: 'A' }]);
});
it('chooses a labelled destination with the keyboard and cancels without changing inputs', async () => {
  const left = vi.fn(() => []),
    right = vi.fn(() => []),
    user = userEvent.setup();
  const view = render(
    <ToolInputScope value={{ base: 'one', tool: 'filter', active: true }}>
      <Destination label="Left input" add={left} />
      <Destination label="Right input" add={right} />
      <InputDestinationChooser base="one" tool="filter" />
    </ToolInputScope>,
  );
  act(() => useInputDestinations.getState().add('one', 'filter', ['A']));
  const choice = await screen.findByRole('button', { name: 'Right input' });
  choice.focus();
  await user.keyboard('{Enter}');
  expect(right).toHaveBeenCalledExactlyOnceWith([{ schema: 'data', name: 'A' }]);
  expect(left).not.toHaveBeenCalled();
  act(() => useInputDestinations.getState().add('one', 'filter', ['B']));
  await user.keyboard('{Escape}');
  expect(right).toHaveBeenCalledOnce();
  expect(useInputDestinations.getState().selection).toBeNull();
  view.unmount();
  expect(useInputDestinations.getState().destinations).toEqual([]);
});
it('does not route to disabled, inactive or another project destinations', () => {
  const add = vi.fn(() => []);
  render(
    <>
      <ToolInputScope value={{ base: 'one', tool: 'filter', active: false }}>
        <Destination label="Hidden" add={add} />
      </ToolInputScope>
      <ToolInputScope value={{ base: 'two', tool: 'filter', active: true }}>
        <Destination label="Other" add={add} />
        <Destination label="Disabled" add={add} disabled />
      </ToolInputScope>
    </>,
  );
  act(() => useInputDestinations.getState().add('one', 'filter', ['A']));
  expect(add).not.toHaveBeenCalled();
  expect(useInputDestinations.getState().destinations.map((item) => item.label)).toEqual(['Other']);
});
it('validates a drop against the current destination and project, including unmounts', () => {
  const add = vi.fn(() => [{ id: 'A', reason: 'This input is full.' }]);
  const view = render(
    <ToolInputScope value={{ base: 'one', tool: 'filter', active: true }}>
      <Destination label="Input" add={add} />
    </ToolInputScope>,
  );
  const id = useInputDestinations.getState().destinations[0]!.id;
  const drop = (base: string) =>
    useInputDestinations
      .getState()
      .drop(id, JSON.stringify({ base, target: { schema: 'data', name: 'A' } }));
  act(() => {
    drop('other');
    useInputDestinations.getState().drop(id, 'invalid');
  });
  expect(add).not.toHaveBeenCalled();
  act(() => drop('one'));
  expect(add).toHaveBeenCalledExactlyOnceWith([{ schema: 'data', name: 'A' }]);
  view.unmount();
  act(() => drop('one'));
  expect(add).toHaveBeenCalledOnce();
});

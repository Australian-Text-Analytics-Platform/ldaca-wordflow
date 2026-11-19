import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { AdvancedSection } from '../AdvancedSection';
import { useNudgeStore } from '@/features/nudges/nudgeStore';
import { ADVANCED_HINT_TEXT, AdvancedSwitch } from '../AdvancedSwitch';
import { ToolModeContext } from '../ToolModeContext';
import {
  dismissAdvancedHint,
  readAdvancedHintDismissed,
  readToolModeDeviceDefault,
  resolveToolAdvanced,
  TOOL_ADVANCED_SETTING,
  writeToolModeDeviceDefault,
} from '../toolMode';
import { useToolMode } from '../useToolMode';

beforeEach(() => {
  window.localStorage.clear();
});

describe('resolveToolAdvanced', () => {
  it("uses the tab's own choice first", () => {
    expect(
      resolveToolAdvanced({ stored: 'true', lastRunUsedAdvanced: false, deviceDefault: false }),
    ).toBe(true);
    expect(
      resolveToolAdvanced({ stored: 'false', lastRunUsedAdvanced: true, deviceDefault: true }),
    ).toBe(false);
  });

  it('opens a tab with no choice in Advanced when its last run used an advanced setting', () => {
    expect(
      resolveToolAdvanced({ stored: undefined, lastRunUsedAdvanced: true, deviceDefault: false }),
    ).toBe(true);
  });

  it("otherwise follows the tool's last choice on this device, Basic at first", () => {
    expect(
      resolveToolAdvanced({ stored: undefined, lastRunUsedAdvanced: false, deviceDefault: true }),
    ).toBe(true);
    expect(
      resolveToolAdvanced({ stored: undefined, lastRunUsedAdvanced: false, deviceDefault: false }),
    ).toBe(false);
  });
});

describe('the device default', () => {
  it('is Basic until a tool is switched, and is kept per tool', () => {
    expect(readToolModeDeviceDefault('trends')).toBe(false);
    writeToolModeDeviceDefault('trends', true);
    expect(readToolModeDeviceDefault('trends')).toBe(true);
    expect(readToolModeDeviceDefault('concordance')).toBe(false);
    writeToolModeDeviceDefault('trends', false);
    expect(readToolModeDeviceDefault('trends')).toBe(false);
  });

  it('falls back to Basic when storage is refused', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('refused');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('refused');
    });
    expect(readToolModeDeviceDefault('trends')).toBe(false);
    expect(() => {
      writeToolModeDeviceDefault('trends', true);
    }).not.toThrow();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

function Tool({
  settings,
  setSetting,
  lastRunUsedAdvanced = false,
}: {
  settings: Record<string, string>;
  setSetting: (key: string, value: string) => void;
  lastRunUsedAdvanced?: boolean;
}) {
  const mode = useToolMode({
    host: { settings, setSetting },
    viewId: 'trends',
    lastRunUsedAdvanced,
  });
  return (
    <TooltipProvider>
      <ToolModeContext value={mode}>
        <AdvancedSwitch />
        <p>Basic setting</p>
        <AdvancedSection>
          <p>Reference</p>
        </AdvancedSection>
      </ToolModeContext>
    </TooltipProvider>
  );
}

describe('a tool with advanced settings', () => {
  it('hides them in Basic and writes the choice to the tab and the device', async () => {
    const setSetting = vi.fn();
    render(<Tool settings={{}} setSetting={setSetting} />);
    const advanced = screen.getByRole('switch', { name: 'Advanced settings' });
    expect(advanced).not.toBeChecked();
    expect(screen.getByText('Basic setting')).toBeInTheDocument();
    expect(screen.queryByText('Reference')).not.toBeInTheDocument();

    await userEvent.click(advanced);
    expect(setSetting).toHaveBeenCalledWith(TOOL_ADVANCED_SETTING, 'true');
    expect(readToolModeDeviceDefault('trends')).toBe(true);
  });

  it('lists them together under Advanced settings when the tab is in Advanced', () => {
    render(<Tool settings={{ [TOOL_ADVANCED_SETTING]: 'true' }} setSetting={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'Advanced settings' })).toBeChecked();
    expect(screen.getByRole('group', { name: 'Advanced settings' })).toHaveTextContent('Reference');
  });

  it('opens in Advanced after a run that used an advanced setting', () => {
    render(<Tool settings={{}} setSetting={vi.fn()} lastRunUsedAdvanced />);
    expect(screen.getByText('Reference')).toBeInTheDocument();
  });

  it('shows no switch and no advanced settings outside a tool with modes', () => {
    render(
      <TooltipProvider>
        <AdvancedSwitch />
        <AdvancedSection>
          <p>Reference</p>
        </AdvancedSection>
      </TooltipProvider>,
    );
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('Reference')).not.toBeInTheDocument();
  });
});

describe('the Advanced hint', () => {
  const hint = () => screen.queryByRole('note');

  /** A tool whose mode the test sets directly. */
  const ModeTool = ({ viewId, advanced }: { viewId?: string; advanced: boolean }) => (
    <TooltipProvider>
      <ToolModeContext value={{ advanced, setAdvanced: vi.fn(), ...(viewId ? { viewId } : {}) }}>
        <AdvancedSwitch />
      </ToolModeContext>
    </TooltipProvider>
  );

  beforeEach(() => {
    useNudgeStore.setState({ enabled: true });
  });

  it('shows in Basic, beside the switch, and not in Advanced', () => {
    const { rerender } = render(<Tool settings={{}} setSetting={vi.fn()} />);
    expect(hint()).toHaveTextContent(ADVANCED_HINT_TEXT);
    rerender(<Tool settings={{ [TOOL_ADVANCED_SETTING]: 'true' }} setSetting={vi.fn()} />);
    expect(hint()).toBeNull();
  });

  it('stays hidden for that tool on this device after Got it, and still shows for others', async () => {
    const { unmount } = render(<ModeTool viewId="concordance" advanced={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(hint()).toBeNull();
    expect(readAdvancedHintDismissed('concordance')).toBe(true);
    unmount();

    render(<ModeTool viewId="concordance" advanced={false} />);
    expect(hint()).toBeNull();
    render(<ModeTool viewId="topic-modeling" advanced={false} />);
    expect(hint()).toHaveTextContent(ADVANCED_HINT_TEXT);
  });

  it('comes back after an update', () => {
    dismissAdvancedHint('concordance', '0.7.22');
    expect(readAdvancedHintDismissed('concordance', '0.7.22')).toBe(true);
    expect(readAdvancedHintDismissed('concordance', '0.7.23')).toBe(false);
    expect(readAdvancedHintDismissed('topic-modeling', '0.7.22')).toBe(false);
  });

  it('is hidden while Suggestions are off', () => {
    useNudgeStore.setState({ enabled: false });
    render(<ModeTool viewId="concordance" advanced={false} />);
    expect(hint()).toBeNull();
    expect(screen.getByRole('switch', { name: 'Advanced settings' })).toBeInTheDocument();
  });
});

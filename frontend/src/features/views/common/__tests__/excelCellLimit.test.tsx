import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNudgeStore } from '@/features/nudges/nudgeStore';
import { ApiError } from '@/lib/apiError';
import { nativeDownloadError } from '@/lib/download';
import { excelCellLimitColumns, quotedColumns } from '@/lib/excelCellLimit';
import { useUIStore } from '@/stores/uiStore';
import { useExcelCellLimitNotice } from '../useExcelCellLimitNotice';

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const refusal = (columns: string[]) =>
  new ApiError('Excel cells hold at most 32,767 characters, ...', {
    status: 400,
    code: 'excel_cell_too_long',
    detail: { code: 'excel_cell_too_long', details: { columns, limit: 32_767 } },
  });

function Download({ error, canUntick }: { error: unknown; canUntick: boolean }) {
  const notice = useExcelCellLimitNotice({ canUntick });
  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!notice.report(error, "Couldn't download.")) toast.error('other');
        }}
      >
        Download
      </button>
      {notice.card}
    </>
  );
}

const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("Excel's cell limit (issue 397)", () => {
  beforeEach(() => {
    toast.error.mockReset();
    useNudgeStore.setState({ enabled: true });
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('reads the desktop downloader error back into an ApiError with its code and columns', () => {
    const error = nativeDownloadError(
      JSON.stringify({
        message: 'Excel cells hold at most 32,767 characters.',
        code: 'excel_cell_too_long',
        details: { columns: ['document'] },
        status: 400,
      }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('Excel cells hold at most 32,767 characters.');
    expect(excelCellLimitColumns(error)).toEqual(['document']);
    expect(nativeDownloadError('download_write_failed')).toBe('download_write_failed');
    expect(excelCellLimitColumns(new ApiError('other', { code: 'invalid_input' }))).toBeNull();
    expect(quotedColumns(['document', 'notes', 'text'])).toBe("'document', 'notes' and 'text'");
  });

  it('shows a suggestion naming the column, with Learn more to the help section', async () => {
    const user = userEvent.setup();
    const openDocument = vi.fn();
    useUIStore.setState({ openDocument });
    render(<Download error={refusal(['document'])} canUntick />);

    await user.click(screen.getByRole('button', { name: 'Download' }));
    await tick();

    expect(screen.getByText(/Too long for Excel/)).toBeVisible();
    expect(
      screen.getByText(
        /'document' has text too long for an Excel cell\. Untick it to download the other columns as Excel\./,
      ),
    ).toBeVisible();
    expect(screen.getByText(/open it in LibreOffice Calc or Numbers/)).toBeVisible();
    expect(toast.error).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Learn more/ }));
    expect(openDocument).toHaveBeenCalledWith(
      expect.objectContaining({ anchor: 'help-export-excel-limit' }),
    );
  });

  it('falls back to a toast when Suggestions are off, and leaves other errors alone', async () => {
    const user = userEvent.setup();
    useNudgeStore.setState({ enabled: false });
    const { rerender } = render(
      <Download error={refusal(['document', 'notes'])} canUntick={false} />,
    );
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(toast.error).toHaveBeenCalledWith(
      "Couldn't download.",
      expect.objectContaining({ action: expect.objectContaining({ label: 'Learn more' }) }),
    );

    toast.error.mockReset();
    useNudgeStore.setState({ enabled: true });
    rerender(<Download error={new Error('network')} canUntick={false} />);
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(toast.error).toHaveBeenCalledWith('other');
    expect(screen.queryByText(/Too long for Excel/)).toBeNull();
  });
});

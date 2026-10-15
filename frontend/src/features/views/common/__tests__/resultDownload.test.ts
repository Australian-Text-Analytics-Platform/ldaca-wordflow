import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DownloadModule from '@/lib/download';
import { downloadResultSelection } from '../resultDownload';

const mocks = vi.hoisted(() => ({ downloadResult: vi.fn(), saveBlob: vi.fn() }));
vi.mock('@/api', () => ({ downloadResult: mocks.downloadResult }));
vi.mock('@/lib/download', async (importOriginal) => ({
  ...(await importOriginal<typeof DownloadModule>()),
  saveBlob: mocks.saveBlob,
}));

const request = { kind: 'concordance_match_data_block_creation' as const, sources: [] };
const download = () =>
  downloadResultSelection({
    workspaceId: 'ws',
    analysisId: 'a1',
    request,
    format: 'csv',
    fallbackName: 'speeches_concordance',
  });

describe('downloadResultSelection names (issue 393)', () => {
  beforeEach(() => {
    mocks.saveBlob.mockReset().mockResolvedValue(true);
  });

  it("keeps a ZIP's extension when the name can't be read", async () => {
    mocks.downloadResult.mockResolvedValue({
      data: new Blob(['PK'], { type: 'application/zip' }),
      response: new Response(null),
    });
    await download();
    expect(mocks.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'speeches_concordance.zip', {
      reportFailure: false,
    });
  });

  it("uses the backend's name when it can be read", async () => {
    mocks.downloadResult.mockResolvedValue({
      data: new Blob(['PK'], { type: 'application/zip' }),
      response: new Response(null, {
        headers: {
          'Content-Disposition': 'attachment; filename="speeches_concordance_and_more.zip"',
        },
      }),
    });
    await download();
    expect(mocks.saveBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'speeches_concordance_and_more.zip',
      { reportFailure: false },
    );
  });

  it('names a single table by the chosen format', async () => {
    mocks.downloadResult.mockResolvedValue({
      data: new Blob(['a,b'], { type: 'text/csv' }),
      response: new Response(null),
    });
    await download();
    expect(mocks.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'speeches_concordance.csv', {
      reportFailure: false,
    });
  });
});

import { request } from '@/api/client';
import { saveGeneratedExport } from '@/lib/download';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { tableFromArrays, tableFromIPC } from 'apache-arrow';
import { expect, it, vi } from 'vite-plus/test';
import { ResultDownloadMenu } from './ResultDownloadMenu';

vi.mock('@/api/client', () => ({ request: vi.fn() }));
vi.mock('@/lib/download', () => ({
  saveGeneratedExport: vi.fn().mockResolvedValue('results.json'),
}));

it('downloads only captured Preview rows and omits position fields with the document', async () => {
  const user = userEvent.setup();
  const table = tableFromArrays({
    text: ['first', 'second'],
    quote_start_idx: [1, 2],
    AI_prediction: ['A', 'B'],
  });
  vi.mocked(request).mockResolvedValue(new Response('[]') as never);
  render(
    <ResultDownloadMenu
      base="native"
      captured={table}
      columns={table.schema.fields.map((field) => ({ column: field.name, metadata: false }))}
      optionalColumns={[{ column: 'start_idx', metadata: false }]}
      document={{ column: 'text', metadata: false }}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Download Preview' }));
  await user.click(screen.getByRole('checkbox', { name: 'Include document' }));
  expect(screen.getByRole('checkbox', { name: 'start_idx' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'JSON', exact: true }));
  expect(request).toHaveBeenCalledTimes(1);
  const call = vi.mocked(request).mock.calls[0];
  if (!call) throw new Error('Expected the captured Preview export request');
  expect(call.slice(0, 3)).toEqual(['native', '/api/project/results/download', 'post']);
  const body = (call[3] as { body: { bytes: number[]; columns: unknown; format: string } }).body;
  expect(body.columns).toEqual([{ column: 'AI_prediction', metadata: false }]);
  expect(body.format).toBe('json');
  expect(tableFromIPC(Uint8Array.from(body.bytes)).numRows).toBe(2);
  expect(saveGeneratedExport).toHaveBeenCalledWith(expect.any(Blob), 'results.json');
});

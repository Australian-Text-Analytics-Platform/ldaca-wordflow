import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastMock = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { notifyTypeAdjustments } from '../notifyTypeAdjustments';

const change = (column: string, reason: string) => ({
  column,
  from_dtype: 'x',
  to_dtype: 'y',
  reason,
});

describe('notifyTypeAdjustments (issue 205)', () => {
  beforeEach(() => {
    toastMock.info.mockReset();
  });

  it('says nothing about changes users would not see', () => {
    notifyTypeAdjustments([
      change('count', "whole numbers stored in the standard size (a change you won't see)"),
    ]);
    expect(toastMock.info).not.toHaveBeenCalled();
  });

  it('reports time zone changes in plain words', () => {
    notifyTypeAdjustments([
      change('created_at', 'the times have no time zone, so Wordflow reads them as UTC'),
      change('count', "whole numbers stored in the standard size (a change you won't see)"),
    ]);
    expect(toastMock.info).toHaveBeenCalledWith(
      'We adjusted 1 column type so Wordflow can use it.',
      expect.objectContaining({ description: expect.anything() }),
    );
  });
});

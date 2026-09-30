import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vite-plus/test';
import { TokenizerChoice } from './TokenizerChoice';

vi.mock('./useDetectedColumnLanguage', () => ({
  useDetectedColumnLanguage: () => ({ data: 'en', isFetching: false, isError: false }),
}));
it('prefers the saved column default without rewriting a restored request', async () => {
  const onChange = vi.fn();
  const props = {
    active: true,
    base: 'base',
    source: { schema: 'data', name: 'corpus' },
    column: 'text',
    models: [
      { model_id: 'english', label: 'English', languages: ['en'] },
      { model_id: 'saved', label: 'Saved', languages: ['de'] },
    ],
    value: '',
    preferredModel: 'saved',
    onChange,
  };
  const client = new QueryClient();
  const view = render(<TokenizerChoice {...props} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => expect(onChange).toHaveBeenCalledWith('saved'));
  onChange.mockClear();
  view.rerender(<TokenizerChoice {...props} value="english" preferredModel="saved" />);
  expect(screen.getByRole('combobox')).toHaveTextContent('English');
  expect(onChange).not.toHaveBeenCalled();
});

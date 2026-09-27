import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { Quote } from './quotationRows';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QuotationText } from './QuotationText';
it('highlights native character offsets after emoji and clips context without changing the quotation', () => {
  const quote = {
    quote: 'Hello',
    quote_start_idx: 2,
    quote_end_idx: 7,
    speaker: null,
    speaker_start_idx: null,
    speaker_end_idx: null,
    verb: null,
    verb_start_idx: null,
    verb_end_idx: null,
  } as Quote;
  const { container, rerender } = render(<QuotationText text="😀 Hello world" quotes={[quote]} />);
  expect(screen.getByTitle('quote 1')).toHaveTextContent('Hello');
  expect(container).toHaveTextContent('😀 QUOTEHello world');
  rerender(<QuotationText text="😀 Hello world" quotes={[quote]} context={0} />);
  expect(container).toHaveTextContent('… QUOTEHello …');
});

it('labels overlapping roles and quote types with a shared quotation identity', () => {
  const first = {
    quote: 'Alice',
    quote_start_idx: 0,
    quote_end_idx: 5,
    speaker: 'Alice',
    speaker_start_idx: 0,
    speaker_end_idx: 5,
    verb: 'said',
    verb_start_idx: 6,
    verb_end_idx: 10,
    quote_type: 'Direct',
    quote_row_idx: 0,
  } as Quote;
  render(
    <TooltipProvider>
      <QuotationText
        text="Alice said hello"
        quotes={[first, { ...first, quote_start_idx: 11, quote_end_idx: 16, quote_row_idx: 1 }]}
      />
    </TooltipProvider>,
  );
  expect(screen.getByText('QUOTE 1')).toBeInTheDocument();
  expect(screen.getByText('QUOTE 2')).toBeInTheDocument();
  expect(screen.getByText('SPEAKER 1')).toBeInTheDocument();
  expect(screen.getAllByLabelText(/extraction pattern/)).toHaveLength(2);
  const shared = screen.getByTitle('quote 1, speaker 1, speaker 2');
  fireEvent.focus(shared);
  expect(shared.style.backgroundColor).not.toBe('');
});

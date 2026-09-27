import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { RequestCompatibilityWarning } from './RequestCompatibilityWarning';
it('escapes originals and retains complete large values behind bounded disclosure', () => {
  const text = '<script>unsafe()</script>';
  const large = { data: 'word '.repeat(1000) };
  render(
    <RequestCompatibilityWarning
      issues={[
        { path: 'search.future', value: text, explanation: 'Omitted.' },
        { path: 'large', value: large, explanation: 'Omitted.' },
      ]}
    />,
  );
  expect(screen.getByText(JSON.stringify(text))).toBeInTheDocument();
  expect(
    screen.getByText(JSON.stringify(large, null, 2), { normalizer: (text) => text }),
  ).toBeInTheDocument();
  expect(screen.getByText('Run will save only supported settings.')).toBeInTheDocument();
});

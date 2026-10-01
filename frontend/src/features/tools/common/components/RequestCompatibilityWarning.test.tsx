import { render, screen } from '@testing-library/react';
import { expect, it } from 'vite-plus/test';
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
  expect(
    screen.getByText('Start with current defaults to create a new request.'),
  ).toBeInTheDocument();
});

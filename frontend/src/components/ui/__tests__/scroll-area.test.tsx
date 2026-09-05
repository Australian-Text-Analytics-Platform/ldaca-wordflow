import { render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { ScrollArea } from '../scroll-area';

describe('ScrollArea', () => {
  it('exposes the scrolling viewport for controlled scroll position', () => {
    const viewportRef = createRef<HTMLDivElement>();
    render(
      <ScrollArea viewportRef={viewportRef} scrollbars="horizontal">
        <div>Scrollable content</div>
      </ScrollArea>,
    );

    expect(viewportRef.current).toHaveAttribute('data-slot', 'scroll-area-viewport');
  });
});

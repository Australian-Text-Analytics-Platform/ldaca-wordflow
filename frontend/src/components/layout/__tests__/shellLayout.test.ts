import { describe, expect, it } from 'vitest';

import { shellRegions } from '../shellLayout';

describe('shellRegions', () => {
  it('splits the width by the remembered ratio in the normal layout', () => {
    expect(
      shellRegions({ maximised: null, isRightCollapsed: false, asidePanelRatio: 0.3 }),
    ).toEqual({
      sidebarHidden: false,
      mainHidden: false,
      asideHidden: false,
      handleHidden: false,
      mainWidth: '70%',
      asideWidth: '30%',
    });
  });

  it('gives the tool the width when the Project panel is collapsed', () => {
    expect(
      shellRegions({ maximised: null, isRightCollapsed: true, asidePanelRatio: 0.3 }),
    ).toMatchObject({ handleHidden: true, mainWidth: '100%', asideWidth: '0px' });
  });

  it('hides everything but the tool while its results are maximised', () => {
    expect(
      shellRegions({ maximised: 'analysis', isRightCollapsed: false, asidePanelRatio: 0.3 }),
    ).toEqual({
      sidebarHidden: true,
      mainHidden: false,
      asideHidden: true,
      handleHidden: true,
      mainWidth: '100%',
      asideWidth: '0px',
    });
  });

  it('hides everything but the right column while the Data Editor is maximised', () => {
    expect(
      shellRegions({ maximised: 'data-editor', isRightCollapsed: false, asidePanelRatio: 0.3 }),
    ).toEqual({
      sidebarHidden: true,
      mainHidden: true,
      asideHidden: false,
      handleHidden: true,
      mainWidth: '0px',
      asideWidth: '100%',
    });
  });
});

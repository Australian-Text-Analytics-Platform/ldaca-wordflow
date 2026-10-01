import { createRoot } from 'react-dom/client';

import '@/index.css';
import { UpdaterWindow } from '@/features/updater/UpdaterWindow';
import { withPreferences } from '@/features/preferences/startup';

const root = document.getElementById('root');
if (!root) throw new Error('Root container #root not found');

const mode =
  new URLSearchParams(window.location.search).get('mode') === 'available' ? 'available' : 'manual';
void withPreferences(root, '', () => {
  createRoot(root).render(<UpdaterWindow mode={mode} />);
});

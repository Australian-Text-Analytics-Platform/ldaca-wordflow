import { invoke } from '@tauri-apps/api/core';
import type { MouseEvent } from 'react';
import { reportProjectError } from '@/features/project/projectErrors';
import { isTauri } from './isTauri';

/** Browser anchors stay ordinary links; desktop links use the system browser. */
export function externalLink(event: MouseEvent<HTMLAnchorElement>) {
  if (!isTauri()) return;
  event.preventDefault();
  void invoke('open_external_link', { url: event.currentTarget.href }).catch((error) =>
    reportProjectError(error, 'Could not open link'),
  );
}

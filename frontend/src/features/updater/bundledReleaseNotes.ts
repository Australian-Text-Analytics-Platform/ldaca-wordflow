/**
 * Release notes shipped with the app, one Markdown file per version from
 * `docs/releases`, so the update window can show what the installed version
 * brought even offline (Chao, 2026-10-12).
 */
const NOTES = import.meta.glob<string>(
  ['../../../../docs/releases/v*.*.*.md', '!../../../../docs/releases/v0.7-*.md'],
  { query: '?raw', import: 'default', eager: true },
);

/** The notes for one version, such as "0.7.13", or null when none shipped. */
export function bundledReleaseNotes(version: string): string | null {
  return NOTES[`../../../../docs/releases/v${version}.md`] ?? null;
}

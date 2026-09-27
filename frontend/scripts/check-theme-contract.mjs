import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: on Windows the pathname is "/D:/..." and
// resolving it against the current drive yields "D:\D:\...".
const root = fileURLToPath(new URL('../src/', import.meta.url));
const allowedRawColorFiles = new Set([
  'features/theme/themeRuntime.ts',
  'features/tools/common/components/NodeColorPicker.tsx',
  'features/tools/common/components/NodeSelectionList.tsx',
  'features/tools/common/vizPalette.ts',
  'features/tools/preprocessing/concat/hooks/useConcatSubTab.ts',
  'features/tools/preprocessing/join/hooks/useJoinSubTab.ts',
  'features/project/data-view/components/TopicCoverageBar.tsx',
]);

const checks = [
  ['legacy CSS variable', /var\(--(?:background|card|primary|popover|radius|input|ring|muted-foreground)\b/],
  [
    'legacy Tailwind color mapping',
    /--color-(?:background|card|card-foreground|popover|popover-foreground|primary|primary-foreground|secondary|secondary-foreground|muted|muted-foreground|accent|accent-foreground|destructive|destructive-foreground|border|input|ring)\s*:/,
  ],
  [
    'legacy utility alias',
    /\b(?:bg|text|border|ring|fill|stroke)-(?:background|card-foreground|card|popover-foreground|popover|primary-foreground|primary|secondary-foreground|secondary|muted-foreground|muted|accent-foreground|accent|destructive-foreground|destructive|input|ring)(?![-\w])/,
  ],
  ['legacy dark class', /(?:^|[\s"'`])(?:\.dark\b|dark:)/m],
  [
    'hardcoded Tailwind presentation palette',
    /\b(?:text|bg|border|from|via|to|fill|stroke)-(?:gray|slate|blue|red|amber|green|sky|emerald|yellow)-\d+/,
  ],
];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'styles') continue;
      files.push(...(await sourceFiles(path)));
    } else if (['.ts', '.tsx', '.css'].includes(extname(entry.name)) && !entry.name.includes('.test.')) {
      files.push(path);
    }
  }
  return files;
}

const violations = [];
for (const path of await sourceFiles(root)) {
  const source = await readFile(path, 'utf8');
  // Allow-lists use forward slashes; normalise Windows separators before lookup.
  const displayPath = relative(root, path).split(sep).join('/');
  for (const [label, pattern] of checks) {
    if (pattern.test(source)) violations.push(`${displayPath}: ${label}`);
  }
  if (
    /(?:#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\b(?:text|bg|border|fill|stroke)-(?:black|white)\b)/.test(
      source,
    ) &&
    !allowedRawColorFiles.has(displayPath)
  ) {
    violations.push(`${displayPath}: hardcoded presentation color`);
  }
}

if (violations.length > 0) {
  console.error(`Theme contract violations:\n${violations.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log('Theme contract audit passed.');

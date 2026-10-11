import { readFile } from 'node:fs/promises';
import { normalizePath, type Plugin } from 'vite';

interface ThemeManifest {
  source: { version: string; commit: string };
  metrics: Record<string, string>;
  themes: Record<string, Record<string, string>>;
}

const moduleId = 'virtual:wordflow-theme.css';
const resolvedId = `\0${moduleId}`;

function declarations(tokens: Record<string, string>) {
  return Object.entries(tokens)
    .map(([name, value]) => `  --vscode-${name.replaceAll('.', '-')}: ${value};`)
    .join('\n');
}

export function wordflowTheme(manifestPath: string): Plugin {
  const filePath = normalizePath(manifestPath);
  return {
    name: 'wordflow-theme',
    resolveId(id) {
      if (id === moduleId) return resolvedId;
    },
    async load(id) {
      if (id !== resolvedId) return;
      this.addWatchFile(filePath);
      const manifest = JSON.parse(await readFile(filePath, 'utf8')) as ThemeManifest;
      const themes = Object.entries(manifest.themes)
        .map(([theme, tokens]) => {
          const selector =
            theme === 'light-2026' ? `:root,\n[data-theme="${theme}"]` : `[data-theme="${theme}"]`;
          return `${selector} {\n${declarations(tokens)}\n  color-scheme: ${theme === 'dark-2026' ? 'dark' : 'light'};\n}`;
        })
        .join('\n\n');

      return `/* VS Code ${manifest.source.version} @ ${manifest.source.commit} (MIT). */\n\n:root {\n${declarations(manifest.metrics)}\n  --vscode-shadow-lg: 0 4px 16px 0 var(--vscode-widget-shadow);\n}\n\n${themes}\n`;
    },
    hotUpdate({ file }) {
      if (file !== filePath) return;
      const module = this.environment.moduleGraph.getModuleById(resolvedId);
      return module ? [module] : [];
    },
  };
}

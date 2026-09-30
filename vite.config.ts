import { defineConfig } from 'vite-plus';

// Workspace tooling is independent of the frontend's asset-syncing config callback.
export default defineConfig({
  lint: {
    plugins: ['typescript', 'unicorn', 'oxc', 'react'],
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    useTabs: false,
    tabWidth: 2,
    printWidth: 100,
    singleQuote: true,
    semi: true,
    trailingComma: 'all',
    arrowParens: 'always',
    endOfLine: 'lf',
    sortImports: false,
    sortPackageJson: false,
    sortTailwindcss: false,
    ignorePatterns: [
      '**',
      '!frontend/',
      '!frontend/src/',
      '!frontend/src/**',
      'frontend/src/api/generated/native.ts',
      'frontend/src/styles/vscode-2026.generated.css',
    ],
  },
});

/// <reference types="vite-plus/client" />

interface ImportMetaEnv {
  /** App version, injected by `vite.config.ts` from `package.json`. */
  readonly VITE_APP_VERSION?: string;
  /** Short git SHA at build/dev start, injected by `vite.config.ts`. */
  readonly VITE_APP_BUILD?: string;
  /** Build date as `DD/MMM/YYYY`, injected by `vite.config.ts`. */
  readonly VITE_APP_BUILD_DATE?: string;
  /** Root of the externally hosted docs; the app appends its `v{major}.{minor}` tag. */
  /** Deployment identifier surfaced in the feedback panel, injected at build time. */
  readonly VITE_DEPLOYMENT_ID?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __WORDFLOW_CONFIG__?: {
    basePath?: string;
  };
}

/**
 * Centralized access to Vite build-time environment variables.
 * All env reads should route through this module so defaults and
 * validation live in one place.
 */

/** Current app version, injected by Vite's define at build time. */
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? '';

/** Git short SHA, injected at build time. */
export const APP_BUILD: string = import.meta.env.VITE_APP_BUILD ?? '';

/** Deployment identifier used by the feedback panel. */
export const DEPLOYMENT_ID: string = import.meta.env.VITE_DEPLOYMENT_ID ?? '';

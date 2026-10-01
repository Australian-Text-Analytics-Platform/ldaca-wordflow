export const DEV_IDENTITY: 'au.edu.ldaca.wordflow.dev';
export const TEST_IDENTITY: 'au.edu.ldaca.wordflow.test';
export function applicationCacheDirectory(identity: string, env?: NodeJS.ProcessEnv, platform?: string): string;
export function applicationConfigurationDirectory(identity: string, env?: NodeJS.ProcessEnv, platform?: string): string;
export function applicationEnvironment(identity: string, env?: NodeJS.ProcessEnv, platform?: string): NodeJS.ProcessEnv;

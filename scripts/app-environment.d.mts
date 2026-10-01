export const DEV_IDENTITY: 'au.edu.ldaca.wordflow.dev';
export const TEST_IDENTITY: 'au.edu.ldaca.wordflow.test';
export interface AppDirectories { config: string; data: string; localData: string; cache: string; logs: string; temporary: string; }
export function applicationDirectories(identity: string, env?: NodeJS.ProcessEnv): AppDirectories;
export function applicationCacheDirectory(identity: string, env?: NodeJS.ProcessEnv): string;
export function applicationConfigurationDirectory(identity: string, env?: NodeJS.ProcessEnv): string;
export function applicationEnvironment(identity: string, env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;

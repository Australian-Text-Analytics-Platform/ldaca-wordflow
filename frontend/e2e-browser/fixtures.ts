import type { components } from '@/api/generated/native';
import { browser } from '@wdio/globals';
import { Key, type ChainablePromiseElement, type ElementFunction } from 'webdriverio';
import type { ByRoleOptions, MatcherOptions, queries } from '@testing-library/dom';
import { resolve } from 'node:path';
import { cancelTask, dismissTask, getTasks } from '@/features/project/tasksApi';
import { deleteObjects, dependencyGraph, executeSql, projectStatus, querySql } from '@/features/project/api';
import { dependentSelection } from '@/features/project/deletionSelection';
import { deleteTab, listTabs } from '@/features/tools/common/analysisApi';
import { identifier } from '@/features/project/objects';

export const baseUrl = 'http://127.0.0.1:3212';
export const outputDir =
  process.env.WORDFLOW_E2E_OUTPUT_DIR ?? resolve(import.meta.dirname, '../.tmp/wdio/browser');
type Scope = typeof browser | ChainablePromiseElement;
type Options = ByRoleOptions & MatcherOptions & { index?: number };
type Query =
  | 'queryAllByRole'
  | 'queryAllByText'
  | 'queryAllByLabelText'
  | 'queryAllByTestId'
  | 'queryAllByPlaceholderText';
declare global {
  interface Window {
    TestingLibraryDom?: typeof queries;
  }
}

function queryElements(this: HTMLElement | Window, encoded: string) {
  if (!window.TestingLibraryDom) return [];
  const { query, matcher, options } = JSON.parse(encoded, (_key, value: unknown) => {
    if (value && typeof value === 'object' && 'regex' in value && 'flags' in value) {
      return new RegExp(String(value.regex), String(value.flags));
    }
    return value;
  }) as { query: Query; matcher: string | RegExp; options: Options };
  const { index, ...queryOptions } = options;
  const matches = window.TestingLibraryDom[query](
    this instanceof HTMLElement ? this : document.body,
    matcher as string,
    queryOptions,
  );
  return index === undefined ? matches : matches.slice(index, index >= 0 ? index + 1 : undefined);
}
const encode = (query: Query, matcher: string | RegExp, options: Options) =>
  JSON.stringify({ query, matcher, options }, (_key, value: unknown) =>
    value instanceof RegExp ? { regex: value.source, flags: value.flags } : value,
  );
// Function selectors bind `this` to the freshly resolved parent. WDIO v9 custom
// strategies instead retain a stale parent in their arguments after a remount.
const selector = (query: Query, matcher: string | RegExp, options: Options) =>
  // WDIO serializes functions without closures. Bake JSON-escaped test arguments
  // into this runner-only selector; no application code enables dynamic evaluation.
  // oxlint-disable-next-line typescript/no-implied-eval
  new Function(
    `return (${queryElements.toString()}).call(this, ${JSON.stringify(encode(query, matcher, options))});`,
  ) as ElementFunction;
const locator =
  (query: Query) =>
  (matcher: string | RegExp, options: Options = {}, scope: Scope = browser) =>
    scope.$(selector(query, matcher, options));
const locators =
  (query: Query) =>
  (matcher: string | RegExp, options: Options = {}, scope: Scope = browser) =>
    scope.$$(selector(query, matcher, options));
export const role = locator('queryAllByRole');
export const roles = locators('queryAllByRole');
export const text = locator('queryAllByText');
export const texts = locators('queryAllByText');
export const label = locator('queryAllByLabelText');
export const testId = locator('queryAllByTestId');
export const testIds = locators('queryAllByTestId');
export const placeholder = locator('queryAllByPlaceholderText');
export function post(path: string, data: unknown) {
  return fetch(new URL(path, baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
export function get(path: string) {
  return fetch(new URL(path, baseUrl));
}
export function remove(path: string) {
  return fetch(new URL(path, baseUrl), { method: 'DELETE' });
}
export async function finishTestTasks(base = baseUrl) {
  for (const task of (await getTasks(base)).tasks) {
    if (task.finished_at === null) await cancelTask(base, task.id);
  }
  await browser.waitUntil(
    async () => (await getTasks(base)).tasks.every((task) => task.finished_at !== null),
    { timeout: 60000, timeoutMsg: 'Test-owned tasks did not finish cancellation' },
  );
}
export async function resetProject(base = baseUrl) {
  await finishTestTasks(base);
  for (const task of (await getTasks(base)).tasks) await dismissTask(base, task.id);
  for (const tab of await listTabs(base)) await deleteTab(base, tab.id);
  // Published outputs survive tab deletion; their native owner releases the backing relations.
  if ((await projectStatus(base))?.schema_version === 2) {
    const published = await querySql(base, [{ sql: 'SELECT node_name FROM wordflow.publications' }]);
    const roots = published.toArray().map((row: Record<string, unknown>) => ({
      schema: 'data', name: String(row.node_name),
    }));
    if (roots.length) await deleteObjects(base, dependentSelection(await dependencyGraph(base), roots));
  }
  const schemas = await querySql(base, [
    {
      sql: "SELECT schema_name FROM duckdb_schemas() WHERE database_name=current_database() AND NOT internal AND schema_name<>'wordflow'",
    },
  ]);
  await executeSql(
    base,
    [
      ...schemas
        .toArray()
        .map((row: Record<string, unknown>) => ({
          sql: `DROP SCHEMA ${identifier(String(row.schema_name))} CASCADE`,
        })),
      { sql: 'CREATE SCHEMA data' },
      ...['sql_cells', 'edges', 'arrow_metadata', 'tokenizer_models', 'nodes'].map((table) => ({
        sql: `DELETE FROM wordflow.${table}`,
      })),
    ],
    {},
  );
}
export async function rect(element: ChainablePromiseElement) {
  return (await element.getElement()).execute((el) => {
    const { x, y, width, height } = el.getBoundingClientRect();
    return { x, y, width, height };
  });
}
export async function press(shortcut: string, element?: ChainablePromiseElement) {
  if (element)
    await (await element.getElement()).execute((el) => {
      el.focus();
    });
  const keys = shortcut
    .split('+')
    .map((key) =>
      key === 'ControlOrMeta'
        ? process.platform === 'darwin'
          ? Key.Command
          : Key.Ctrl
        : key === 'Space'
          ? ' '
          : key,
    );
  await browser.keys(keys);
}
export async function checked(element: ChainablePromiseElement, value: boolean) {
  if (((await element.getAttribute('aria-checked')) === 'true') !== value) await element.click();
}
export async function screenshot(name: string, element?: ChainablePromiseElement) {
  const path = resolve(outputDir, name.split('/').at(-1) ?? name);
  if (element) await element.saveScreenshot(path);
  else await browser.saveScreenshot(path);
}

// Keep one input source across graph-card and toolbar hover transfers.
export async function hover(element: ChainablePromiseElement) {
  await element.waitForDisplayed();
  await browser
    .action('pointer', { id: 'mouse' })
    .move({ origin: await element.getElement() })
    .perform(true);
}

// Observe real responses without intercepting or changing accepted database work.
export async function captureResponse(
  path: string,
  action: () => Promise<unknown>,
  requestIncludes?: string,
) {
  interface ResponseEvent {
    request: { request: string; url: string };
    response: { status: number; headers: { name: string }[] };
  }
  const responses: ResponseEvent[] = [];
  const observe = (event: ResponseEvent) => {
    if (event.request.url === new URL(path, baseUrl).href) responses.push(event);
  };
  const body = async (request: string, dataType: 'request' | 'response') => {
    const { bytes } = await browser.networkGetData({ request, dataType });
    return bytes.type === 'base64' ? Buffer.from(bytes.value, 'base64').toString() : bytes.value;
  };
  let matched: ResponseEvent | undefined;
  browser.on('network.responseCompleted', observe);
  try {
    await action();
    await browser.waitUntil(
      async () => {
        for (const event of responses.splice(0)) {
          if (
            requestIncludes &&
            !(await body(event.request.request, 'request')).includes(requestIncludes)
          )
            continue;
          matched = event;
          return true;
        }
        return false;
      },
      { timeout: 60_000, timeoutMsg: `No completed response for ${path}` },
    );
    if (!matched) throw new Error(`Missing response for ${path}`);
    return { ...matched, body: await body(matched.request.request, 'response') };
  } finally {
    browser.off('network.responseCompleted', observe);
  }
}

const responseStubs: (() => Promise<void>)[] = [];
// Fulfil before sending the request: failure fixtures must not run real mutations.
export async function stubResponse(
  path: string,
  body: () => string,
  contentType = 'application/json',
  statusCode = 200,
) {
  const { intercept } = await browser.networkAddIntercept({
    phases: ['beforeRequestSent'],
    urlPatterns: [{ type: 'string', pattern: new URL(path, baseUrl).href }],
  });
  const respond = (event: { intercepts?: string[]; request: { request: string } }) => {
    if (!event.intercepts?.includes(intercept)) return;
    void browser.networkProvideResponse({
      request: event.request.request,
      statusCode,
      headers: [{ name: 'Content-Type', value: { type: 'string', value: contentType } }],
      body: { type: 'string', value: body() },
    });
  };
  browser.on('network.beforeRequestSent', respond);
  responseStubs.push(async () => {
    browser.off('network.beforeRequestSent', respond);
    await browser.networkRemoveIntercept({ intercept });
  });
}
export async function clearResponseStubs() {
  for (const restore of responseStubs.splice(0)) await restore();
}

/** Seed the real host preference adapter before the next document loads. */
export async function setTestPreferences(patch: Record<string, unknown>, base = baseUrl) {
  if (browser.tauri) {
    await browser.tauri.execute(({ core }, value) => core.invoke('patch_preferences', { patch: value }), patch);
    return;
  }
  const response = await fetch(`${base}/api/preferences`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Preference setup failed: ${response.status} ${await response.text()}`);
}

export async function getTestPreferences(base = baseUrl): Promise<components['schemas']['Preferences']> {
  if (browser.tauri)
    return browser.tauri.execute(({ core }) => core.invoke('get_preferences') as Promise<components['schemas']['Preferences']>);
  const response = await fetch(`${base}/api/preferences`);
  if (!response.ok) throw new Error(`Preference read failed: ${response.status}`);
  return response.json();
}

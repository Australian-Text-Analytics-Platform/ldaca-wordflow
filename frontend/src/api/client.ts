import type { components } from '@/api/generated/native';
import {
  requestUrl,
  type HttpPath,
  type HttpResponse,
  type Method,
  type RequestOptions,
} from '@/api/http';

export async function request<P extends HttpPath, M extends Method<P>>(
  base: string,
  template: P,
  method: M,
  options: RequestOptions<P, M>,
): Promise<HttpResponse<P, M>> {
  const path = requestUrl(template, options.path, options.query);
  const body = options.body;
  const signal = options.signal;
  const keepalive = options.keepalive ?? false;
  const requestMethod = method.toUpperCase();
  const requestContext = `${requestMethod} ${path}`;
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: requestMethod,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      keepalive,
      cache: options.cache,
    });
  } catch (error) {
    if (
      signal?.aborted ||
      (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
    )
      throw error;
    throw new ProjectError(
      error instanceof Error ? error.message : String(error),
      '',
      undefined,
      `${requestContext}\nNo HTTP response received`,
    );
  }
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const error = JSON.parse(text) as Partial<components['schemas']['ErrorEnvelope']>;
      message = error.error?.message ?? text;
    } catch {
      /* Transport errors may be plain text. */
    }
    throw new ProjectError(
      message || `Request failed (${String(response.status)})`,
      text,
      response.headers.get('x-wordflow-task-id') ?? undefined,
      `${requestContext}\nHTTP ${String(response.status)} ${response.statusText}`.trim(),
    );
  }
  // The selected operation owns the JSON type; binary callers retain Response methods.
  return response as HttpResponse<P, M>;
}

export class ProjectError extends Error {
  static fromNative(value: unknown): ProjectError {
    const error =
      value && typeof value === 'object'
        ? (value as { message?: string; task_id?: string })
        : { message: String(value) };
    return new ProjectError(
      error.message ?? JSON.stringify(error),
      JSON.stringify({ error: { ...error, message: error.message } }),
      error.task_id,
    );
  }
  code: string;
  statementIndex?: number;
  readonly taskId?: string;
  readonly details: string;
  constructor(message: string, body: string, taskId?: string, context?: string) {
    super(message);
    this.name = 'ProjectError';
    this.taskId = taskId;
    this.code = 'request_failed';
    let details = body || message;
    try {
      const parsed = JSON.parse(body) as Partial<components['schemas']['ErrorEnvelope']>;
      this.code = parsed.error?.code ?? this.code;
      this.statementIndex = parsed.error?.statement_index ?? undefined;
      details = JSON.stringify(parsed, null, 2);
    } catch {
      /* Non-JSON transport errors keep the response text. */
    }
    this.details = context ? `${context}\n\n${details}` : details;
  }
}

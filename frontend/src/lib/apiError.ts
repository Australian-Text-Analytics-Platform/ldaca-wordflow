/**
 * Shared frontend error shape for HTTP, timeout, and network failures.
 * Generated-client wrappers and hooks throw this so UI surfaces can branch on
 * `status`/`code` without knowing which transport produced the failure.
 */
/** Used by: generated-client error shaping and workspace-management 404 handling. */
export class ApiError extends Error {
  status?: number;
  code?: string;
  detail?: unknown;
  /** Text for the developers, shown under "Details" (issue 205). */
  technical?: string;

  /** Preserves backend response metadata alongside the user-facing message. */
  constructor(
    message: string,
    opts: { status?: number; code?: string; detail?: unknown; technical?: string } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.detail = opts.detail;
    this.technical = opts.technical;
  }
}

/**
 * Collapses FastAPI/HTTP validation detail payloads into compact text for
 * snackbars, banners, and thrown `ApiError` messages.
 */
function formatErrorDetail(detail: unknown): string | null {
  if (detail == null) return null;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((entry) => {
      if (entry && typeof entry === 'object') {
        const error = entry as {
          loc?: unknown;
          location?: unknown;
          message?: unknown;
          msg?: unknown;
        };
        const canonicalMessage = typeof error.message === 'string' ? error.message : undefined;
        const rawLocation = canonicalMessage === undefined ? (error.location ?? error.loc) : null;
        const loc = Array.isArray(rawLocation)
          ? rawLocation.filter((value) => value !== 'body').join('.')
          : '';
        const rawMessage = canonicalMessage ?? error.msg;
        const msg = typeof rawMessage === 'string' ? rawMessage : '';
        if (loc && msg) return `${loc}: ${msg}`;
        if (msg) return msg;
      }
      try {
        return JSON.stringify(entry);
      } catch {
        return String(entry);
      }
    });
    const joined = parts.filter(Boolean).join('; ');
    return joined || null;
  }
  if (typeof detail === 'object') {
    // Never show a JSON object as the message (issue 205); it goes under Details.
    const obj = detail as Record<string, unknown>;
    return typeof obj.message === 'string' ? obj.message : null;
  }
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- detail is a non-object primitive here (string/array/object handled above); String() is the safe fallback
  return String(detail);
}

interface ParseApiErrorOptions {
  fallbackMessage?: string;
  includeResponseText?: boolean;
}

/** Pretty JSON for Details, or null for nothing worth showing. */
const describeDetails = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  try {
    const text = JSON.stringify(value, null, 2);
    return text === '{}' || text === '[]' ? null : text;
  } catch {
    return null;
  }
};

/** Parse one backend error envelope without discarding its diagnostic message. */
export async function parseApiErrorResponse(
  response: Response,
  options: ParseApiErrorOptions = {},
): Promise<ApiError> {
  let detail: unknown;
  let parsedJson = true;
  try {
    detail = await response.clone().json();
  } catch {
    parsedJson = false;
    try {
      detail = await response.clone().text();
    } catch {
      detail = null;
    }
  }

  const parsed = detail && typeof detail === 'object' ? (detail as Record<string, unknown>) : null;
  const fallbackDetail = parsedJson || options.includeResponseText !== false ? detail : null;
  const nestedError =
    parsed?.error && typeof parsed.error === 'object'
      ? (parsed.error as Record<string, unknown>)
      : null;
  const code = typeof parsed?.code === 'string' ? parsed.code : undefined;
  // Older backends sent a bare summary for validation errors; their listed
  // messages say more.
  const writtenMessage =
    typeof parsed?.message === 'string' &&
    parsed.message &&
    parsed.message !== code &&
    parsed.message !== 'Request validation failed'
      ? parsed.message
      : null;
  // The written message comes first; `details` are for the developers (issue 205).
  const backendMessage =
    /* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- empty messages deliberately fall through */
    writtenMessage ||
    (typeof nestedError?.message === 'string' && nestedError.message) ||
    (Array.isArray(parsed?.details) ? formatErrorDetail(parsed.details) : null) ||
    formatErrorDetail(parsed?.detail) ||
    (parsed ? null : formatErrorDetail(fallbackDetail)) ||
    options.fallbackMessage ||
    `HTTP ${String(response.status)}`;
  /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */

  const requestId =
    (typeof parsed?.request_id === 'string' && parsed.request_id) ||
    response.headers.get('X-Request-ID');
  const details =
    parsed?.details && typeof parsed.details === 'object' && !Array.isArray(parsed.details)
      ? (parsed.details as Record<string, unknown>)
      : null;
  const diagnostic = typeof details?.diagnostic === 'string' ? details.diagnostic : null;
  const { diagnostic: _diagnostic, ...otherDetails } = details ?? {};
  const technical = [
    diagnostic,
    describeDetails(details ? otherDetails : parsed?.details),
    code ? `Error code: ${code}` : null,
    `HTTP status: ${String(response.status)}`,
    requestId ? `Reference: ${requestId}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return new ApiError(backendMessage, { status: response.status, code, detail, technical });
}

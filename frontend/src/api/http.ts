import type { paths } from './generated/native';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
export type HttpPath = keyof paths;
export type Method<P extends HttpPath> = {
  [M in HttpMethod]: paths[P][M] extends undefined ? never : M;
}[HttpMethod];
type Operation<P extends HttpPath, M extends Method<P>> = NonNullable<paths[P][M]>;
type Parameters<O, K extends string> = O extends { parameters: infer V }
  ? K extends keyof V
    ? NonNullable<V[K]>
    : never
  : never;
type Body<O> = O extends { requestBody: { content: { 'application/json': infer B } } } ? B : never;
type PathParameters<O> = [Parameters<O, 'path'>] extends [never]
  ? { path?: never }
  : { path: Parameters<O, 'path'> };
type QueryParameters<O> = [Parameters<O, 'query'>] extends [never]
  ? { query?: never }
  : { query?: Parameters<O, 'query'> };
type BodyParameter<O> = [Body<O>] extends [never] ? { body?: never } : { body: Body<O> };
export type RequestOptions<P extends HttpPath, M extends Method<P>> = PathParameters<
  Operation<P, M>
> &
  QueryParameters<Operation<P, M>> &
  BodyParameter<Operation<P, M>> & {
    signal?: AbortSignal;
    keepalive?: boolean;
    cache?: RequestCache;
  };
type Success<O> = O extends { responses: infer R } ? R[Extract<keyof R, 200 | 201>] : never;
type JsonContent<T> = T extends { content: { 'application/json': infer J } } ? J : never;
type JsonResponse<P extends HttpPath, M extends Method<P>> = JsonContent<Success<Operation<P, M>>>;
export type HttpResponse<P extends HttpPath, M extends Method<P>> = Omit<Response, 'json'> & {
  json: [JsonResponse<P, M>] extends [never] ? never : () => Promise<JsonResponse<P, M>>;
};

/** Encoding stays at the transport boundary, including qualified and Unicode object names. */
export function requestUrl(template: string, parameters?: object, query?: object): string {
  let url = template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value: unknown = parameters && Reflect.get(parameters, key);
    if (typeof value !== 'string' && typeof value !== 'number')
      throw new Error(`Missing path parameter: ${key}`);
    return encodeURIComponent(String(value));
  });
  if (query) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) search.set(key, String(value));
    }
    if (search.size) url += `?${search}`;
  }
  return url;
}

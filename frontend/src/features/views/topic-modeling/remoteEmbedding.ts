import type { EmbeddingEndpoint } from '@/features/embedding-endpoints/embeddingEndpoints';

export interface RemoteEmbeddingChoice {
  /** Remote GPU ticked, and an endpoint serves the selected model. */
  ticked: boolean;
  /** The endpoint the run embeds on; null embeds on this computer. */
  endpointId: string | null;
  /** Endpoints that serve the selected model, the server's first. */
  serving: EmbeddingEndpoint[];
}

/**
 * Where a Topic Modelling run embeds (issue 412 follow-up). Remote GPU
 * applies only while an endpoint serves the selected model; otherwise the run
 * embeds on this computer as before. Untouched, it is ticked when a server
 * endpoint is marked as the default. The chosen endpoint is kept while it
 * serves the model, else the default, else the first.
 */
export function remoteEmbeddingChoice({
  ticked,
  endpointId,
  serving,
}: {
  ticked: boolean | null;
  endpointId: string | null;
  serving: EmbeddingEndpoint[];
}): RemoteEmbeddingChoice {
  const isTicked = serving.length > 0 && (ticked ?? serving.some((endpoint) => endpoint.default));
  const chosen =
    serving.find((endpoint) => endpoint.id === endpointId) ??
    serving.find((endpoint) => endpoint.default) ??
    serving[0];
  return { ticked: isTicked, endpointId: isTicked ? (chosen?.id ?? null) : null, serving };
}

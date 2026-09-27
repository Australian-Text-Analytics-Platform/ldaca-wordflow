import type { NodeMetadata } from '@/features/tools/common/nodeInputs/nodeMetadata';

export function inputNode(
  node: { id: string; name: string } & Partial<NodeMetadata>,
  details?: Partial<NodeMetadata>,
): NodeMetadata {
  return {
    color: null,
    document: null,
    shape: undefined,
    tokenizerModel: null,
    ...node,
    ...details,
  };
}

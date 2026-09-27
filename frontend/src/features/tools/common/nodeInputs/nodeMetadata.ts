/** Presentation values supplied by the owning project controller. */
export interface NodeMetadata {
  id: string;
  name: string;
  color: string | null;
  document: string | null;
  tokenizerModel: string | null;
}

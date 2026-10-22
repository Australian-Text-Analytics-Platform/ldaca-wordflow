import type { TopicEmbeddingModel } from '@/api';

/**
 * The sentence models Topic Modelling offers (issue 413). English is the
 * default; the multilingual model understands Chinese, Japanese, Korean and
 * about 50 other languages, and reads at most 128 tokens per segment.
 */
export const ENGLISH_EMBEDDING_MODEL: TopicEmbeddingModel =
  'sentence-transformers/all-MiniLM-L6-v2';
export const MULTILINGUAL_EMBEDDING_MODEL: TopicEmbeddingModel =
  'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2';

/** Tokens each model reads per segment; the backend refuses a larger Max tokens. */
const EMBEDDING_MODEL_TOKEN_LIMITS: Record<TopicEmbeddingModel, number> = {
  [ENGLISH_EMBEDDING_MODEL]: 256,
  [MULTILINGUAL_EMBEDDING_MODEL]: 128,
};

export const EMBEDDING_MODEL_LABELS: Record<TopicEmbeddingModel, string> = {
  [ENGLISH_EMBEDDING_MODEL]: 'English',
  [MULTILINGUAL_EMBEDDING_MODEL]: 'Multilingual',
};

/**
 * Tokenisers Frequency Analysis attaches to Chinese, Japanese and Korean Data
 * Blocks, with the names the tokeniser list shows. NEologd is hidden from that
 * list but may be attached to an older Data Block.
 */
const CJK_TOKENIZER_LABELS: Record<string, string> = {
  'lindera:jieba': 'Jieba',
  'lindera:cc-cedict': 'CC-CEDICT',
  'lindera:ja-ipadic': 'IPADIC',
  'lindera:ja-ipadic-neologd': 'IPADIC Neologd',
  'lindera:ja-unidic': 'UniDic',
  'lindera:ko-dic': 'ko-dic',
};

export const isTopicEmbeddingModel = (value: unknown): value is TopicEmbeddingModel =>
  value === ENGLISH_EMBEDDING_MODEL || value === MULTILINGUAL_EMBEDDING_MODEL;

export const embeddingModelTokenLimit = (model: TopicEmbeddingModel): number =>
  EMBEDDING_MODEL_TOKEN_LIMITS[model];

/** The display name of a Chinese, Japanese or Korean tokeniser, or null for any other. */
const cjkTokenizerLabel = (tokenizerModel: string | null | undefined): string | null =>
  tokenizerModel ? (CJK_TOKENIZER_LABELS[tokenizerModel] ?? null) : null;

export interface CjkTokenizerSource {
  /** The Data Block's name. */
  name: string;
  /** The tokeniser's display name. */
  tokenizer: string;
}

/**
 * The first selected Data Block whose attached tokeniser is a Chinese,
 * Japanese or Korean one: the reason the multilingual model is the default.
 */
export function cjkTokenizerSource(
  nodes: readonly { name?: string | null; tokenizerModel?: string | null }[],
): CjkTokenizerSource | null {
  for (const node of nodes) {
    const tokenizer = cjkTokenizerLabel(node.tokenizerModel);
    if (tokenizer) return { name: node.name ?? 'This Data Block', tokenizer };
  }
  return null;
}

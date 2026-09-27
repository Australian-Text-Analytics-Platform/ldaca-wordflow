import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import contract from '../../../backend/openapi.json';

const ajv = new Ajv2020({ strict: false, validateFormats: false });
const schema = (name: string) =>
  ajv.compile({
    components: contract.components,
    $ref: `#/components/schemas/${name}`,
  });
describe('native OpenAPI contracts', () => {
  it('has unique operation IDs, resolved references and matching path parameters', () => {
    const ids = new Set<string>();
    for (const [path, methods] of Object.entries(contract.paths)) {
      for (const operation of Object.values(methods)) {
        expect(ids.has(operation.operationId)).toBe(false);
        ids.add(operation.operationId);
        const parameters = 'parameters' in operation ? operation.parameters : [];
        const actual = parameters
          .filter((p) => p.in === 'path')
          .map((p) => p.name)
          .sort();
        expect(actual).toEqual([...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).sort());
      }
    }
    // This guards accidental route omission during the initial cutover.
    expect(ids.size).toBe(110);
    const refs = JSON.stringify(contract).matchAll(/"\$ref":"([^"]+)"/g);
    for (const [, ref] of refs) {
      expect(ref?.startsWith('#/components/schemas/')).toBe(true);
      expect(contract.components.schemas).toHaveProperty(ref?.split('/').at(-1) ?? '');
    }
  });
  it('distinguishes nullable output from optional/defaulted input', () => {
    const status = schema('ProjectStatus');
    expect(status({ project: null })).toBe(true);
    expect(status({})).toBe(false);
    const patch = schema('CellEditPatch');
    expect(patch({ row_ref: '1', column: 'text', value: null })).toBe(true);
    expect(patch({ row_ref: '1', column: 'text' })).toBe(false);
    const search = schema('ConcordanceSearch');
    expect(search({})).toBe(true);
    expect(search({ regex: 'false' })).toBe(false);
    expect(search({ unexpected: true })).toBe(false);
    expect(
      schema('Analysis')({
        id: 'id',
        tab_id: 'tab',
        kind: 'frequency',
        request: { future: true },
        created_at: 'date',
        result: null,
      }),
    ).toBe(true);
  });
  it('describes flattened structs, tagged unions and recursive expressions', () => {
    expect(
      schema('ConnectionInfo')({
        id: 'id',
        revision: 'revision',
        name: 'local',
        provider: 'custom',
        endpoint: null,
        credential_mode: 'none',
        has_credential: false,
        credential_error: null,
        built_in: false,
      }),
    ).toBe(true);
    expect(schema('SqlRequest')({ task_label: 'Query', statements: [{ sql: 'SELECT 1' }] })).toBe(
      true,
    );
    expect(
      schema('ParsedExpression')({
        sql: 'a + 1',
        kind: 'operator',
        name: '+',
        children: [
          { sql: 'a', kind: 'column', names: ['a'] },
          { sql: '1', kind: 'literal', literal_type: 'number', value: '1' },
        ],
      }),
    ).toBe(true);
    expect(
      schema('ColumnChange')({ operation: 'cast', column: 'date', target: { sqlType: 'DATE' } }),
    ).toBe(true);
  });
  it('retains exact strings, fixed tuples and versioned payload schemas', () => {
    const corpus = {
      source: { name: '資料', schema: 'data' },
      column: 'text',
      tokenizer: 'english',
      label: 'Source',
      color: null,
      artifact_id: 'id',
      document_count: '9007199254740993',
      total_tokens: '9007199254740994',
      vocabulary_size: '3',
    };
    expect(schema('FrequencyResultV1')({ corpora: [corpus], comparison_artifact_id: null })).toBe(
      true,
    );
    expect(
      schema('FrequencyResultV1')({
        corpora: [{ ...corpus, total_tokens: 3 }],
        comparison_artifact_id: null,
      }),
    ).toBe(false);
    expect(
      schema('TopicProjection')({
        projection: 'map',
        topics: [],
        activations: [[0, 1, 2, 3]],
        has_outlier: false,
      }),
    ).toBe(true);
    expect(
      schema('TopicPreviewUpdate')({
        state: 'failed',
        preview_id: 'id',
        error: { code: 'failed', message: 'Failure' },
      }),
    ).toBe(true);
    expect(schema('PlotRequest')({ source: { name: 'a' }, x: 'x', y: 'y' })).toBe(true);
  });
});

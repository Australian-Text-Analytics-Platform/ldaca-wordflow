import { Field, FixedSizeList, Float64, Int64, Struct, Utf8 } from 'apache-arrow';
import { describe, expect, it } from 'vitest';

import type { WorkspaceNodeMetadata } from '@/features/workspace/common/workspaceNodeMetadata';
import { TOPIC_COVERAGE_EXTENSION } from '@/lib/arrow/semanticTypes';
import { useConcordanceMetadataColumns } from '../useConcordanceMetadataColumns';

const coverage = new Field(
  'TOPIC_coverage',
  new FixedSizeList(
    2,
    new Field(
      'item',
      new Struct([new Field('topic_id', new Int64()), new Field('coverage', new Float64())]),
    ),
  ),
  true,
  new Map([['ARROW:extension:name', TOPIC_COVERAGE_EXTENSION]]),
);

describe('useConcordanceMetadataColumns', () => {
  it('leaves topic coverage out of the metadata offered before a run (issue 200)', () => {
    const node = { id: 'n1', name: 'Topics' } as WorkspaceNodeMetadata;
    const columns = useConcordanceMetadataColumns({
      results: null,
      panelSelectedNodes: [node],
      effectiveNodeColumnSelections: [{ nodeId: 'n1', column: 'text' }],
      getColumnInfos: () => [
        { name: 'text', field: new Field('text', new Utf8()) },
        { name: 'party', field: new Field('party', new Utf8()) },
        { name: 'TOPIC_coverage', field: coverage },
      ],
      viewMode: 'separated',
      nodeColors: {},
      resolveNodeIdForKey: () => 'n1',
    });

    expect(columns.availableMetadataColumns).toEqual(['party']);
  });
});

import { describe, expect, it } from 'vitest';
import { renderPreview, type PreviewModel } from './render';

const model: PreviewModel = {
  filename: 'Example.wfpj',
  file_size: '24.8 MB',
  modified: '18 Sep 2026 at 10:30 am',
  saved_sql_cells: 3,
  nodes: [
    {
      table_name: 'source',
      kind: 'Table',
      column_count: 2,
      color: '#AABBCC',
      columns: [
        { name: 'id', type: 'BIGINT' },
        { name: 'price', type: 'DECIMAL(18,4)' },
      ],
    },
    {
      table_name: 'view',
      kind: 'View',
      column_count: 1,
      columns: [{ name: 'text', type: 'VARCHAR' }],
    },
    { table_name: 'missing', columns: [] },
  ],
};

describe('Quick Look project summary', () => {
  it('renders compact counts and collapsed column disclosures without data or a graph', () => {
    const view = renderPreview(model);
    document.body.innerHTML = view;
    expect(document.querySelector('h1')).toHaveTextContent('Example.wfpj');
    expect(document.querySelector('.file-details')).toHaveTextContent(
      '24.8 MB · Modified 18 Sep 2026 at 10:30 am',
    );
    expect(document.querySelector('.summary')).toHaveTextContent(
      '3 Data Blocks · 1 View · 1 Table · 1 unavailable · 3 saved SQL cells',
    );
    const disclosures = [...document.querySelectorAll('details')];
    expect(disclosures).toHaveLength(2);
    expect(disclosures.every((details) => !details.open)).toBe(true);
    expect(disclosures[0].querySelector('summary')).toHaveTextContent('source Table 2 columns');
    expect(disclosures[0].querySelectorAll('tbody th')[0]).toHaveTextContent('id');
    expect(disclosures[0].querySelectorAll('tbody th')[1]).toHaveTextContent('price');
    expect(view).toContain('DECIMAL(18,4)');
    expect(view).toContain('--node-color:#aabbcc');
    expect(view).toContain('This registered object is missing from the database.');
    expect(view).not.toMatch(/Rows:|<script|<canvas|<svg width=|graph|https?:\/\//);
    expect(renderPreview(model)).toBe(view);
  });

  it('escapes all metadata and validates identity colours', () => {
    const view = renderPreview({
      filename: '<script>oops</script>.wfpj',
      file_size: '<img src=x>',
      modified: '<b>date</b>',
      description: '<img src="https://example.com">',
      nodes: [
        {
          table_name: '__proto__<b>"&',
          kind: 'Table',
          column_count: 1,
          color: 'red;background:url(https://example.com)',
          columns: [{ name: 'x<script>', type: 'STRUCT("<name>" VARCHAR)' }],
        },
      ],
    });
    expect(view).toContain('&lt;script&gt;');
    expect(view).toContain('&lt;b&gt;&quot;&amp;');
    expect(view).toContain('STRUCT(&quot;&lt;name&gt;&quot; VARCHAR)');
    expect(view).not.toMatch(/<script>|<img |background:url\(/);
  });

  it('keeps file details in unavailable states and never fabricates zero content counts', () => {
    for (const message of [
      'Project is currently in use.',
      'This file is not a supported Wordflow project.',
      'Unable to read this project. Open it in Wordflow for details.',
    ]) {
      const view = renderPreview({ ...model, nodes: [], message });
      expect(view).toContain(message);
      expect(view).toContain('24.8 MB');
      expect(view).not.toMatch(/0 Data Blocks|saved SQL|<details/);
    }
    const view = renderPreview({ filename: 'Empty.wfpj', nodes: [], saved_sql_cells: 2 });
    expect(view).toContain('No visible Data Blocks.');
    expect(view).toContain('2 saved SQL cells');
    expect(view).not.toMatch(/0 Views|0 Tables|0 unavailable/);
  });

  it('preserves full Unicode names and schema order in a responsive document', () => {
    const name = '研究者のデータ_'.repeat(30);
    const nodes = Array.from({ length: 40 }, (_, index) => ({
      table_name: `${name}${String(index)}`,
      kind: 'View',
      column_count: 1,
      columns: [{ name: name + 'column', type: 'TIMESTAMP WITH TIME ZONE' }],
    }));
    const view = renderPreview({ filename: '研究.wfpj', nodes });
    expect(view).toContain(`${name}39`);
    expect(view.indexOf(`${name}0`)).toBeLessThan(view.indexOf(`${name}1`));
    expect(view).toContain('overflow-wrap:anywhere');
    expect(view).toContain('@media(max-width:560px)');
    expect(view).not.toMatch(/NaN|undefined|position:absolute/);
  });
});
